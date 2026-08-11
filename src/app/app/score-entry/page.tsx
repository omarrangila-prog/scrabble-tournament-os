"use client";

import * as React from "react";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import { AlertTriangle, CheckCircle2, RefreshCw, Undo2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  TableWrap,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { RosterGate } from "@/components/organizer/RosterGate";
import type { GameRow } from "@/lib/domain/games";
import { useStore } from "@/lib/store/useStore";
import { clearResult, flagResult, recordResult } from "@/lib/supabase/games";
import { useGames } from "@/lib/supabase/useGames";
import { useRoster } from "@/lib/supabase/useRoster";
import { cn, formatTime } from "@/lib/utils";


/**
 * Score entry.
 *
 * One way in, deliberately. There used to be four tabs — fast entry, a single-board
 * form, player submissions from phones and a result-sheet scanner — three of which
 * had nothing behind them: the scanner ran a progress bar and read no image, the
 * submissions list read a store nothing writes to, and a "score mismatch" banner
 * was hardcoded to board 22 whether or not board 22 existed. Several routes to the
 * same fact is also how two screens come to disagree about a score.
 *
 * Results are written to the database against the name of whoever entered them, so
 * a second laptop sees them and closing this tab loses nothing.
 */
export default function ScoreEntryPage() {
  const store = useStore();
  const roster = useRoster(ACTIVE_EVENT_ID);
  const games = useGames(ACTIVE_EVENT_ID, store.tournament.id);

  const [query, setQuery] = React.useState("");
  const [correcting, setCorrecting] = React.useState<GameRow | null>(null);
  const [disputing, setDisputing] = React.useState<GameRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Record<string, { a: string; b: string }>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const round = games.round;
  const nameOf = (id: string | null) =>
    id ? roster.players.find((p) => p.id === id)?.fullName ?? "Unknown player" : "Bye";

  const boards = React.useMemo(
    () => games.games.filter((g) => g.round === round).sort((a, b) => a.board - b.board),
    [games.games, round],
  );

  const filtered = boards.filter((g) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      String(g.board) === q ||
      nameOf(g.playerA).toLowerCase().includes(q) ||
      nameOf(g.playerB).toLowerCase().includes(q)
    );
  });

  const done = boards.filter((g) => g.scoreA !== null).length;

  const setField = (id: string, key: "a" | "b", value: string) =>
    setDraft((d) => ({ ...d, [id]: { a: d[id]?.a ?? "", b: d[id]?.b ?? "", [key]: value } }));

  const save = async (game: GameRow) => {
    const entry = draft[game.id] ?? { a: "", b: "" };
    const bye = game.playerB === null;

    const a = Number(entry.a);
    const b = bye ? null : Number(entry.b);

    const fail = (message: string) => {
      setErrors((e) => ({ ...e, [game.id]: message }));
    };

    if (entry.a.trim() === "" || Number.isNaN(a) || a < 0) {
      return fail("Enter a score for the first player.");
    }
    if (!bye && (entry.b.trim() === "" || Number.isNaN(b!) || b! < 0)) {
      return fail("Enter both scores.");
    }

    setErrors((e) => {
      const next = { ...e };
      delete next[game.id];
      return next;
    });

    setBusy(game.id);
    const result = await recordResult(
      game.id,
      a,
      b,
      whoAmI(store.currentUser?.name, roster.signedInAs),
      undefined,
      ACTIVE_EVENT_ID,
    );
    setBusy(null);

    if (!result.ok) return fail(result.message);

    games.reload();
    setDraft((d) => {
      const next = { ...d };
      delete next[game.id];
      return next;
    });

    /*
     * An unusual total is flagged, not blocked. A Scrabble game really can end at
     * 250 or at 600, and refusing the score would leave the director unable to
     * record what actually happened.
     */
    const total = a + (b ?? 0);
    const unusual = !bye && (total > 1100 || total < 400);

    store.toast({
      title: `Board ${game.board} recorded`,
      description: unusual
        ? `${a}–${b} saved. That total is unusual — worth a second look.`
        : `${a}${bye ? "" : `–${b}`} saved. Standings have been recalculated.`,
      tone: unusual ? "warning" : "success",
    });
  };

  const reopen = async (game: GameRow) => {
    setBusy(game.id);
    const ok = await clearResult(game.id, ACTIVE_EVENT_ID);
    setBusy(null);

    if (!ok) {
      store.toast({ title: "Could not reopen the board", description: "Please try again.", tone: "critical" });
      return;
    }
    games.reload();
    store.toast({
      title: `Board ${game.board} reopened`,
      description: "The score has been cleared and can be entered again.",
      tone: "info",
    });
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Score Entry"
        badge={
          round > 0 ? (
            <Badge tone="primary">Round {round}</Badge>
          ) : (
            <Badge tone="neutral">No round published</Badge>
          )
        }
        subtitle="Standings recalculate the moment a result is saved."
        actions={
          <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={games.reload}>
            Refresh
          </Button>
        }
      />

      <RosterGate access={roster.access} loaded={roster.loaded && games.loaded}>
        {round === 0 ? (
          <Card>
            <EmptyState
              title="No round has been published"
              description="Publish a round from Live Event, then enter the scores here."
            />
          </Card>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <MiniStat label="Boards" value={boards.length} />
              <MiniStat label="Recorded" value={done} tone="success" />
              <MiniStat
                label="Outstanding"
                value={boards.length - done}
                tone={boards.length - done ? "warning" : "success"}
              />
            </div>

            <Card>
              <CardHeader
                title={`Round ${round}`}
                subtitle={`${done} of ${boards.length} boards recorded`}
                icon={<CheckCircle2 className="size-4.5" />}
              />
              <div className="px-4 pb-4">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Search a board number or a player"
                  className="mb-3 sm:max-w-sm"
                />

                {filtered.length === 0 ? (
                  <EmptyState title="No board matches" description="Try a different number or name." />
                ) : (
                  <TableWrap className="max-h-[64vh]">
                    <thead>
                      <tr>
                        <Th className="w-16">Board</Th>
                        <Th>Players</Th>
                        <Th className="w-56">Score</Th>
                        <Th className="w-40">Status</Th>
                        <Th className="w-32">Action</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((g) => {
                        const recorded = g.scoreA !== null;
                        const entry = draft[g.id] ?? { a: "", b: "" };
                        const bye = g.playerB === null;
                        const working = busy === g.id;

                        return (
                          <tr key={g.id} className={cn(recorded && "bg-success-050/40")}>
                            <Td className="num font-semibold">{g.board}</Td>
                            <Td>
                              <span className="block truncate text-[13.5px] font-medium text-ink">
                                {nameOf(g.playerA)}
                              </span>
                              <span className="block truncate text-[12px] text-muted">
                                {bye ? "Bye — no opponent" : `v ${nameOf(g.playerB)}`}
                              </span>
                            </Td>
                            <Td>
                              {recorded ? (
                                <span className="num text-[14px] font-bold text-ink">
                                  {g.scoreA}
                                  {bye ? "" : ` – ${g.scoreB}`}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <Input
                                    value={entry.a}
                                    onChange={(e) => setField(g.id, "a", e.target.value)}
                                    inputMode="numeric"
                                    className="num w-20"
                                    aria-label={`Score for ${nameOf(g.playerA)}`}
                                    invalid={!!errors[g.id]}
                                  />
                                  {bye ? null : (
                                    <>
                                      <span className="text-muted">–</span>
                                      <Input
                                        value={entry.b}
                                        onChange={(e) => setField(g.id, "b", e.target.value)}
                                        inputMode="numeric"
                                        className="num w-20"
                                        aria-label={`Score for ${nameOf(g.playerB)}`}
                                        invalid={!!errors[g.id]}
                                      />
                                    </>
                                  )}
                                </span>
                              )}
                              {errors[g.id] ? (
                                <span className="mt-1 block text-[11.5px] font-medium text-critical">
                                  {errors[g.id]}
                                </span>
                              ) : null}
                            </Td>
                            <Td>
                              {recorded ? (
                                <span className="block">
                                  {/*
                                    A disputed board says so. It reads "recorded" only when
                                    nobody has questioned it — the whole point of the flag is
                                    that this cell stops agreeing.
                                  */}
                                  {g.status === "disputed" ? (
                                    <Badge tone="critical">disputed</Badge>
                                  ) : (
                                    <Badge tone="success">recorded</Badge>
                                  )}
                                  {g.verifiedBy ? (
                                    <span className="mt-1 block truncate text-[11px] text-muted">
                                      {g.verifiedBy}
                                      {g.verifiedAt ? ` · ${formatTime(g.verifiedAt)}` : ""}
                                    </span>
                                  ) : null}
                                  {g.note ? (
                                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                                      {g.note}
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <Badge tone="neutral">waiting</Badge>
                              )}
                            </Td>
                            <Td>
                              {recorded ? (
                                <span className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={working}
                                    onClick={() => setCorrecting(g)}
                                  >
                                    Correct
                                  </Button>
                                  {g.status === "disputed" ? null : (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={working}
                                      onClick={() => setDisputing(g)}
                                    >
                                      Dispute
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={working}
                                    onClick={() => reopen(g)}
                                    icon={<Undo2 className="size-3.5" />}
                                    aria-label={`Reopen board ${g.board}`}
                                  />
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={working}
                                  onClick={() => save(g)}
                                >
                                  {working ? "Saving…" : "Save"}
                                </Button>
                              )}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </TableWrap>
                )}
              </div>
            </Card>
          </>
        )}
      </RosterGate>

      <DisputeModal
        game={disputing}
        nameA={disputing ? nameOf(disputing.playerA) : ""}
        nameB={disputing ? nameOf(disputing.playerB) : ""}
        onClose={() => setDisputing(null)}
        onSaved={() => {
          games.reload();
          setDisputing(null);
        }}
        by={whoAmI(store.currentUser?.name, roster.signedInAs)}
      />

      <CorrectionModal
        game={correcting}
        nameA={correcting ? nameOf(correcting.playerA) : ""}
        nameB={correcting ? nameOf(correcting.playerB) : ""}
        onClose={() => setCorrecting(null)}
        onSaved={() => {
          games.reload();
          setCorrecting(null);
        }}
        by={whoAmI(store.currentUser?.name, roster.signedInAs)}
      />
    </div>
  );
}

/** Whoever is entering scores, for the audit trail on each result. */
function whoAmI(name: string | undefined, signedInAs: string | null): string {
  return name ?? signedInAs ?? "Director";
}

/* -------------------------------------------------------------------------- */

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "warning" | "info";
}) {
  const colour =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "info"
          ? "text-info"
          : "text-ink";

  return (
    <div className="glass rounded-card px-4 py-3">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className={cn("num mt-0.5 text-[24px] font-extrabold", colour)}>{value}</p>
    </div>
  );
}

/**
 * Changing a score that is already recorded.
 *
 * A reason is required and is stored with the result. Overwriting a score silently
 * is how a correction becomes an argument nobody can settle: the useful question
 * afterwards is always who changed it and why.
 */
/**
 * Puts a board's result into dispute.
 *
 * The score is not changed and not cleared — a disputed board is a score somebody has
 * questioned, not a score known to be wrong. Once flagged, the round cannot advance and
 * Live Event counts it under Conflicts, so the disagreement is held by the system rather
 * than by whoever remembers it.
 *
 * There is no "resolve" button on purpose. A dispute ends when a person re-enters the
 * score through Correct, which records who decided it.
 */
function DisputeModal({
  game,
  nameA,
  nameB,
  onClose,
  onSaved,
  by,
}: {
  game: GameRow | null;
  nameA: string;
  nameB: string;
  onClose: () => void;
  onSaved: () => void;
  by: string;
}) {
  const store = useStore();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [openedFor, setOpenedFor] = React.useState<string | null>(null);
  if (game && openedFor !== game.id) {
    setOpenedFor(game.id);
    setReason("");
    setError(null);
  }

  if (!game) return null;

  const bye = game.playerB === null;

  const submit = async () => {
    if (!reason.trim()) return setError("Give a reason. Whoever settles this will read it.");

    setBusy(true);
    const result = await flagResult(game.id, by, reason.trim(), ACTIVE_EVENT_ID);
    setBusy(false);

    if (!result.ok) return setError(result.message);

    store.toast({
      title: result.already
        ? `Board ${game.board} was already disputed`
        : `Board ${game.board} is disputed`,
      description: result.already
        ? "The existing reason has been kept."
        : "The round cannot advance until somebody re-enters the score.",
      tone: "warning",
    });
    onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Dispute board ${game.board}`}
      subtitle={bye ? nameA : `${nameA} v ${nameB}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Mark disputed"}
          </Button>
        </div>
      }
    >
      {error ? (
        <p className="mb-3 flex items-start gap-1.5 rounded-input bg-critical-050 px-3 py-2 text-[13px] font-medium text-critical">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <p className="mb-3 text-[13px] leading-relaxed text-muted">
        The score stays as it is — {game.scoreA}
        {bye ? "" : `–${game.scoreB}`}. Nothing is deleted.
      </p>

      <Field label="What is in dispute" required hint="Stored on the board, against your name.">
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Both players signed different totals."
        />
      </Field>
    </Modal>
  );
}

function CorrectionModal({
  game,
  nameA,
  nameB,
  onClose,
  onSaved,
  by,
}: {
  game: GameRow | null;
  nameA: string;
  nameB: string;
  onClose: () => void;
  onSaved: () => void;
  by: string;
}) {
  const store = useStore();
  const [scoreA, setScoreA] = React.useState("");
  const [scoreB, setScoreB] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load the current score whenever a different board is opened.
  const [openedFor, setOpenedFor] = React.useState<string | null>(null);
  if (game && openedFor !== game.id) {
    setOpenedFor(game.id);
    setScoreA(game.scoreA === null ? "" : String(game.scoreA));
    setScoreB(game.scoreB === null ? "" : String(game.scoreB));
    setReason("");
    setError(null);
  }

  if (!game) return null;

  const bye = game.playerB === null;

  const submit = async () => {
    const a = Number(scoreA);
    const b = bye ? null : Number(scoreB);

    if (scoreA.trim() === "" || Number.isNaN(a) || a < 0) return setError("Enter a valid score.");
    if (!bye && (scoreB.trim() === "" || Number.isNaN(b!) || b! < 0)) {
      return setError("Enter both scores.");
    }
    if (!reason.trim()) return setError("Give a reason. It is stored with the result.");

    setBusy(true);
    const result = await recordResult(game.id, a, b, by, reason.trim(), ACTIVE_EVENT_ID);
    setBusy(false);

    if (!result.ok) return setError(result.message);

    store.toast({
      title: `Board ${game.board} corrected`,
      description: `Now ${a}${bye ? "" : `–${b}`}, recorded against ${by}.`,
      tone: "success",
    });
    onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Correct board ${game.board}`}
      subtitle={bye ? nameA : `${nameA} v ${nameB}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save correction"}
          </Button>
        </div>
      }
    >
      {error ? (
        <p className="mb-3 flex items-start gap-1.5 rounded-input bg-critical-050 px-3 py-2 text-[13px] font-medium text-critical">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label={nameA} required>
            <Input value={scoreA} onChange={(e) => setScoreA(e.target.value)} inputMode="numeric" className="num" />
          </Field>
          {bye ? null : (
            <Field label={nameB} required>
              <Input value={scoreB} onChange={(e) => setScoreB(e.target.value)} inputMode="numeric" className="num" />
            </Field>
          )}
        </div>

        <Field label="Reason" required hint="Stored with the result, against your name.">
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Board 4 and 5 slips were swapped."
          />
        </Field>
      </div>
    </Modal>
  );
}
