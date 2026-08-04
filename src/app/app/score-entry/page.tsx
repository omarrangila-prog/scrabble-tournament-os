"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Keyboard,
  ScanLine,
  Smartphone,
  Upload,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  SearchInput,
  Tabs,
  TableWrap,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { useStore } from "@/lib/store/useStore";
import { Pairing } from "@/lib/domain/types";
import { cn, formatTime } from "@/lib/utils";
import { ResultSlip } from "@/components/score/ResultSlip";

const TABS = [
  { id: "fast", label: "Fast Entry" },
  { id: "board", label: "Board Form" },
  { id: "mobile", label: "Mobile Submissions" },
  { id: "ocr", label: "Result Sheet OCR" },
];

export default function ScoreEntryPage() {
  const store = useStore();
  const { tournament, players, pairings, submissions } = store;
  const [tab, setTab] = React.useState("fast");
  const [query, setQuery] = React.useState("");
  const [slipPairing, setSlipPairing] = React.useState<Pairing | null>(null);
  const [mismatch, setMismatch] = React.useState<Pairing | null>(null);
  const [correcting, setCorrecting] = React.useState<Pairing | null>(null);

  const round = tournament.currentRound;
  const roundPairings = React.useMemo(
    () =>
      pairings
        .filter((p) => p.round === round && p.playerBId !== null)
        .sort((a, b) => a.board - b.board),
    [pairings, round],
  );

  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";

  const filtered = roundPairings.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      String(p.board) === q.trim() ||
      nameOf(p.playerAId).toLowerCase().includes(q) ||
      nameOf(p.playerBId).toLowerCase().includes(q)
    );
  });

  const verified = roundPairings.filter((p) => p.status === "verified").length;
  const pending = roundPairings.filter((p) => p.status === "awaiting-verification").length;
  const live = roundPairings.filter((p) => p.status === "live").length;

  // The seeded mismatch lives on board 22.
  const mismatchBoard = roundPairings.find((p) => p.board === 22);
  const mismatchSubs = submissions.filter((s) => s.pairingId === mismatchBoard?.id);
  const hasMismatch =
    mismatchSubs.length === 2 &&
    (mismatchSubs[0].scoreA !== mismatchSubs[1].scoreA ||
      mismatchSubs[0].scoreB !== mismatchSubs[1].scoreB);

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Score Entry"
        badge={<Badge tone="primary">Round {round}</Badge>}
        subtitle="Enter, validate and verify results. Standings recalculate the moment a result is verified."
        actions={
          <Button
            variant="secondary"
            icon={<ScanLine className="size-4" />}
            onClick={() => setTab("ocr")}
          >
            Scan result sheet
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Boards" value={roundPairings.length} />
        <MiniStat label="Still playing" value={live} tone="info" />
        <MiniStat label="Awaiting verification" value={pending} tone="warning" />
        <MiniStat label="Verified" value={verified} tone="success" />
      </div>

      {hasMismatch ? (
        <Card className="mb-4 border-critical/30 bg-critical-050/40">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <span className="grid size-10 shrink-0 place-items-center rounded-control bg-critical/12 text-critical">
              <AlertTriangle className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">Score mismatch detected.</p>
              <p className="mt-0.5 text-[13px] text-muted">
                Board {mismatchBoard?.board} — both players submitted a result, but the losing
                score differs ({mismatchSubs[0].scoreA}–{mismatchSubs[0].scoreB} versus{" "}
                {mismatchSubs[1].scoreA}–{mismatchSubs[1].scoreB}).
              </p>
            </div>
            <Button variant="danger" onClick={() => setMismatch(mismatchBoard ?? null)}>
              Resolve mismatch
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tabs tabs={TABS} value={tab} onChange={setTab} className="flex-1" />
      </div>

      {tab === "fast" ? (
        <FastEntryTable
          pairings={filtered}
          query={query}
          onQuery={setQuery}
          onSlip={setSlipPairing}
          onCorrect={setCorrecting}
        />
      ) : null}

      {tab === "board" ? <BoardForm onSlip={setSlipPairing} /> : null}
      {tab === "mobile" ? <MobileSubmissions onResolve={setMismatch} /> : null}
      {tab === "ocr" ? <OcrPanel /> : null}

      {/* Result slip */}
      <Drawer
        open={!!slipPairing}
        onClose={() => setSlipPairing(null)}
        title={`Board ${slipPairing?.board} result slip`}
        subtitle={`Round ${round} · ${slipPairing?.division}`}
        width="md"
      >
        {slipPairing ? <ResultSlip pairing={slipPairing} /> : null}
      </Drawer>

      <MismatchModal pairing={mismatch} onClose={() => setMismatch(null)} />
      <CorrectionModal pairing={correcting} onClose={() => setCorrecting(null)} />
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "info" | "warning" | "success";
}) {
  return (
    <div className="glass rounded-compact px-4 py-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[21px] font-semibold num",
          tone === "success" && "text-[#1b8f68]",
          tone === "warning" && "text-[#b4741f]",
          tone === "info" && "text-[#2b7fd4]",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fast keyboard entry                                                         */
/* -------------------------------------------------------------------------- */

function FastEntryTable({
  pairings,
  query,
  onQuery,
  onSlip,
  onCorrect,
}: {
  pairings: Pairing[];
  query: string;
  onQuery: (v: string) => void;
  onSlip: (p: Pairing) => void;
  onCorrect: (p: Pairing) => void;
}) {
  const store = useStore();
  const players = store.players;
  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";

  // Local buffer so typing never fights the store.
  const [draft, setDraft] = React.useState<Record<string, { a: string; b: string }>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const rowRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const valueFor = (p: Pairing, side: "a" | "b") => {
    const d = draft[p.id];
    if (d) return side === "a" ? d.a : d.b;
    const v = side === "a" ? p.scoreA : p.scoreB;
    return v === undefined ? "" : String(v);
  };

  const setValue = (p: Pairing, side: "a" | "b", value: string) => {
    setDraft((s) => ({
      ...s,
      [p.id]: {
        a: side === "a" ? value : (s[p.id]?.a ?? (p.scoreA !== undefined ? String(p.scoreA) : "")),
        b: side === "b" ? value : (s[p.id]?.b ?? (p.scoreB !== undefined ? String(p.scoreB) : "")),
      },
    }));
  };

  const submitRow = (p: Pairing) => {
    const d = draft[p.id];
    const a = Number(d?.a ?? p.scoreA);
    const b = Number(d?.b ?? p.scoreB);

    if (d?.a === "" || d?.b === "" || Number.isNaN(a) || Number.isNaN(b)) {
      setErrors((e) => ({ ...e, [p.id]: "Both scores must be numbers." }));
      return;
    }
    if (a < 0 || b < 0 || a > 900 || b > 900) {
      setErrors((e) => ({ ...e, [p.id]: "Scores must be between 0 and 900." }));
      return;
    }
    if (p.status === "verified") {
      setErrors((e) => ({ ...e, [p.id]: "This result is already verified. Use a correction." }));
      return;
    }

    setErrors((e) => {
      const next = { ...e };
      delete next[p.id];
      return next;
    });

    if (!store.requireCapability("scores.enter")) return;

    // Unusually high or low totals are flagged rather than blocked.
    const unusual = a + b > 1100 || a + b < 400;
    store.submitScore(p.id, a, b, { verify: true });
    store.toast({
      title: `Board ${p.board} verified`,
      description: unusual
        ? `${a} – ${b} recorded. This total is unusual and has been flagged for review.`
        : `${a} – ${b} recorded. Standings have been updated.`,
      tone: unusual ? "warning" : "success",
    });

    setDraft((s) => {
      const next = { ...s };
      delete next[p.id];
      return next;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number, p: Pairing) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitRow(p);
      const next = pairings[index + 1];
      if (next) rowRefs.current[`${next.id}-a`]?.focus();
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = pairings[index + 1];
      if (next) rowRefs.current[`${next.id}-a`]?.focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = pairings[index - 1];
      if (prev) rowRefs.current[`${prev.id}-a`]?.focus();
    }
  };

  return (
    <Card data-tour="score-table">
      <CardHeader
        title="Fast score entry"
        subtitle="Tab moves across fields · Enter submits and advances · Arrow keys move between boards"
        icon={<Keyboard className="size-4.5" />}
        action={
          <SearchInput
            value={query}
            onChange={onQuery}
            placeholder="Board or player"
            className="w-44"
          />
        }
      />
      <div className="px-3 pb-4">
        <TableWrap className="max-h-[62vh]">
          <thead>
            <tr>
              <Th className="w-16">Board</Th>
              <Th>Player A</Th>
              <Th className="w-24">Score A</Th>
              <Th>Player B</Th>
              <Th className="w-24">Score B</Th>
              <Th className="w-28">Winner</Th>
              <Th className="w-20">Spread</Th>
              <Th className="w-32">Status</Th>
              <Th className="w-32">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {pairings.map((p, i) => {
              const a = valueFor(p, "a");
              const b = valueFor(p, "b");
              const na = Number(a);
              const nb = Number(b);
              const complete = a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb);
              const winner = complete
                ? na > nb
                  ? nameOf(p.playerAId)
                  : nb > na
                    ? nameOf(p.playerBId)
                    : "Tie"
                : "—";
              const spread = complete ? Math.abs(na - nb) : null;
              const err = errors[p.id];

              return (
                <tr
                  key={p.id}
                  className={cn(
                    "hover:bg-[rgb(var(--c-surface-soft))]",
                    err && "bg-critical-050/40",
                    p.status === "verified" && "bg-success-050/25",
                  )}
                >
                  <Td className="num font-semibold">{p.board}</Td>
                  <Td className="max-w-[160px] truncate">{nameOf(p.playerAId)}</Td>
                  <Td>
                    <Input
                      ref={(el) => {
                        rowRefs.current[`${p.id}-a`] = el;
                      }}
                      value={a}
                      onChange={(e) => setValue(p, "a", e.target.value)}
                      onKeyDown={(e) => onKeyDown(e, i, p)}
                      inputMode="numeric"
                      aria-label={`Score for ${nameOf(p.playerAId)}`}
                      invalid={!!err}
                      className="h-9 w-20 text-center num"
                    />
                  </Td>
                  <Td className="max-w-[160px] truncate">{nameOf(p.playerBId)}</Td>
                  <Td>
                    <Input
                      value={b}
                      onChange={(e) => setValue(p, "b", e.target.value)}
                      onKeyDown={(e) => onKeyDown(e, i, p)}
                      inputMode="numeric"
                      aria-label={`Score for ${nameOf(p.playerBId)}`}
                      invalid={!!err}
                      className="h-9 w-20 text-center num"
                    />
                  </Td>
                  <Td className="max-w-[120px] truncate text-[13px]">{winner}</Td>
                  <Td className="num">{spread === null ? "—" : spread}</Td>
                  <Td>
                    {p.status === "verified" ? (
                      <Badge tone="success" dot>
                        Verified
                      </Badge>
                    ) : p.status === "awaiting-verification" ? (
                      <Badge tone="warning" dot>
                        Pending
                      </Badge>
                    ) : (
                      <Badge tone="info" dot pulse>
                        Live
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      {p.status === "verified" ? (
                        <Button size="sm" variant="ghost" onClick={() => onCorrect(p)}>
                          Correct
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => submitRow(p)}>
                          Verify
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => onSlip(p)}>
                        Slip
                      </Button>
                    </div>
                    {err ? <p className="mt-1 text-[11.5px] text-critical">{err}</p> : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function BoardForm({ onSlip }: { onSlip: (p: Pairing) => void }) {
  const store = useStore();
  const { pairings, players, tournament } = store;
  const [board, setBoard] = React.useState("");
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState("");

  const list = pairings.filter((p) => p.round === tournament.currentRound && p.playerBId);
  const target = list.find((p) => String(p.board) === board.trim());
  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";

  const valid =
    target && a !== "" && b !== "" && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b));

  return (
    <Card className="max-w-xl">
      <CardHeader
        title="Board-by-board entry"
        subtitle="Enter one board at a time with full confirmation"
        icon={<ClipboardList className="size-4.5" />}
      />
      <div className="space-y-3.5 px-5 pb-5">
        <Field label="Board number" required>
          <Input
            value={board}
            onChange={(e) => setBoard(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 3"
          />
        </Field>

        {target ? (
          <>
            <div className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-3">
              <p className="text-[13px] font-medium text-ink">{nameOf(target.playerAId)}</p>
              <p className="text-[12px] text-muted">versus</p>
              <p className="text-[13px] font-medium text-ink">{nameOf(target.playerBId)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={nameOf(target.playerAId)} required>
                <Input value={a} onChange={(e) => setA(e.target.value)} inputMode="numeric" className="num" />
              </Field>
              <Field label={nameOf(target.playerBId)} required>
                <Input value={b} onChange={(e) => setB(e.target.value)} inputMode="numeric" className="num" />
              </Field>
            </div>
            {a && b && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) ? (
              <p className="rounded-control bg-primary-050/70 px-3.5 py-2.5 text-[12.5px] text-primary-600">
                {Number(a) === Number(b)
                  ? "Tie — both players receive half a point."
                  : `${Number(a) > Number(b) ? nameOf(target.playerAId) : nameOf(target.playerBId)} wins by ${Math.abs(Number(a) - Number(b))}.`}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={!valid}
                onClick={() => {
                  if (!target) return;
                  if (!store.requireCapability("scores.enter")) return;
                  store.submitScore(target.id, Number(a), Number(b), { verify: true });
                  store.toast({
                    title: `Board ${target.board} verified`,
                    description: "Standings, player records and public results were updated.",
                    tone: "success",
                  });
                  setA("");
                  setB("");
                  setBoard("");
                }}
              >
                Submit and verify
              </Button>
              <Button variant="secondary" onClick={() => onSlip(target)}>
                View result slip
              </Button>
            </div>
          </>
        ) : board.trim() ? (
          <p className="rounded-control bg-critical-050 px-3.5 py-2.5 text-[12.5px] text-[#c93a51]">
            No board with that number in round {tournament.currentRound}. A score cannot be
            submitted for an unpaired player.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function MobileSubmissions({ onResolve }: { onResolve: (p: Pairing) => void }) {
  const store = useStore();
  const { submissions, pairings, players } = store;
  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";

  const grouped = React.useMemo(() => {
    const map = new Map<string, typeof submissions>();
    for (const s of submissions) {
      map.set(s.pairingId, [...(map.get(s.pairingId) ?? []), s]);
    }
    return [...map.entries()];
  }, [submissions]);

  return (
    <Card>
      <CardHeader
        title="Player submissions"
        subtitle="Results submitted from the player mobile app"
        icon={<Smartphone className="size-4.5" />}
      />
      <div className="space-y-2 px-5 pb-5">
        {grouped.length === 0 ? (
          <p className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-3 text-[13px] text-muted">
            No player submissions are waiting.
          </p>
        ) : (
          grouped.map(([pairingId, subs]) => {
            const p = pairings.find((x) => x.id === pairingId);
            const conflict =
              subs.length === 2 &&
              (subs[0].scoreA !== subs[1].scoreA || subs[0].scoreB !== subs[1].scoreB);
            return (
              <div
                key={pairingId}
                className={cn(
                  "rounded-compact border p-3.5",
                  conflict ? "border-critical/30 bg-critical-050/40" : "border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface-soft))]",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13.5px] font-semibold text-ink">
                    Board {p?.board} — {nameOf(p?.playerAId ?? null)} vs {nameOf(p?.playerBId ?? null)}
                  </p>
                  {conflict ? (
                    <Badge tone="critical" dot>
                      Score mismatch detected
                    </Badge>
                  ) : (
                    <Badge tone="success" dot>
                      Both submissions agree
                    </Badge>
                  )}
                </div>

                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {subs.map((s) => (
                    <div key={s.id} className="rounded-control bg-[rgb(var(--c-surface-strong))] px-3 py-2.5">
                      <p className="text-[12px] text-muted">{s.submittedBy}</p>
                      <p className="mt-0.5 text-[17px] font-semibold text-ink num">
                        {s.scoreA} – {s.scoreB}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-faint">
                        {formatTime(s.at)} · {s.device}
                      </p>
                    </div>
                  ))}
                </div>

                {conflict && p ? (
                  <Button size="sm" variant="danger" className="mt-2.5" onClick={() => onResolve(p)}>
                    View both submissions
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function OcrPanel() {
  const store = useStore();
  const [state, setState] = React.useState<"idle" | "scanning" | "done">("idle");
  const [progress, setProgress] = React.useState(0);

  const scan = () => {
    setState("scanning");
    setProgress(0);
    const timer = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          window.clearInterval(timer);
          setState("done");
          return 100;
        }
        return p + 8;
      });
    }, 90);
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader
        title="Result sheet OCR"
        subtitle="Photograph a paper result slip and the scores are read automatically for confirmation"
        icon={<ScanLine className="size-4.5" />}
        action={<Badge tone="primary">Assisted</Badge>}
      />
      <div className="px-5 pb-5">
        {state === "idle" ? (
          <div className="board-motif rounded-compact border border-dashed border-line-strong p-8 text-center">
            <Upload className="mx-auto size-7 text-faint" />
            <p className="mt-2 text-[14px] font-medium text-ink">Upload a result sheet photograph</p>
            <p className="mt-1 text-[12.5px] text-muted">
              JPG or PNG. In the demo a sample sheet is used.
            </p>
            <Button variant="primary" className="mt-4" onClick={scan}>
              Scan sample result sheet
            </Button>
          </div>
        ) : state === "scanning" ? (
          <div className="rounded-compact bg-[rgb(var(--c-surface))] p-6">
            <p className="text-[13.5px] font-medium text-ink">Reading result sheet…</p>
            <Progress value={progress} className="mt-3" label="Scanning" />
            <p className="mt-2 text-[12px] text-muted">Detecting board number, names and scores.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-compact bg-success-050/60 p-4">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                <CheckCircle2 className="size-4 text-success" />
                Result sheet read successfully
              </p>
              <p className="mt-1 text-[12.5px] text-muted">
                Confirm the values below before they are submitted. OCR output is always reviewed
                by a person.
              </p>
            </div>

            {/*
              * Blank rather than pre-filled. A scanned sheet supplies these
              * values; inventing them would let a plausible-looking result be
              * submitted for players who never played it.
              */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Board">
                <Input className="num" placeholder="Board number" />
              </Field>
              <Field label="First player score">
                <Input className="num" placeholder="Score" />
              </Field>
              <Field label="Second player score">
                <Input className="num" placeholder="Score" />
              </Field>
            </div>

            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  store.toast({
                    title: "Result accepted from scan",
                    description: "Board 3 was submitted for verification.",
                    tone: "success",
                  });
                  setState("idle");
                }}
              >
                Confirm and submit
              </Button>
              <Button variant="secondary" onClick={() => setState("idle")}>
                Scan another sheet
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function MismatchModal({ pairing, onClose }: { pairing: Pairing | null; onClose: () => void }) {
  const store = useStore();
  const { submissions, players } = store;
  const [scoreA, setScoreA] = React.useState("498");
  const [scoreB, setScoreB] = React.useState("472");
  const [reason, setReason] = React.useState("");

  const subs = pairing ? submissions.filter((s) => s.pairingId === pairing.id) : [];
  const nameOf = (id: string | null) =>
    id ? players.find((p) => p.id === id)?.fullName ?? "—" : "Bye";

  if (!pairing) return null;

  return (
    <Modal
      open={!!pairing}
      onClose={onClose}
      title="Score mismatch detected."
      subtitle={`Board ${pairing.board} — ${nameOf(pairing.playerAId)} vs ${nameOf(pairing.playerBId)}`}
      size="md"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Ask players to confirm
          </Button>
          <Button
            variant="primary"
            disabled={!reason.trim()}
            onClick={() => {
              if (!store.requireCapability("scores.verify")) return;
              store.correctScore(pairing.id, Number(scoreA), Number(scoreB), reason);
              store.verifyResult(pairing.id);
              store.toast({
                title: "Result verified",
                description: `Board ${pairing.board} recorded as ${scoreA} – ${scoreB}. Standings updated.`,
                tone: "success",
              });
              onClose();
            }}
          >
            Director override
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {subs.map((s) => (
            <div key={s.id} className="rounded-compact border border-[rgb(var(--glass-border))] bg-[rgb(var(--c-surface))] p-3.5">
              <p className="text-[12px] text-muted">{s.submittedBy}</p>
              <p className="mt-1 text-[22px] font-semibold text-ink num">
                {s.scoreA} – {s.scoreB}
              </p>
              <p className="mt-1 text-[11.5px] text-faint">
                {formatTime(s.at)} · {s.device}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-control bg-warning-050/70 px-3.5 py-2.5 text-[12.5px] text-[#b4741f]">
          The winning score agrees. The losing score differs by{" "}
          {Math.abs((subs[0]?.scoreB ?? 0) - (subs[1]?.scoreB ?? 0))} points.
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Result sheet image</p>
          <div className="board-motif grid h-32 place-items-center rounded-compact border border-line-strong bg-[rgb(var(--c-surface-soft))]">
            <p className="text-[12.5px] text-muted">Photograph of the signed result slip</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={nameOf(pairing.playerAId)} required>
            <Input value={scoreA} onChange={(e) => setScoreA(e.target.value)} className="num" inputMode="numeric" />
          </Field>
          <Field label={nameOf(pairing.playerBId)} required>
            <Input value={scoreB} onChange={(e) => setScoreB(e.target.value)} className="num" inputMode="numeric" />
          </Field>
        </div>

        <Field label="Reason for the corrected score" required>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Signed result slip confirms 498–472. Losing player's app submission was mistyped."
          />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function CorrectionModal({ pairing, onClose }: { pairing: Pairing | null; onClose: () => void }) {
  const store = useStore();
  const [a, setA] = React.useState("");
  const [b, setB] = React.useState("");
  const [reason, setReason] = React.useState("");

  const [lastPairing, setLastPairing] = React.useState(pairing);
  if (lastPairing !== pairing) {
    setLastPairing(pairing);
    setA(pairing?.scoreA !== undefined ? String(pairing.scoreA) : "");
    setB(pairing?.scoreB !== undefined ? String(pairing.scoreB) : "");
    setReason("");
  }

  if (!pairing) return null;

  return (
    <Modal
      open={!!pairing}
      onClose={onClose}
      title={`Correct board ${pairing.board}`}
      subtitle="Corrections require a reason and are recorded in the audit log."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!reason.trim() || a === "" || b === ""}
            onClick={() => {
              if (!store.requireCapability("scores.correct")) return;
              store.correctScore(pairing.id, Number(a), Number(b), reason);
              store.toast({
                title: "Score corrected",
                description: "Standings and public results were recalculated.",
                tone: "success",
              });
              onClose();
            }}
          >
            Save correction
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <div className="rounded-control bg-[rgb(var(--c-surface))] px-3.5 py-2.5 text-[12.5px] text-muted">
          Current result: <span className="font-semibold text-ink num">{pairing.scoreA} – {pairing.scoreB}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Score A" required>
            <Input value={a} onChange={(e) => setA(e.target.value)} className="num" inputMode="numeric" />
          </Field>
          <Field label="Score B" required>
            <Input value={b} onChange={(e) => setB(e.target.value)} className="num" inputMode="numeric" />
          </Field>
        </div>
        <Field label="Reason for correction" required>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
