"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, FileUp, Link2, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";

import { Badge, Button, Modal } from "@/components/ui";
import type { GameRow } from "@/lib/domain/games";
import {
  matchPlayers,
  resolution,
  skippedKeys,
  summarise,
  type PlayerMatch,
  type RosterPlayer,
} from "@/lib/import/match";
import { parseSource, roundsIn } from "@/lib/import/parse";
import {
  ISSUE,
  canApply,
  planRound,
  type ExistingGame,
  type ImportIssue,
} from "@/lib/import/plan";
import { fingerprint, normalizeSourceUrl, untilNext } from "@/lib/import/source";
import {
  deleteExternalSource,
  fetchExternalSource,
  importRound,
  listExternalMappings,
  recordSourceSync,
  saveExternalMapping,
  saveExternalSource,
  type ExternalSource,
  type ImportSummary,
} from "@/lib/supabase/externalSources";
import type { ExternalSourcesState } from "@/lib/supabase/useExternalSources";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SKIP = "__skip__";

const INTERVALS = [
  { value: 0, label: "Manual" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
];

type Mode = "url" | "file" | "paste";

export interface ImportRosterEntry extends RosterPlayer {
  /** Shown beside a name so two people called the same thing can be told apart. */
  label: string;
}

/**
 * Import / Sync: bring pairings and results in from another system.
 *
 * Nothing here applies anything on its own. The flow is fetch → parse → match players → preview →
 * apply, and the preview is the point: it says what was found, who it thinks each person is, what
 * looks wrong, and exactly which official results would change. A person reads it and presses
 * Apply, and the database re-checks the part that matters and applies the whole round or none of
 * it.
 */
export function ImportSyncDialog({
  open,
  onClose,
  eventId,
  roster,
  games,
  categories,
  who,
  canOverride,
  sources,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  roster: ImportRosterEntry[];
  games: GameRow[];
  categories: { id: string; name: string }[];
  who: string;
  canOverride: boolean;
  sources: ExternalSourcesState;
  onApplied: () => void;
}) {
  const [tab, setTab] = React.useState<"import" | "sources">("import");
  const [mode, setMode] = React.useState<Mode>("url");
  const [url, setUrl] = React.useState("");
  const [pasted, setPasted] = React.useState("");

  const [text, setText] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");
  const [sourceId, setSourceId] = React.useState<string | null>(null);
  const [userRound, setUserRound] = React.useState<number | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<ImportSummary | null>(null);

  const [choices, setChoices] = React.useState<Map<string, string | null>>(new Map());
  const [saved, setSaved] = React.useState<Map<string, string>>(new Map());
  const [showAll, setShowAll] = React.useState(false);
  const [allowNotCheckedIn, setAllowNotCheckedIn] = React.useState(false);
  const [applyCorrections, setApplyCorrections] = React.useState(false);

  /* Confirmations from earlier imports, so round 2 does not ask round 1's questions again. */
  React.useEffect(() => {
    if (!open || !eventId) return;
    let alive = true;
    (async () => {
      const map = await listExternalMappings(eventId);
      if (alive) setSaved(map);
    })();
    return () => {
      alive = false;
    };
  }, [open, eventId, done]);

  const reset = () => {
    setText(null);
    setOrigin("");
    setSourceId(null);
    setUserRound(null);
    setChoices(new Map());
    setShowAll(false);
    setAllowNotCheckedIn(false);
    setApplyCorrections(false);
    setError(null);
    setDone(null);
  };

  const close = () => {
    reset();
    setPasted("");
    onClose();
  };

  /* ---- Existing games, in the shape the planner reads ------------------------ */
  const existing: ExistingGame[] = React.useMemo(
    () =>
      games.map((g) => ({
        round: g.round,
        board: g.board,
        division: g.division,
        playerA: g.playerA,
        playerB: g.playerB,
        scoreA: g.scoreA,
        scoreB: g.scoreB,
        status: g.status,
      })),
    [games],
  );

  /*
   * The round this probably is: the latest one if it still has boards waiting for a score
   * (results are arriving), otherwise the next one (pairings are).
   */
  const suggestedRound = React.useMemo(() => {
    const latest = games.reduce((m, g) => Math.max(m, g.round), 0);
    if (latest === 0) return 1;
    const open = games.some((g) => g.round === latest && g.playerB !== null && g.status !== "verified");
    return open ? latest : latest + 1;
  }, [games]);

  /* ---- Parse, match, plan ------------------------------------------------------ */
  const parsed = React.useMemo(
    () => (text === null ? null : parseSource(text, { defaultRound: userRound ?? suggestedRound })),
    [text, userRound, suggestedRound],
  );

  const roundsFound = React.useMemo(() => (parsed ? roundsIn(parsed) : []), [parsed]);
  const round = userRound ?? (roundsFound.length ? roundsFound[roundsFound.length - 1] : suggestedRound);

  const matches: PlayerMatch[] = React.useMemo(() => {
    if (!parsed) return [];
    const refs = parsed.matches
      .filter((m) => m.round === round)
      .flatMap((m) => (m.b ? [m.a, m.b] : [m.a]));
    return matchPlayers(refs, roster, saved);
  }, [parsed, round, roster, saved]);

  const resolved = React.useMemo(() => resolution(matches, choices), [matches, choices]);

  const plan = React.useMemo(
    () =>
      parsed
        ? planRound({
            round,
            matches: parsed.matches,
            resolved,
            roster,
            categories,
            existing,
            skipped: skippedKeys(choices),
            options: { allowNotCheckedIn },
          })
        : null,
    [parsed, round, resolved, roster, categories, existing, choices, allowNotCheckedIn],
  );

  const counts = summarise(matches, choices);
  const parseBlocking = parsed?.warnings.filter((w) => w.level === "error") ?? [];
  const issues: ImportIssue[] = [
    ...parseBlocking.map((w) => ({ level: "error" as const, code: "SOURCE PROBLEM", message: w.message, blocking: true, overridable: false })),
    ...(parsed?.warnings.filter((w) => w.level === "warn") ?? []).map((w) => ({
      level: "warn" as const,
      code: "SOURCE NOTE",
      message: w.message,
      blocking: false,
      overridable: false,
    })),
    ...(plan?.issues ?? []),
  ];

  const changes = plan?.changes ?? [];
  const ready =
    !!plan && canApply(plan) && parseBlocking.length === 0 && (changes.length === 0 || applyCorrections) && !busy;

  const hasNotCheckedIn = issues.some((i) => i.code === ISSUE.notCheckedIn);

  /* ---- Getting a source in ------------------------------------------------------- */
  const load = (body: string, label: string, id: string | null = null, forRound: number | null = null) => {
    reset();
    setText(body);
    setOrigin(label);
    setSourceId(id);
    setUserRound(forRound);
    setTab("import");
  };

  const fetchUrl = async (raw: string, id: string | null = null, forRound: number | null = null) => {
    const target = normalizeSourceUrl(raw);
    if (!target) return;
    setBusy(true);
    setError(null);
    const result = await fetchExternalSource(target);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    load(result.text, target, id, forRound);
  };

  const readFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is larger than 2 MB, which is more than a results table needs.");
      return;
    }
    setError(null);
    load(await file.text(), file.name);
  };

  /* ---- Applying ------------------------------------------------------------------ */
  const apply = async () => {
    if (!plan || !ready) return;
    setBusy(true);
    setError(null);

    const result = await importRound({
      eventId,
      round,
      boards: plan.boards,
      by: who,
      applyCorrections,
    });

    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }

    /* Everything a person confirmed is kept, so the next round starts knowing it. */
    await Promise.all(
      [...choices]
        .filter((entry): entry is [string, string] => entry[1] !== null)
        .map(([key, recordId]) =>
          saveExternalMapping({
            eventId,
            key,
            name: matches.find((m) => m.ref.key === key)?.ref.name ?? key,
            recordId,
            by: who,
          }),
        ),
    );

    if (sourceId && text !== null) await recordSourceSync(sourceId, "ok", null, fingerprint(text));

    setBusy(false);
    setDone(result.summary);
    sources.reload();
    onApplied();
  };

  const setChoice = (key: string, value: string) =>
    setChoices((previous) => {
      const next = new Map(previous);
      if (value === "") next.delete(key);
      else next.set(key, value === SKIP ? null : value);
      return next;
    });

  const rosterOptions = React.useMemo(
    () => [...roster].sort((a, b) => a.name.localeCompare(b.name, "en")),
    [roster],
  );

  /* ---- Render ---------------------------------------------------------------------- */
  const deciding = tab === "import" && !done && text !== null && !!parsed && !!plan;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import / Sync"
      subtitle="Bring pairings and results in from another system. Nothing is applied until you confirm."
      size="lg"
      footer={
        deciding ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-muted" aria-live="polite">
              {ready
                ? "Ready to apply."
                : changes.length > 0 && !applyCorrections && plan && canApply(plan)
                  ? "Tick APPLY CORRECTION to replace the official results."
                  : "Resolve the items marked above to continue."}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset} disabled={busy}>
                CANCEL
              </Button>
              <Button variant="primary" onClick={() => void apply()} disabled={!ready}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy ? "Applying…" : changes.length > 0 ? "APPLY CORRECTION" : "APPLY"}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="mb-4 flex gap-1 rounded-control bg-[rgb(var(--c-surface-soft))] p-1" role="tablist">
        {(
          [
            ["import", "Import"],
            ["sources", `Sources${sources.sources.length ? ` (${sources.sources.length})` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 rounded-control px-3 py-2 text-[13.5px] font-bold",
              tab === id ? "bg-[rgb(var(--c-surface))] shadow-sm" : "text-muted",
            )}
          >
            {label}
            {id === "sources" && sources.changed > 0 ? (
              <span className="ml-1.5 inline-block size-2 rounded-full bg-warning align-middle" />
            ) : null}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mb-3 rounded-control bg-critical-050 px-3.5 py-3 text-[13px] text-critical" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "sources" ? (
        <SourcesTab
          eventId={eventId}
          sources={sources}
          busy={busy}
          onLoad={(s) => void fetchUrl(s.url, s.id, s.round)}
        />
      ) : done ? (
        <DonePanel round={round} summary={done} onAgain={reset} onClose={close} />
      ) : text === null || !parsed || !plan ? (
        <InputPanel
          mode={mode}
          setMode={setMode}
          url={url}
          setUrl={setUrl}
          pasted={pasted}
          setPasted={setPasted}
          busy={busy}
          onFetch={() => void fetchUrl(url)}
          onFile={(f) => void readFile(f)}
          onParse={() => load(pasted, "Pasted table")}
        />
      ) : (
        <div className="space-y-4">
          {/* ---- What was found ---------------------------------------------- */}
          <section className="rounded-control border border-line p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">Round {round} import</p>
                <p className="truncate text-[12px] text-faint" title={origin}>
                  {origin}
                </p>
              </div>
              <label className="flex items-center gap-2 text-[13px] font-semibold">
                Round
                <select
                  value={round}
                  onChange={(e) => {
                    setUserRound(Number(e.target.value));
                    setChoices(new Map());
                  }}
                  className="rounded-control border border-line bg-[rgb(var(--c-surface))] px-2.5 py-1.5"
                >
                  {[...new Set([...roundsFound, suggestedRound, round, ...Array.from({ length: 8 }, (_, i) => i + 1)])]
                    .sort((a, b) => a - b)
                    .map((r) => (
                      <option key={r} value={r}>
                        Round {r}
                        {roundsFound.includes(r) ? "" : " (not in the source)"}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-4">
              <Fact label="Pairings" value={plan.counts.pairings} />
              <Fact label="Players" value={plan.counts.players} />
              <Fact label="Results" value={plan.counts.results} />
              <Fact label="Pending" value={plan.counts.pending} />
            </dl>

            <p className="mt-3 text-[13px] text-muted">
              <span className="font-semibold text-ink">Player mapping:</span> {counts.exact} exact · {counts.likely} likely ·{" "}
              {counts.unresolved} unresolved
            </p>
            <p className="mt-1 text-[13px] text-muted">
              <span className="font-semibold text-ink">Tables:</span> {plan.counts.tables} detected
              {plan.counts.categories.length ? (
                <>
                  {" · "}
                  <span className="font-semibold text-ink">Categories:</span> {plan.counts.categories.join(", ")}
                </>
              ) : null}
            </p>
            {parsed.standings.length > 0 ? (
              <p className="mt-1 text-[12.5px] text-muted">
                The source also lists {parsed.standings.length} standings. They are not applied — standings here are always worked
                out from the verified games.
              </p>
            ) : null}
          </section>

          {/* ---- Warnings ----------------------------------------------------- */}
          {issues.length > 0 ? (
            <section aria-label="Warnings" className="space-y-1.5">
              {issues.map((i, n) => (
                <div
                  key={`${i.code}-${n}`}
                  className={cn(
                    "flex gap-2.5 rounded-control border-l-4 px-3 py-2 text-[13px]",
                    i.blocking ? "border-critical bg-critical-050" : "border-warning bg-warning-050",
                  )}
                >
                  {i.blocking ? (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-critical" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#a76d16]" />
                  )}
                  <span className="min-w-0">
                    <span className="mr-2 text-[11px] font-extrabold tracking-wider">{i.code}</span>
                    {i.message}
                  </span>
                </div>
              ))}
            </section>
          ) : (
            <p className="flex items-center gap-2 text-[13px] font-semibold text-[#12855c]">
              <CheckCircle2 className="size-4" /> Nothing to flag.
            </p>
          )}

          {hasNotCheckedIn && canOverride ? (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-dashed border-line px-3 py-2.5">
              <input
                type="checkbox"
                checked={allowNotCheckedIn}
                onChange={(e) => setAllowNotCheckedIn(e.target.checked)}
                className="mt-0.5 size-4.5 accent-primary"
              />
              <span className="text-[13px]">
                <span className="font-bold">Allow players who are not checked in.</span> The desk decides who is here; use this
                only if you are sure.
              </span>
            </label>
          ) : null}

          {/* ---- Results that differ ------------------------------------------ */}
          {changes.length > 0 ? (
            <section className="rounded-control border border-warning bg-warning-050 p-3.5">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a76d16]">{ISSUE.resultChanged}</p>
              <ul className="mt-2 space-y-1.5">
                {changes.map((c) => (
                  <li key={c.board} className="text-[13.5px]">
                    <span className="font-bold">
                      Table {c.board}: {c.nameA}
                      {c.nameB ? ` v ${c.nameB}` : ""}
                    </span>
                    <span className="num mt-0.5 block text-[13px] text-muted">
                      Old: {c.old[0]}–{c.old[1]} <span className="mx-1">→</span> New:{" "}
                      <span className="font-bold text-ink">
                        {c.next[0]}–{c.next[1]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={applyCorrections}
                  onChange={(e) => setApplyCorrections(e.target.checked)}
                  className="mt-0.5 size-4.5 accent-primary"
                />
                <span className="text-[13px] font-semibold">
                  APPLY CORRECTION — replace the official result{changes.length > 1 ? "s" : ""} above. This is recorded in the audit
                  log.
                </span>
              </label>
            </section>
          ) : null}

          {/* ---- Who is who ---------------------------------------------------- */}
          <section>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-muted">Player mapping</h3>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-[12.5px] font-bold text-primary-600 hover:underline"
              >
                {showAll ? "Show only those needing a decision" : "Edit mapping"}
              </button>
            </div>

            <ul className="mt-2 divide-y divide-line rounded-control border border-line">
              {[...matches]
                .sort((a, b) => Number(b.status !== "exact") - Number(a.status !== "exact"))
                .filter((m) => showAll || m.status !== "exact" || choices.has(m.ref.key))
                .map((m) => (
                  <MappingRow
                    key={m.ref.key}
                    match={m}
                    chosen={choices.get(m.ref.key)}
                    hasChoice={choices.has(m.ref.key)}
                    roster={rosterOptions}
                    categories={categories}
                    onChoose={(value) => setChoice(m.ref.key, value)}
                  />
                ))}
              {matches.length > 0 && matches.every((m) => m.status === "exact") && !showAll ? (
                <li className="px-3.5 py-3 text-[13px] text-muted">
                  Every player matched a registration exactly.
                </li>
              ) : null}
            </ul>
          </section>

        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="num text-[22px] font-extrabold leading-tight">{value}</dd>
    </div>
  );
}

function MappingRow({
  match,
  chosen,
  hasChoice,
  roster,
  categories,
  onChoose,
}: {
  match: PlayerMatch;
  chosen: string | null | undefined;
  hasChoice: boolean;
  roster: ImportRosterEntry[];
  categories: { id: string; name: string }[];
  onChoose: (value: string) => void;
}) {
  const automatic = match.recordId ? roster.find((r) => r.id === match.recordId) : undefined;
  const value = hasChoice ? (chosen === null ? SKIP : (chosen ?? "")) : "";
  const suggested = match.candidates.filter((c) => roster.some((r) => r.id === c.id));

  const tone =
    hasChoice && chosen !== null
      ? "primary"
      : match.status === "exact"
        ? "success"
        : match.status === "likely"
          ? "warning"
          : "critical";
  const label =
    hasChoice && chosen !== null ? "Confirmed" : hasChoice ? "Left out" : match.status === "exact" ? "Exact match" : match.status === "likely" ? "Likely match" : "No match";

  return (
    <li className="grid gap-2 px-3.5 py-3 sm:grid-cols-[1fr_minmax(0,1.1fr)] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-bold">{match.ref.name}</p>
        <Badge tone={tone}>{label}</Badge>
        {match.status === "likely" && !hasChoice && match.candidates[0] ? (
          <p className="mt-1 text-[12px] text-muted">{match.candidates[0].reason}</p>
        ) : null}
      </div>

      <select
        value={value}
        onChange={(e) => onChoose(e.target.value)}
        aria-label={`Who is ${match.ref.name}`}
        className="w-full min-w-0 rounded-control border border-line bg-[rgb(var(--c-surface))] px-2.5 py-2 text-[13.5px]"
      >
        <option value="">
          {match.status === "exact" ? `Automatic — ${automatic?.label ?? automatic?.name ?? "matched"}` : "Choose who this is…"}
        </option>
        {suggested.length > 0 ? (
          <optgroup label="Suggested">
            {suggested.map((c) => {
              const r = roster.find((x) => x.id === c.id);
              return (
                <option key={`s-${c.id}`} value={c.id}>
                  {r?.label ?? c.name} — {c.reason}
                </option>
              );
            })}
          </optgroup>
        ) : null}
        <optgroup label="All registrations">
          {roster.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
              {r.division ? ` · ${categories.find((c) => c.id === r.division)?.name ?? r.division}` : ""}
            </option>
          ))}
        </optgroup>
        <option value={SKIP}>Leave this player out</option>
      </select>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

function InputPanel({
  mode,
  setMode,
  url,
  setUrl,
  pasted,
  setPasted,
  busy,
  onFetch,
  onFile,
  onParse,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  url: string;
  setUrl: (v: string) => void;
  pasted: string;
  setPasted: (v: string) => void;
  busy: boolean;
  onFetch: () => void;
  onFile: (f: File | null) => void;
  onParse: () => void;
}) {
  const modes: [Mode, string, React.ReactNode][] = [
    ["url", "Paste URL", <Link2 key="u" className="size-4" />],
    ["file", "Upload CSV", <FileUp key="f" className="size-4" />],
    ["paste", "Paste table", null],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {modes.map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            aria-pressed={mode === id}
            className={cn(
              "flex items-center justify-center gap-2 rounded-control border px-3 py-3 text-[13.5px] font-bold",
              mode === id ? "border-primary bg-primary-050 text-primary" : "border-line",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {mode === "url" ? (
        <div className="space-y-2.5">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… — a public results page, a CSV, or a published Google Sheet"
            inputMode="url"
            className="w-full rounded-control border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3 text-[15px] outline-none focus:border-primary"
            onKeyDown={(e) => e.key === "Enter" && url.trim() && onFetch()}
          />
          <Button variant="primary" onClick={onFetch} disabled={busy || !url.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? "Fetching…" : "FETCH"}
          </Button>
          <p className="text-[12.5px] leading-relaxed text-muted">
            The page must be public. It is read once, here, and shown to you before anything is applied.
          </p>
        </div>
      ) : mode === "file" ? (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-control border border-dashed border-line px-4 py-8 text-center">
          <FileUp className="size-6 text-primary" />
          <span className="text-[14px] font-semibold">Choose a CSV, TSV, HTML or JSON file</span>
          <span className="text-[12.5px] text-muted">Up to 2 MB</span>
          <input
            type="file"
            accept=".csv,.tsv,.txt,.html,.htm,.json,text/csv,text/plain,text/html,application/json"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <div className="space-y-2.5">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={9}
            placeholder={"Table\tPlayer\tOpponent\n1\tAhmed Khan\tHammad Ali\n2\tSara Khan\tBilal Raza"}
            className="w-full resize-y rounded-control border border-line bg-[rgb(var(--c-surface))] px-3.5 py-3 font-mono text-[13px] outline-none focus:border-primary"
          />
          <Button variant="primary" onClick={onParse} disabled={!pasted.trim()}>
            READ TABLE
          </Button>
          <p className="text-[12.5px] leading-relaxed text-muted">
            Copy the table from the other system, including its header row, and paste it here.
          </p>
        </div>
      )}
    </div>
  );
}

function DonePanel({
  round,
  summary,
  onAgain,
  onClose,
}: {
  round: number;
  summary: ImportSummary;
  onAgain: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 py-2 text-center">
      <CheckCircle2 className="mx-auto size-10 text-[#12855c]" />
      <div>
        <p className="text-[17px] font-extrabold">Round {round} imported</p>
        <p className="mt-1 text-[13.5px] text-muted">
          {summary.published ? "Pairings published. " : ""}
          {summary.recorded} result{summary.recorded === 1 ? "" : "s"} recorded
          {summary.corrected ? `, ${summary.corrected} corrected` : ""}
          {summary.unchanged ? `, ${summary.unchanged} already up to date` : ""}
          {summary.pending ? `, ${summary.pending} still pending` : ""}.
        </p>
        <p className="mt-2 text-[12.5px] text-muted">The public page and the television update by themselves.</p>
      </div>
      <div className="flex justify-center gap-2">
        <Button variant="secondary" onClick={onAgain}>
          Import another
        </Button>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sources                                                                     */
/* -------------------------------------------------------------------------- */

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round(((now || Date.now()) - Date.parse(iso)) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

function SourcesTab({
  eventId,
  sources,
  busy,
  onLoad,
}: {
  eventId: string;
  sources: ExternalSourcesState;
  busy: boolean;
  onLoad: (s: ExternalSource) => void;
}) {
  const [round, setRound] = React.useState<number | null>(null);
  const [url, setUrl] = React.useState("");
  const [interval, setIntervalSeconds] = React.useState(0);
  const [message, setMessage] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState<string | null>(null);

  const add = async () => {
    setMessage(null);
    const result = await saveExternalSource({ eventId, round, url: url.trim(), intervalSeconds: interval });
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setUrl("");
    sources.reload();
  };

  const check = async (s: ExternalSource) => {
    setChecking(s.id);
    const outcome = await sources.syncNow(s);
    setChecking(null);
    setMessage(
      !outcome.ok ? (outcome.message ?? "That check failed.") : outcome.changed ? "The source has changed since it was last applied." : "No change since it was last applied.",
    );
  };

  return (
    <div className="space-y-4">
      <p className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
        Automatic checks only look — they tell you a source has changed, and never apply it. They run while this
        page is open; nothing watches a source when it is closed.
      </p>

      {message ? <p className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-2.5 text-[13px]">{message}</p> : null}

      {sources.sources.length === 0 ? (
        <p className="py-4 text-center text-[13.5px] text-muted">No sources yet. Add one below.</p>
      ) : (
        <ul className="space-y-2.5">
          {sources.sources.map((s) => {
            /* `now` is zero until the first tick, and a countdown is not worth inventing a time for. */
            const next = sources.now
              ? untilNext(s.lastAttemptAt ? Date.parse(s.lastAttemptAt) : null, s.intervalSeconds, sources.now)
              : null;
            return (
              <li key={s.id} className="rounded-control border border-line p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px] font-bold">{s.round ? `Round ${s.round}` : "All rounds"}</p>
                  <Badge tone={s.status === "ok" ? "success" : s.status === "changes" ? "warning" : s.status === "error" ? "critical" : "neutral"}>
                    {s.status === "ok" ? "Success" : s.status === "changes" ? "Changed at source" : s.status === "error" ? "Error" : "Not synced yet"}
                  </Badge>
                </div>
                <p className="mt-1 break-all font-mono text-[12px] text-faint">{s.url}</p>
                <p className="mt-1.5 text-[12.5px] text-muted">
                  Last sync {ago(s.lastSyncedAt, sources.now)}
                  {next ? ` · Next sync ${next}` : " · Manual"}
                </p>
                {s.status === "error" && s.error ? <p className="mt-1 text-[12.5px] text-critical">{s.error}</p> : null}

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Button variant="primary" onClick={() => onLoad(s)} disabled={busy}>
                    Load into import
                  </Button>
                  <Button variant="secondary" onClick={() => void check(s)} disabled={checking === s.id}>
                    {checking === s.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    Check now
                  </Button>
                  <select
                    value={s.intervalSeconds}
                    onChange={async (e) => {
                      await saveExternalSource({ eventId, id: s.id, round: s.round, url: s.url, intervalSeconds: Number(e.target.value) });
                      sources.reload();
                    }}
                    aria-label="Automatic check"
                    className="rounded-control border border-line bg-[rgb(var(--c-surface))] px-2.5 py-2 text-[13px]"
                  >
                    {INTERVALS.map((i) => (
                      <option key={i.value} value={i.value}>
                        {i.value === 0 ? "Manual" : `Every ${i.label}`}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await deleteExternalSource(s.id);
                      sources.reload();
                    }}
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-control border border-dashed border-line p-3.5">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-muted">Add a source</p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-[9rem_1fr_9rem]">
          <select
            value={round ?? ""}
            onChange={(e) => setRound(e.target.value ? Number(e.target.value) : null)}
            aria-label="Round"
            className="rounded-control border border-line bg-[rgb(var(--c-surface))] px-2.5 py-2.5 text-[14px]"
          >
            <option value="">All rounds</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => (
              <option key={r} value={r}>
                Round {r}
              </option>
            ))}
          </select>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            inputMode="url"
            className="rounded-control border border-line bg-[rgb(var(--c-surface))] px-3 py-2.5 text-[14px]"
          />
          <select
            value={interval}
            onChange={(e) => setIntervalSeconds(Number(e.target.value))}
            aria-label="Automatic check"
            className="rounded-control border border-line bg-[rgb(var(--c-surface))] px-2.5 py-2.5 text-[14px]"
          >
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.value === 0 ? "Manual" : `Every ${i.label}`}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2.5">
          <Button variant="primary" onClick={() => void add()} disabled={!url.trim()}>
            Add source
          </Button>
        </div>
      </div>
    </div>
  );
}
