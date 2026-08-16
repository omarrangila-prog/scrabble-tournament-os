"use client";

import * as React from "react";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Coffee,
  Grid3x3,
  Pause,
  Play,
  Plus,
  QrCode,
  Radio,
  Square,
  Timer,
  UserCheck,
  Users,
} from "lucide-react";
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
  Progress,
  Select,
  Stat,
  Textarea,
} from "@/components/ui";
import {
  selectActiveEvent,
  useEventStore,
} from "@/lib/store/useEventStore";
import { useLiveStore } from "@/lib/store/useLiveStore";
import { useStore } from "@/lib/store/useStore";
import { staffCheckIn, staffUndoCheckIn } from "@/lib/supabase/organizer";
import { useRoster } from "@/lib/supabase/useRoster";
import { useRoundTimerControls } from "@/lib/supabase/useRoundTimer";
import { useGames } from "@/lib/supabase/useGames";
import { clearRound, publishRound } from "@/lib/supabase/games";
import { setEventPhase, useEventState } from "@/lib/supabase/useEventState";
import { announceBoardsChanged } from "@/lib/supabase/realtime";
import { RosterGate } from "@/components/organizer/RosterGate";
import { PhaseGuidance } from "@/components/organizer/PhaseGuidance";
import { AutoRun } from "@/components/organizer/AutoRun";
import { generateRound } from "@/lib/engine/pairing";
import { fullRoundProgress, validateBoardPlan, type BoardPlan } from "@/lib/domain/games";
import {
  assignTables,
  formatTableSpec,
  overlappingTables,
  parseTableSpec,
} from "@/lib/domain/tables";
import { useTablePlan, writeBreakKind, writeTablePlan } from "@/lib/supabase/useTablePlan";
import { EventState, EVENT_STATE_LABEL } from "@/lib/domain/events";
import type { Player } from "@/lib/domain/types";
import {
  canAdvanceRound,
  formatClock,
} from "@/lib/engine/roundTimer";
import { qrToDataUri } from "@/lib/qr/qrcode";
import { cn, formatTime } from "@/lib/utils";


/** The states a director moves through on the day, in order. */
const DAY_FLOW: EventState[] = [
  "registration-closed",
  "check-in-open",
  "check-in-closed",
  "round-published",
  "round-active",
  "result-entry",
  "break",
  "final-review",
  "completed",
];

/**
 * Live Event Mode — the director's control surface during the tournament.
 *
 * Everything here changes what participants see on their phones, so each
 * control states its consequence rather than just its name.
 */
export default function LiveEventPage() {
  const events = useEventStore();
  const live = useLiveStore();
  const app = useStore();

  const event = selectActiveEvent(events);

  /*
   * Who is playing comes from the database. This page used to read registrations
   * from browser storage, which is empty, so the arrival list had no rows and
   * "publish pairings" could never find two players to pair.
   */
  const roster = useRoster(ACTIVE_EVENT_ID);
  const tablePlan = useTablePlan(ACTIVE_EVENT_ID);

  /*
   * Games come from the database too, so the round number, the board count and the
   * results all agree with what the score table and the participant board list see.
   */
  const games = useGames(ACTIVE_EVENT_ID, app.tournament.id);

  /*
   * The stored phase. Reading it back means this screen shows what participants
   * are actually seeing, rather than what this browser last set.
   */
  const storedPhase = useEventState(ACTIVE_EVENT_ID);
  const [publishing, setPublishing] = React.useState(false);

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const [extendOpen, setExtendOpen] = React.useState(false);

  /*
   * The table plan as typed, kept apart from the saved one so a half-edited range never
   * seats anybody.
   *
   * `null` means "not edited yet", which is what lets the saved plan show through without
   * copying it into state in an effect — a render-time fallback rather than a second copy
   * that has to be kept in step.
   */
  const [edited, setEdited] = React.useState<Record<string, string> | null>(null);

  const saved = React.useMemo(
    () => Object.fromEntries(tablePlan.plan.map((p) => [p.division, formatTableSpec(p.tables)])),
    [tablePlan.plan],
  );

  const tableDraft = edited ?? saved;
  const setTableDraft = (next: React.SetStateAction<Record<string, string>>) =>
    setEdited((current) => (typeof next === "function" ? next(current ?? saved) : next));

  /*
   * The round is whichever one has boards, rather than a counter kept in this
   * browser. A counter can disagree with the games that exist — and did, showing
   * "round 1 of 5" while nothing was paired at all.
   */
  const round = Math.max(1, games.round);

  /*
   * The clock comes from the database, so the wall display and every player's phone are
   * counting the same round. It used to live in this browser's local storage, which meant
   * the only screen that knew how long was left was the one that started it.
   */
  const clock = useRoundTimerControls(
    ACTIVE_EVENT_ID,
    round,
    app.currentUser?.name ?? "Director",
  );

  /*
   * When the clock runs out, the event moves itself on.
   *
   * The round is over the moment the time is up — that is not a judgement anybody needs to
   * make, and the room has already stopped playing. Waiting for the director to press
   * something means the wall keeps showing 00:00 while thirty people wonder whether to
   * bring their slip up.
   *
   * Only from `round-active`, and only once: guarded by a ref rather than by state so a
   * re-render between the check and the write cannot fire it twice.
   */
  const advanced = React.useRef<number | null>(null);

  React.useEffect(() => {
    /*
     * Reads the stored phase directly rather than the `eventState` computed below: that is
     * defined after the "no event" guard, and a hook cannot sit after an early return.
     */
    if (clock.phase !== "finished" || storedPhase.state !== "round-active") return;
    if (advanced.current === round) return;

    advanced.current = round;

    void (async () => {
      const written = await setEventPhase(event?.id ?? "", "result-entry");
      if (!written.ok) {
        /* Let it be tried again rather than leaving the room stuck at 00:00. */
        advanced.current = null;
        return;
      }
      storedPhase.reload();
      announceBoardsChanged(event?.id ?? "");
    })();
  }, [clock.phase, storedPhase, round, event?.id]);

  // Tick once a second so the clock stays live.
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!event) {
    return (
      <Card>
        <EmptyState title="No event" description="Create and publish an event to run it live." />
      </Card>
    );
  }

  const timer = clock.timer;
  const phase = clock.phase;
  const remaining = timer ? clock.remaining : event.roundMinutes * 60_000;

  /*
   * Arrivals are counted from the database, so the number agrees with the one the
   * self check-in page and the venue display show. Counting them in this browser
   * gave each device its own answer.
   */
  const attending = roster.players.filter((p) => p.checkIn !== "withdrawn");
  const checkedIn = attending.filter((p) => p.checkIn === "checked-in").length;
  /*
   * Counted from the games in the database, not from this browser.
   *
   * This read `live.progressFor(...)` — browser storage that nothing has filled since
   * scores moved to Postgres. The Conflicts stat therefore read 0 whether or not a board
   * was disputed, and the round-readiness line below it was computed from an empty list,
   * telling the director a round was ready to close on the strength of no information.
   */
  const progress = fullRoundProgress(games.games, round);
  const advance = canAdvanceRound(progress);
  const boards = games.progress;

  const liveUrl = origin ? `${origin}/live/${event.slug}` : `/live/${event.slug}`;

  /*
   * The phase as the database holds it, which is what participants are seeing.
   * Falls back to this browser's copy only until the first read returns, so the
   * controls do not flicker through a wrong state on load.
   */
  const eventState = storedPhase.state ?? event.state;

  /**
   * Moves the event to a new phase.
   *
   * Writes to the database, because the phase decides what every participant's
   * phone shows. It used to write to this browser only — so "Open check-in"
   * changed this laptop and nothing else, and a phone scanning the venue code was
   * still being told to register, all day, whatever the director pressed.
   *
   * The toast now reports what actually happened rather than announcing that
   * participant screens were updated regardless.
   */
  const setState = async (next: EventState) => {
    const written = await setEventPhase(event.id, next);

    if (!written.ok) {
      app.toast({
        title: "Phase not changed",
        description: written.message ?? "Please try again.",
        tone: "critical",
      });
      return;
    }

    // Kept in step so this screen's own controls stay consistent immediately.
    events.setEventState(event.id, next);
    storedPhase.reload();

    if (next === "round-active") {
      live.ensureTimer(event.id, round, event.roundMinutes);
      live.start(event.id, round);

      /*
       * Start the room's clock, not just this laptop's. If this write fails the round is
       * still live — the phase has already changed — so the failure is reported as what
       * it is rather than being allowed to look like a clock nobody can see.
       */
      const started = await clock.start(event.roundMinutes);
      if (!started) {
        app.toast({
          title: "Clock not shared",
          description:
            "The round has started, but the countdown is only on this screen. Press Start again to retry.",
          tone: "critical",
        });
      }
    }

    /*
     * Nudge the phones. Without this they wait out their poll, which is the wrong
     * behaviour at exactly the moment they need to move on — from check-in to the
     * board list.
     */
    announceBoardsChanged(event.id);

    app.toast({
      title: EVENT_STATE_LABEL[next],
      description: "Every participant screen and the venue display now show this phase.",
      tone: "success",
    });
  };

  /**
   * Pairs the next round and publishes it to the database.
   *
   * Uses the real Swiss engine — the one with repeat-opponent avoidance and
   * backtracking — over the players who have actually arrived, and over the games
   * already in the database so it knows who has played whom. The old path used a
   * top-half/bottom-half fold that ignored history entirely, which forces rematches
   * on the last boards.
   *
   * Publishing writes the whole round at once, so participants never see a
   * half-paired round.
   */
  /* Tables listed for two divisions at once — invisible in settings, four people at one
     table in the room. */
  const tableClashes = overlappingTables(
    app.divisions.map((d) => ({ division: d.id, tables: parseTableSpec(tableDraft[d.id] ?? "") })),
  );

  /**
   * Stops the room, and tells the wall which kind of stop it is.
   *
   * The label is written before the phase, so the wall never shows "break" for a second on
   * its way to "lunch" — a room glances up once.
   */
  const startBreak = async (kind: "break" | "lunch") => {
    const labelled = await writeBreakKind(event.id, kind);
    if (!labelled.ok) {
      app.toast({ title: "Not saved", description: labelled.message, tone: "warning" });
    }
    await setState("break");
  };

  const saveTablePlan = async () => {
    const plan = app.divisions
      .map((d) => ({ division: d.id, tables: parseTableSpec(tableDraft[d.id] ?? "") }))
      .filter((p) => p.tables.length > 0);

    const written = await writeTablePlan(event.id, plan);

    if (!written.ok) {
      app.toast({ title: "Not saved", description: written.message, tone: "critical" });
      return;
    }

    tablePlan.reload();
    /* Cleared, so the field falls back to whatever was actually stored. */
    setEdited(null);

    const total = plan.reduce((n, p) => n + p.tables.length, 0);
    app.toast({
      title: "Table plan saved",
      description: `${total} table${total === 1 ? "" : "s"} across ${plan.length} division${plan.length === 1 ? "" : "s"}. Pairing will seat people here.`,
      tone: "success",
    });
  };

  const publishPairings = async () => {
    const present = attending.filter((p) => p.checkIn === "checked-in");

    if (present.length < 2) {
      app.toast({
        title: "Not enough players checked in",
        description: "At least two arrivals are needed to pair a round.",
        tone: "warning",
      });
      return;
    }

    const nextRound = games.round + 1;

    const generated = generateRound({
      players: present,
      pairings: games.pairings,
      tournament: app.tournament,
      round: nextRound,
    });

    const numbered: BoardPlan[] = generated.pairings.map((pairing) => ({
      board: pairing.board,
      division: pairing.division,
      playerA: pairing.playerAId,
      playerB: pairing.playerBId,
    }));

    /*
     * Boards become the tables they are actually played on.
     *
     * Pairing numbers them 1, 2, 3… in the order it makes them, which is a different number
     * from the one painted on the table as soon as two divisions share a room. Everything
     * downstream — the phone, the score sheet, the wall — shows this number, so it has to be
     * the one somebody can walk to.
     */
    /*
     * Only when a plan exists.
     *
     * With no plan, `assignTables` correctly reports that no division has any tables — and
     * the refusal below then blocked pairing entirely for anybody who had not set one.
     * Boards keep their generated numbers instead, which is what they did before table
     * plans existed and is a perfectly good room.
     */
    const hasPlan = tablePlan.plan.length > 0;
    const { seated, problems } = hasPlan
      ? assignTables(numbered, tablePlan.plan)
      : { seated: numbered, problems: [] };

    const plan = hasPlan ? seated : numbered;

    /*
     * A division with more pairs than tables is refused rather than published. Seating two
     * games at one table is not something the room can sort out later.
     */
    if (problems.length > 0) {
      app.toast({
        title: "Not enough tables",
        description: `${problems[0].message} Set the tables under Table plan, then pair again.`,
        tone: "critical",
      });
      return;
    }

    /*
     * Checked before sending. The database enforces the same rules, but a
     * constraint violation arrives as a Postgres error in front of a director
     * holding a room full of people.
     */
    const check = validateBoardPlan(plan);
    if (!check.ok) {
      app.toast({
        title: "These pairings are not valid",
        description: check.problems[0] ?? "Please try again.",
        tone: "critical",
      });
      return;
    }

    setPublishing(true);
    const result = await publishRound(event.id, nextRound, plan);
    setPublishing(false);

    if (!result.ok) {
      app.toast({ title: "Round not published", description: result.message, tone: "critical" });
      return;
    }

    games.reload();
    live.ensureTimer(event.id, nextRound, event.roundMinutes);
    setState("round-published");

    app.toast({
      title: `Round ${nextRound} published`,
      description:
        generated.unpaired.length > 0
          ? `${result.boards} boards. ${generated.unpaired.length} player(s) have a bye.`
          : `${result.boards} boards are now visible to participants.`,
      tone: "success",
    });
  };

  /** Removes the current round, results included. Asks first. */
  const dropRound = async () => {
    const confirmed = window.confirm(
      `Clear round ${round}?\n\n` +
        `This deletes ${boards.totalBoards} board(s) and any scores already entered. ` +
        `It cannot be undone.`,
    );
    if (!confirmed) return;

    const ok = await clearRound(event.id, round);
    if (!ok) {
      app.toast({ title: "Could not clear the round", description: "Please try again.", tone: "critical" });
      return;
    }
    games.reload();
    app.toast({
      title: `Round ${round} cleared`,
      description: "The boards and any scores have been removed.",
      tone: "info",
    });
  };

  return (
    <div>
      <PageHeader
        title="Live Event"
        badge={
          /*
           * Pulses only while a round is genuinely running. It used to pulse green
           * in every state, so a page opened the week before the event announced
           * itself as live.
           */
          <Badge
            tone={phase === "running" ? "success" : "neutral"}
            dot={phase === "running"}
            pulse={phase === "running"}
          >
            {EVENT_STATE_LABEL[eventState]}
          </Badge>
        }
        subtitle={`${event.name} · round ${round} of ${event.rounds}`}
        actions={
          <Link href={`/live/${event.slug}`} target="_blank" rel="noreferrer">
            <Button variant="secondary" icon={<Radio className="size-4" />}>
              Open participant view
            </Button>
          </Link>
        }
      />

      {/* Metrics --------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Checked in" value={checkedIn} sub={`of ${attending.length} registered`} icon={<UserCheck className="size-5" />} tone="success" />
        <Stat label="Boards" value={boards.totalBoards} sub={boards.totalBoards ? `round ${round}` : "not paired yet"} icon={<Grid3x3 className="size-5" />} tone={boards.totalBoards ? "primary" : "neutral"} />
        <Stat label="Recorded" value={boards.verified} sub={`${boards.percentComplete}% of round ${round}`} icon={<CheckCircle2 className="size-5" />} tone={boards.verified ? "success" : "neutral"} />
        <Stat label="Outstanding" value={boards.outstanding} sub={boards.outstanding ? "scores not in" : "all boards in"} icon={<Timer className="size-5" />} tone={boards.outstanding ? "warning" : "success"} />
        <Stat label="Conflicts" value={progress.conflicts} sub={progress.conflicts ? "need a ruling" : "none"} icon={<AlertTriangle className="size-5" />} tone={progress.conflicts ? "critical" : "success"} />
      </div>

      {/*
        * What to do next, from the phase table that has always defined it. This was
        * computed and tested but never rendered, leaving the phase dropdown as the only
        * guide — nine state names, no indication of which applied or what it would change.
        */}
      <div className="mt-4">
        <PhaseGuidance
          state={eventState}
          busy={publishing}
          onTransition={(to) => void setState(to)}
          onHandler={{
            /* Copies the registration link, which is what "Share registration" means. */
            share: () => {
              const url = origin ? `${origin}/events/${event.slug}/register` : "";
              if (!url) return;
              void navigator.clipboard?.writeText(url).then(
                () =>
                  app.toast({
                    title: "Registration link copied",
                    description: url,
                    tone: "success",
                  }),
                () =>
                  app.toast({
                    title: "Could not copy",
                    description: url,
                    tone: "warning",
                  }),
              );
            },
          }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Timer -------------------------------------------------------- */}
        <Card className="xl:col-span-5">
          <CardHeader
            title={`Round ${round} timer`}
            subtitle={
              timer?.extensions.length
                ? `Extended by ${timer.extensions.reduce((s, e) => s + e.minutes, 0)} minutes`
                : `${event.roundMinutes} minutes planned`
            }
            icon={<Timer className="size-4.5" />}
          />
          <div className="px-5 pb-5">
            <div
              className={cn(
                "rounded-feature p-6 text-center",
                phase === "running"
                  ? "bg-gradient-to-br from-success-050 to-cyan-050"
                  : phase === "paused"
                    ? "bg-warning-050"
                    : "bg-[rgb(var(--c-surface-soft))]",
              )}
            >
              <p className="num text-[52px] font-extrabold leading-none tracking-[-0.04em] text-ink">
                {formatClock(remaining)}
              </p>
              <p className="mt-1 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                {phase === "running"
                  ? "Round live"
                  : phase === "paused"
                    ? "Paused"
                    : phase === "finished"
                      ? "Round ended"
                      : "Not started"}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {phase === "not-started" ? (
                <Button variant="success" icon={<Play className="size-4" />} onClick={() => void setState("round-active")}>
                  Start round
                </Button>
              ) : null}
              {phase === "running" ? (
                <Button variant="secondary" icon={<Pause className="size-4" />} onClick={() => { void clock.pause(); live.pause(event.id, round); }}>
                  Pause
                </Button>
              ) : null}
              {phase === "paused" ? (
                <Button variant="success" icon={<Play className="size-4" />} onClick={() => { void clock.resume(); live.resume(event.id, round); }}>
                  Resume
                </Button>
              ) : null}
              {phase === "running" || phase === "paused" ? (
                <Button variant="danger" icon={<Square className="size-4" />} onClick={() => { void clock.end(); live.end(event.id, round); void setState("result-entry"); }}>
                  End round
                </Button>
              ) : null}
              {timer ? (
                <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setExtendOpen(true)}>
                  Add time
                </Button>
              ) : null}
            </div>

            {timer?.extensions.length ? (
              <ul className="mt-3 space-y-1.5">
                {timer.extensions.map((e, i) => (
                  <li key={i} className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-2 text-[12px]">
                    <span className="font-semibold text-ink">+{e.minutes} min</span>{" "}
                    <span className="text-muted">— {e.reason} ({e.by})</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Card>

        {/* Venue QR ------------------------------------------------------ */}
        <Card className="xl:col-span-3">
          <CardHeader title="Venue QR" subtitle="One code for the whole day" icon={<QrCode className="size-4.5" />} />
          <div className="flex flex-col items-center gap-3 px-5 pb-5">
            {origin ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrToDataUri(liveUrl, { size: 190 })}
                alt="Venue event QR code"
                width={190}
                height={190}
                className="rounded-compact border border-line bg-white p-2"
              />
            ) : (
              <div className="size-[190px] animate-pulse rounded-compact bg-[rgb(var(--c-line))]" />
            )}
            <p className="text-center text-[12px] leading-relaxed text-muted">
              This code never changes. It opens whatever the event needs right now —
              currently <strong className="font-semibold text-ink">{EVENT_STATE_LABEL[eventState]}</strong>.
            </p>
          </div>
        </Card>

        {/* Table plan ----------------------------------------------------- */}
        <Card className="xl:col-span-4">
          <CardHeader
            title="Table plan"
            subtitle="Which tables each division sits at"
            icon={<Grid3x3 className="size-4.5" />}
          />
          <div className="space-y-3 px-5 pb-5">
            {/*
              Typed as text rather than picked from a list of every table in the room. A venue
              has pillars, doors and a table that wobbles, so "1-3, 7, 9-11" has to be as easy
              to say as "1-12".
            */}
            {app.divisions.map((d) => (
              <Field
                key={d.id}
                label={d.name}
                hint="A range or a list — 1-5, or 1, 2, 3, 5, 7"
              >
                <Input
                  value={tableDraft[d.id] ?? ""}
                  onChange={(e) => setTableDraft((t) => ({ ...t, [d.id]: e.target.value }))}
                  placeholder="e.g. 1-5"
                  className="num"
                />
              </Field>
            ))}

            {/*
              Counted from what is typed, before it is saved. "1-5" meaning five tables is
              obvious; "1-3, 7, 9-11" meaning seven is not, and the number of seats is the
              thing that has to be right.
            */}
            <p className="text-[12px] leading-relaxed text-muted">
              {app.divisions
                .map((d) => {
                  const n = parseTableSpec(tableDraft[d.id] ?? "").length;
                  return `${d.name}: ${n} table${n === 1 ? "" : "s"}`;
                })
                .join(" · ")}
            </p>

            {tableClashes.length > 0 ? (
              <p className="rounded-control bg-critical-050 px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-critical">
                Table {tableClashes.join(", ")} is listed for more than one division. Two games
                cannot share a table.
              </p>
            ) : null}

            <Button
              variant="secondary"
              className="w-full"
              disabled={tableClashes.length > 0}
              onClick={() => void saveTablePlan()}
            >
              Save table plan
            </Button>
          </div>
        </Card>

        {/* Phase control -------------------------------------------------- */}
        <Card className="xl:col-span-4">
          <CardHeader title="Event phase" subtitle="Controls what every participant sees" />
          <div className="space-y-3 px-5 pb-5">
            <Field label="Current phase">
              <Select value={eventState} onChange={(e) => void setState(e.target.value as EventState)}>
                {DAY_FLOW.map((s) => (
                  <option key={s} value={s}>
                    {EVENT_STATE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>


            <div className="space-y-2">
              {eventState === "registration-closed" || eventState === "preparing" ? (
                <Button variant="primary" className="w-full" icon={<UserCheck className="size-4" />} onClick={() => void setState("check-in-open")}>
                  Open check-in
                </Button>
              ) : null}
              {eventState === "check-in-open" ? (
                <Button variant="primary" className="w-full" onClick={() => void setState("check-in-closed")}>
                  Close check-in ({checkedIn} in)
                </Button>
              ) : null}
              {eventState === "check-in-closed" ? (
                <Button
                  variant="primary"
                  className="w-full"
                  icon={<Grid3x3 className="size-4" />}
                  onClick={publishPairings}
                  disabled={publishing || roster.access !== "ok"}
                >
                  {publishing ? "Publishing…" : `Pair and publish round ${games.round + 1}`}
                </Button>
              ) : null}
              {eventState === "result-entry" ? (
                <>
                  <div
                    className={cn(
                      "rounded-control px-3.5 py-2.5 text-[12.5px] leading-relaxed",
                      advance.ready ? "bg-success-050 text-[#12855c]" : "bg-warning-050 text-[#a76d16]",
                    )}
                  >
                    {advance.reason}
                  </div>
                  {/*
                    Two buttons rather than a break plus a toggle. On the day the question is
                    "are we stopping for ten minutes or for lunch", and answering it in one
                    press is the difference between a wall that says the right thing and one
                    nobody remembered to change.
                  */}
                  <Button variant="secondary" className="w-full" icon={<Coffee className="size-4" />} onClick={() => void startBreak("break")}>
                    Start break
                  </Button>
                  <Button variant="secondary" className="w-full" onClick={() => void startBreak("lunch")}>
                    Start lunch break
                  </Button>
                </>
              ) : null}
              {eventState === "break" ? (
                <Button
                  variant="primary"
                  className="w-full"
                  icon={<ArrowRight className="size-4" />}
                  disabled={round >= event.rounds}
                  onClick={() => {
                    live.setRound(event.id, round + 1);
                    void setState("check-in-closed");
                  }}
                >
                  {round >= event.rounds ? "Final round complete" : `Prepare round ${round + 1}`}
                </Button>
              ) : null}

            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[12.5px] font-semibold text-muted">Scores recorded</span>
                <span className="num text-[13px] font-bold text-ink">
                  {boards.verified}/{boards.totalBoards}
                </span>
              </div>
              <Progress value={boards.percentComplete} tone="success" label="Scores recorded" />
            </div>

            {boards.totalBoards > 0 ? (
              <Button variant="ghost" className="w-full" onClick={dropRound}>
                Clear round {round}
              </Button>
            ) : null}
          </div>
        </Card>

        {/* Check-in roster ------------------------------------------------ */}
        <Card className="xl:col-span-12">
          <CardHeader
            title="Check-in"
            subtitle={`${checkedIn} of ${attending.length} registered players are at the venue`}
            icon={<Users className="size-4.5" />}
            action={
              <Button size="sm" variant="secondary" onClick={roster.reload}>
                Refresh
              </Button>
            }
          />
          <div className="px-4 pb-4">
            {/*
        The day, running itself. Announced and cancellable — an event that rearranges a room
        with no warning is worse than one that waits.
      */}
      <AutoRun
        round={games.round}
        totalRounds={event.rounds}
        boardsTotal={games.progress.totalBoards}
        boardsVerified={games.progress.verified}
        /*
         * The effective phase, not the raw stored one. `storedPhase.state` is null until the
         * first read returns and can lag a write by a poll — and auto-run comparing against
         * null simply never fires, which is exactly what happened.
         */
        phase={eventState}
        onPublish={publishPairings}
        onPhase={setState}
      />

      <RosterGate access={roster.access} loaded={roster.loaded}>
              <ArrivalList players={attending} onChanged={roster.reload} />
            </RosterGate>
          </div>
        </Card>
      </div>

      <ExtendModal
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        onExtend={(minutes, reason) => {
          const by = app.currentUser?.name ?? "Director";
          live.extend(event.id, round, minutes, reason, by);
          setExtendOpen(false);

          void clock.extend(minutes, reason, by).then((ok) => {
            app.toast({
              title: ok
                ? `Round extended by ${minutes} minutes`
                : "Extension not shared",
              description: ok
                ? `${reason} — every screen in the room now shows the new time.`
                : "The extra time shows here but not on the display or anybody's phone.",
              tone: ok ? "success" : "critical",
            });
          });
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The arrival list, and the desk's way of marking somebody present.
 *
 * Writes to the database rather than to this browser, so the count on the venue
 * display, the count on the self check-in page and the count here are the same
 * number. Every device previously kept its own tally.
 *
 * Search comes first because on the day the list is long and the question is
 * always about one specific person standing in front of you.
 */
function ArrivalList({
  players,
  onChanged,
}: {
  players: Player[];
  onChanged: () => void;
}) {
  const app = useStore();
  const [query, setQuery] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  const [hideArrived, setHideArrived] = React.useState(false);

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (hideArrived && p.checkIn === "checked-in") return false;
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.playerId.toLowerCase().includes(q) ||
        p.emergencyContact.phone.includes(q)
      );
    });
  }, [players, query, hideArrived]);

  const check = async (player: Player) => {
    setPending(player.id);
    const result = await staffCheckIn(player.id);
    setPending(null);

    if (!result.ok) {
      app.toast({ title: "Not checked in", description: result.message ?? "", tone: "critical" });
      return;
    }

    onChanged();
    app.toast({
      title: result.already
        ? `${player.fullName} was already checked in`
        : `${player.fullName} checked in`,
      description: result.at ? `Arrival recorded at ${formatTime(result.at)}.` : "",
      tone: result.already ? "warning" : "success",
    });
  };

  const undo = async (player: Player) => {
    setPending(player.id);
    const ok = await staffUndoCheckIn(player.id);
    setPending(null);

    if (!ok) {
      app.toast({ title: "Could not undo", description: "Please try again.", tone: "critical" });
      return;
    }
    onChanged();
    app.toast({
      title: `${player.fullName} marked not arrived`,
      description: "Their arrival has been cleared.",
      tone: "success",
    });
  };

  if (players.length === 0) {
    return (
      <EmptyState
        title="Nobody has registered yet"
        description="Registrations appear here as they come in from the public form."
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a name, entry number or mobile"
          className="sm:max-w-sm"
        />
        <Button
          size="sm"
          variant={hideArrived ? "primary" : "secondary"}
          onClick={() => setHideArrived((v) => !v)}
          className="sm:ml-auto"
        >
          {hideArrived ? "Showing not arrived" : "Show everyone"}
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="Nobody matches"
          description={
            hideArrived
              ? "Everyone matching that search has already arrived."
              : "No player matches that search."
          }
        />
      ) : (
        <div className="max-h-[380px] space-y-1 overflow-y-auto scroll-slim">
          {shown.map((p) => {
            const inVenue = p.checkIn === "checked-in";
            const busy = pending === p.id;
            return (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-3 rounded-control px-3 py-2.5",
                  inVenue ? "bg-success-050/60" : "bg-[rgb(var(--c-surface-soft))]",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {p.fullName}
                  </span>
                  <span className="block truncate text-[11.5px] capitalize text-muted">
                    {p.playerId} · {p.division.replace(/-/g, " ")}
                    {inVenue && p.checkInAt ? ` · in at ${formatTime(p.checkInAt)}` : ""}
                  </span>
                </span>
                {p.payment !== "paid" ? (
                  <Badge tone="warning">unpaid</Badge>
                ) : null}
                <Button
                  size="sm"
                  variant={inVenue ? "ghost" : "secondary"}
                  disabled={busy}
                  onClick={() => (inVenue ? undo(p) : check(p))}
                >
                  {busy ? "…" : inVenue ? "Undo" : "Check in"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ExtendModal({
  open,
  onClose,
  onExtend,
}: {
  open: boolean;
  onClose: () => void;
  onExtend: (minutes: number, reason: string) => void;
}) {
  const [minutes, setMinutes] = React.useState(10);
  const [reason, setReason] = React.useState("");

  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setMinutes(10);
      setReason("");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Extend the round"
      subtitle="Every participant screen updates immediately."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!reason.trim()} onClick={() => onExtend(minutes, reason)}>
            Add {minutes} minutes
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-4 gap-2">
          {[5, 10, 15, 20].map((m) => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              className={cn(
                "rounded-control border px-3 py-3 text-center transition-colors",
                minutes === m
                  ? "border-primary bg-primary-050"
                  : "border-line bg-[rgb(var(--c-surface-strong))] hover:bg-[rgb(var(--c-surface-soft))]",
              )}
            >
              <span className="num block text-[18px] font-extrabold text-ink">{m}</span>
              <span className="block text-[11px] text-muted">min</span>
            </button>
          ))}
        </div>

        <Field label="Custom">
          <Input
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
            className="num"
          />
        </Field>

        <Field label="Reason" required hint="Recorded against your name in the audit log.">
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Four tables still playing."
          />
        </Field>
      </div>
    </Modal>
  );
}
