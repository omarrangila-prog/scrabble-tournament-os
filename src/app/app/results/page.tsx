"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { RoleGate } from "@/components/organizer/RoleGate";
import { RosterGate } from "@/components/organizer/RosterGate";
import { PlayerActionSheet, type PlayerAction, type SheetPlayer } from "@/components/organizer/PlayerActionSheet";
import { RoundControlBar } from "@/components/organizer/RoundControlBar";
import { useEventCategories } from "@/lib/supabase/useEventCategories";
import { WaitingRoom } from "@/components/organizer/WaitingRoom";
import type { Waiting } from "@/lib/domain/rollingEntry";
import {
  appendMatch,
  flipFirst,
  moveTable,
  setDivision,
  swapPlayers,
  waitingPlayers,
  withdrawPlayer,
} from "@/lib/supabase/organizer";
import { useCurrentEvent } from "@/lib/supabase/useCurrentEvent";
import { useEventDetails } from "@/lib/supabase/useEventDetails";
import type { RoundTimerControls } from "@/lib/supabase/useRoundTimer";
import type { GameRow } from "@/lib/domain/games";
import { useStore } from "@/lib/store/useStore";
import { recordResult } from "@/lib/supabase/games";
import { useEventFormat } from "@/lib/supabase/useEventFormat";
import { useGames } from "@/lib/supabase/useGames";
import { useRoster } from "@/lib/supabase/useRoster";
import { useRoundTimerControls } from "@/lib/supabase/useRoundTimer";
import { cn } from "@/lib/utils";

/**
 * Results & Pairings — the tournament control room, on one screen.
 *
 * The draw and the scores used to live on different pages. A staff member entering a result
 * saw two names and a table number and had to remember, or go and look, which category the
 * board belonged to and who was meant to be playing whom. Two screens for one act is how the
 * 23 August event ended up being paired on paper.
 *
 * So each card here is the whole board: category, table, both players with their numbers,
 * who goes first, and the two score boxes — the pairing and the result in the same place,
 * because they are the same thing at two moments.
 *
 * The round controls sit at the top rather than on a third page. Starting, extending and
 * ending a round is the other half of the same job.
 */
export default function ResultsPage() {
  const currentEvent = useCurrentEvent();
  const store = useStore();
  const roster = useRoster(currentEvent.eventId);
  const games = useGames(currentEvent.eventId);
  /* The event's own round length, with the same fallback the control room uses. */
  const { format } = useEventFormat(currentEvent.eventId, {
    rounds: 5,
    roundMinutes: 20,
    system: "swiss",
  });

  const round = games.round;
  const who = store.currentUser?.name ?? roster.signedInAs ?? "Results";
  const boards = React.useMemo(
    () => games.games.filter((g) => g.round === round).sort((a, b) => a.board - b.board),
    [games.games, round],
  );
  const timer = useRoundTimerControls(currentEvent.eventId, round, who);
  const { event: storedEvent } = useEventDetails(currentEvent.eventId);
  const eventName = storedEvent?.name ?? "";
  const eventSlug = storedEvent?.slug ?? "";

  /*
   * Who is checked in, eligible for this round, and on no board — asked of the database, so
   * the list agrees with the boards. Re-read whenever the boards change, because pairing two
   * waiting players is exactly what changes both.
   */
  const [waiting, setWaiting] = React.useState<Waiting[]>([]);
  const [appending, setAppending] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (round < 1) return;
    let live = true;
    (async () => {
      const list = await waitingPlayers(currentEvent.eventId, round);
      if (live) setWaiting(list);
    })();
    return () => {
      live = false;
    };
  }, [currentEvent.eventId, round, games.games]);

  /* The player whose name was tapped, and the board they are on. */
  const { categories } = useEventCategories(currentEvent.eventId);
  const [sheetFor, setSheetFor] = React.useState<{ player: SheetPlayer; game: GameRow } | null>(null);
  const [editing, setEditing] = React.useState(false);

  const openSheet = (playerId: string | null, game: GameRow) => {
    if (!playerId) return;
    const p = roster.players.find((x) => x.id === playerId);
    if (!p) return;
    setSheetFor({
      player: { id: p.id, fullName: p.fullName, playerNumber: p.playerId, division: p.division },
      game,
    });
  };

  /*
   * Everybody else in this category on a board this round — the people this player could
   * swap with. Byes included: swapping onto a bye is how a director gives somebody the bye.
   */
  const swapCandidates: SheetPlayer[] = sheetFor
    ? boards
        .filter((g) => g.division === sheetFor.game.division)
        .flatMap((g) => [g.playerA, g.playerB])
        .filter((id): id is string => !!id && id !== sheetFor.player.id)
        .map((id) => roster.players.find((x) => x.id === id))
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((x) => ({ id: x.id, fullName: x.fullName, playerNumber: x.playerId, division: x.division }))
    : [];

  /*
   * Free tables in this category's block. Read off the table plan the same way the database
   * does, so what the sheet offers is what the move will accept.
   */
  const freeTables: number[] = sheetFor
    ? (() => {
        const plan = (storedEvent?.details as { tablePlan?: { division: string; tables?: number[]; from?: number; to?: number }[] } | undefined)?.tablePlan;
        const entry = plan?.find((r) => r.division === sheetFor.game.division);
        const mine = entry?.tables
          ?? (entry?.from && entry?.to ? Array.from({ length: entry.to - entry.from + 1 }, (_, i) => entry.from! + i) : []);
        const taken = new Set(boards.filter((g) => g.playerB !== null).map((g) => g.board));
        return mine.filter((t) => !taken.has(t));
      })()
    : [];

  /** Carries out whatever was chosen on the sheet, then re-reads the boards. */
  const act = async (action: PlayerAction) => {
    if (!sheetFor) return;
    setEditing(true);

    let out: { ok: boolean; message: string };
    switch (action.kind) {
      case "swap":
        out = await swapPlayers(currentEvent.eventId, round, sheetFor.player.id, action.withPlayerId, who);
        break;
      case "move-table":
        out = await moveTable(sheetFor.game.id, action.board, who);
        break;
      case "flip-first":
        out = await flipFirst(sheetFor.game.id, who);
        break;
      case "set-division": {
        const changed = await setDivision(sheetFor.player.id, action.division, who);
        out = changed.ok
          ? { ok: true, message: `Category changed. Applies from round ${round + 1}; this board stays as it is.` }
          : { ok: false, message: changed.message ?? "Could not change the category." };
        break;
      }
      case "withdraw": {
        const w = await withdrawPlayer(currentEvent.eventId, sheetFor.player.id, false, who);
        out = { ok: w.ok, message: w.message };
        break;
      }
    }

    setEditing(false);
    store.toast({ title: out.ok ? "Done" : "Not changed", description: out.message, tone: out.ok ? "success" : "warning" });
    if (out.ok) {
      setSheetFor(null);
      games.reload();
      roster.reload();
    }
  };

  /** Confirms one late match. The database re-checks everything at this instant. */
  const confirmLate = async (a: Waiting, b: Waiting) => {
    const key = `${a.id}:${b.id}`;
    setAppending(key);
    const out = await appendMatch(currentEvent.eventId, round, a.id, b.id, who);
    setAppending(null);

    store.toast({
      title: out.ok ? `Table ${out.board}: ${a.fullName} v ${b.fullName}` : "Not paired",
      description: out.message,
      tone: out.ok ? "success" : "warning",
    });

    if (out.ok) games.reload();
  };

  const [divisionTab, setDivisionTab] = React.useState<string>("all");
  const [draft, setDraft] = React.useState<Record<string, { a: string; b: string }>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);

  const nameOf = (id: string | null) =>
    id ? roster.players.find((p) => p.id === id)?.fullName ?? "Unknown player" : "Bye";
  const numberOf = (id: string | null) =>
    id ? roster.players.find((p) => p.id === id)?.playerId ?? "" : "";


  /* The categories this round actually has boards in, in the order they are played. */
  const divisions = React.useMemo(
    () => [...new Set(boards.map((b) => b.division || "unspecified"))].sort(),
    [boards],
  );

  const shown = divisionTab === "all" ? boards : boards.filter((b) => (b.division || "unspecified") === divisionTab);

  /* A bye needs no score, so it is never something the room is waiting on. */
  const playable = boards.filter((b) => b.playerB !== null);
  const recorded = playable.filter((b) => b.scoreA !== null).length;
  const outstanding = playable.length - recorded;

  const setField = (id: string, key: "a" | "b", value: string) =>
    setDraft((d) => ({ ...d, [id]: { a: d[id]?.a ?? "", b: d[id]?.b ?? "", [key]: value } }));

  /**
   * Saves one board and moves to the next one still waiting.
   *
   * The focus move is the whole point of entering scores at a desk: a staff member with a
   * pile of result slips should be typing, not pointing. The next empty board is found from
   * the list as shown, so it follows the category being worked through rather than jumping
   * across the room.
   */
  const save = async (game: GameRow) => {
    const entry = draft[game.id] ?? { a: "", b: "" };
    const bye = game.playerB === null;
    const a = Number(entry.a);
    const b = bye ? null : Number(entry.b);

    const fail = (message: string) => setErrors((e) => ({ ...e, [game.id]: message }));

    if (entry.a.trim() === "" || Number.isNaN(a) || a < 0) return fail("Enter a score.");
    if (!bye && (entry.b.trim() === "" || Number.isNaN(b!) || b! < 0)) return fail("Enter both scores.");

    setErrors((e) => {
      const next = { ...e };
      delete next[game.id];
      return next;
    });

    setBusy(game.id);
    const out = await recordResult(game.id, a, b, who, undefined, currentEvent.eventId);
    setBusy(null);

    if (!out.ok) return fail(out.message);

    games.reload();
    setDraft((d) => {
      const next = { ...d };
      delete next[game.id];
      return next;
    });

    const order = shown.filter((g) => g.playerB !== null && g.scoreA === null && g.id !== game.id);
    const next = order[0];
    if (next) {
      window.setTimeout(() => {
        document.getElementById(`score-a-${next.id}`)?.focus();
      }, 0);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
      <PageHeader
        title="Results & Pairings"
        subtitle="The draw, the clock and every score, in one place."
      />

      <RoleGate need="results">
      <RosterGate access={roster.access} loaded={roster.loaded}>
        {round < 1 || boards.length === 0 ? (
          <Card className="mt-4">
            <EmptyState
              title="No round is published"
              description="Pair and publish a round on Live Event, then every board appears here with its scores."
            />
          </Card>
        ) : (
          <>
            {/*
              The round, in one sticky bar: where we are, what is left, and only the buttons
              that make sense right now. Under rolling entry START opens the clock and fixes
              the boards on the wall; END is what closes the door.
            */}
            <RoundControlBar
              eventName={eventName}
              eventSlug={eventSlug}
              round={round}
              totalRounds={format.rounds}
              timer={timer}
              roundMinutes={format.roundMinutes}
              playersInRound={playable.length * 2 + (boards.length - playable.length)}
              matches={playable.length}
              recorded={recorded}
              outstanding={outstanding}
              waiting={waiting.length}
              by={who}
              nextRoundHref="/app/live-event#pair"
            />

            {/* Late arrivals: who is waiting, and who they could play right now. */}
            <div className="mt-3">
              <WaitingRoom
                waiting={waiting}
                roundEndsAt={timer.timer?.startedAt ? endsAtOf(timer) : null}
                roundEnded={timer.phase === "finished"}
                busy={appending}
                onConfirm={(a, b) => void confirmLate(a, b)}
              />
            </div>

            {/* ---- Categories. Never one mixed list unless "All" is chosen. ---- */}
            {divisions.length > 1 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {["all", ...divisions].map((d) => {
                  const count = d === "all" ? playable.length : boards.filter((b) => (b.division || "unspecified") === d && b.playerB !== null).length;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDivisionTab(d)}
                      className={cn(
                        "rounded-control border px-3 py-1.5 text-[13px] font-semibold capitalize transition-colors",
                        divisionTab === d
                          ? "border-primary bg-primary text-white"
                          : "border-line bg-[rgb(var(--c-surface))] text-ink hover:bg-[rgb(var(--c-surface-soft))]",
                      )}
                    >
                      {d === "all" ? "All categories" : d.replace(/-/g, " ")}
                      <span className="num ml-1.5 opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* ---- The boards. Pairing and score on the same card. ---- */}
            <div className="mt-3 space-y-2.5">
              {shown.map((game, index) => {
                const previous = shown[index - 1];
                const firstMissing =
                  game.playerB !== null && game.scoreA === null &&
                  !shown.slice(0, index).some((g) => g.playerB !== null && g.scoreA === null);
                const newDivision =
                  divisionTab === "all" && (!previous || previous.division !== game.division);

                return (
                  <React.Fragment key={game.id}>
                    {newDivision ? (
                      <h3 className="px-1 pt-2 text-[13px] font-bold capitalize text-ink">
                        {(game.division || "unspecified").replace(/-/g, " ")}
                      </h3>
                    ) : null}
                    <div id={firstMissing ? "first-missing" : undefined}>
                    <BoardCard
                      game={game}
                      nameA={nameOf(game.playerA)}
                      nameB={nameOf(game.playerB)}
                      numberA={numberOf(game.playerA)}
                      numberB={numberOf(game.playerB)}
                      entry={draft[game.id] ?? { a: "", b: "" }}
                      error={errors[game.id]}
                      busy={busy === game.id}
                      onField={setField}
                      onSave={() => void save(game)}
                      onTapPlayer={(id) => openSheet(id, game)}
                    />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </>
        )}
      </RosterGate>
      </RoleGate>

      <PlayerActionSheet
        open={sheetFor !== null}
        player={sheetFor?.player ?? null}
        game={sheetFor?.game ?? null}
        swapCandidates={swapCandidates}
        freeTables={freeTables}
        categories={categories}
        busy={editing}
        onAction={(a) => void act(a)}
        onClose={() => setSheetFor(null)}
      />
    </div>
  );
}

/**
 * One board: who is playing, at which table, and what they scored.
 *
 * Deliberately one card rather than a table row. A row wide enough for two names, two
 * numbers, who plays first and two inputs does not fit a phone, and the desk is usually a
 * phone.
 */
function BoardCard({
  game,
  nameA,
  nameB,
  numberA,
  numberB,
  entry,
  error,
  busy,
  onField,
  onSave,
  onTapPlayer,
}: {
  game: GameRow;
  nameA: string;
  nameB: string;
  numberA: string;
  numberB: string;
  entry: { a: string; b: string };
  error?: string;
  busy: boolean;
  onField: (id: string, key: "a" | "b", value: string) => void;
  onSave: () => void;
  /** Tapping a name opens the action sheet for that player. */
  onTapPlayer: (playerId: string | null) => void;
}) {
  const bye = game.playerB === null;
  const done = game.scoreA !== null;

  /* Enter saves, so a desk can work down a pile of slips without touching the mouse. */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave();
    }
  };

  return (
    <Card className={cn("p-3.5", done && "bg-success-050/40")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="num grid size-9 shrink-0 place-items-center rounded-control bg-[rgb(var(--c-surface-strong))] text-[14px] font-extrabold text-ink">
          {game.board}
        </span>

        <div className="min-w-0 flex-1">
          {/* Names are buttons: tap one to change something about that player, right here. */}
          <button
            type="button"
            onClick={() => onTapPlayer(game.playerA)}
            className="block max-w-full truncate rounded-control text-left text-[14px] font-bold text-ink hover:bg-[rgb(var(--c-surface-soft))]"
          >
            {nameA}
            {numberA ? <span className="num ml-1.5 text-[12px] font-semibold text-muted">{numberA}</span> : null}
            {game.aPlaysFirst === true ? <FirstTag /> : null}
          </button>
          {bye ? (
            <p className="truncate text-[13px] text-muted">Bye — no game this round</p>
          ) : (
            <button
              type="button"
              onClick={() => onTapPlayer(game.playerB)}
              className="block max-w-full truncate rounded-control text-left text-[13px] text-muted hover:bg-[rgb(var(--c-surface-soft))]"
            >
              v {nameB}
              {numberB ? <span className="num ml-1.5 text-[12px] font-semibold">{numberB}</span> : null}
              {game.aPlaysFirst === false ? <FirstTag /> : null}
            </button>
          )}
          {/* Why the engine paired these two, kept at publish. */}
          {game.pairingReason ? (
            <p className="truncate text-[11.5px] text-faint" title={game.pairingReason}>
              {game.pairingReason}
            </p>
          ) : null}
        </div>

        {done ? (
          <span className="num shrink-0 text-[15px] font-extrabold text-ink">
            {game.scoreA}
            {bye ? "" : ` – ${game.scoreB}`}
          </span>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <Input
              id={`score-a-${game.id}`}
              value={entry.a}
              onChange={(e) => onField(game.id, "a", e.target.value)}
              onKeyDown={onKey}
              inputMode="numeric"
              className="num w-[72px]"
              aria-label={`Score for ${nameA}`}
              invalid={!!error}
            />
            {bye ? null : (
              <Input
                value={entry.b}
                onChange={(e) => onField(game.id, "b", e.target.value)}
                onKeyDown={onKey}
                inputMode="numeric"
                className="num w-[72px]"
                aria-label={`Score for ${nameB}`}
                invalid={!!error}
              />
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={onSave}
              icon={busy ? <Loader2 className="size-3.5 animate-spin" /> : undefined}
            >
              {busy ? "Saving" : "Save"}
            </Button>
          </div>
        )}
      </div>

      {error ? <p className="mt-2 text-[12.5px] text-critical">{error}</p> : null}
    </Card>
  );
}

/** Marks whoever plays first, where the event tracks it. */
function FirstTag() {
  return (
    <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-primary-700">
      1st
    </span>
  );
}

/**
 * When the round's clock runs out, from the recorded instants.
 *
 * Start, plus the planned minutes and every extension, plus however long it has spent paused.
 * Null until the clock has started: a late match proposed before START has no time limit to
 * be told about yet.
 */
function endsAtOf(timer: RoundTimerControls): string | null {
  const t = timer.timer;
  if (!t?.startedAt) return null;

  const extended = t.extensions.reduce((n, e) => n + e.minutes, 0);
  const pausedNow = t.pausedAt ? Date.now() - new Date(t.pausedAt).getTime() : 0;
  const end =
    new Date(t.startedAt).getTime() +
    (t.plannedMinutes + extended) * 60_000 +
    t.pausedMs +
    pausedNow;

  return new Date(end).toISOString();
}
