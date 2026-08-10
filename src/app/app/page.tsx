"use client";

import * as React from "react";
import { ACTIVE_EVENT_ID } from "@/lib/domain/eventSeed";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Grid3x3,
  ListOrdered,
  MapPin,
  Radio,
  Settings2,
  Timer,
  TrendingUp,
  UserX,
  Users,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Progress,
  Stat,
} from "@/components/ui";
import { SyncIndicator } from "@/components/ui/states";
import { selectStandings, useStore } from "@/lib/store/useStore";
import { useRoster } from "@/lib/supabase/useRoster";
import { useGames } from "@/lib/supabase/useGames";
import { cn, formatTime, signed, timeAgo } from "@/lib/utils";
import { LetterTile } from "@/components/art/ScrabbleArt";


export default function CommandCentrePage() {
  const router = useRouter();
  const store = useStore();
  const { tournament, pairings, venue, activity } = store;

  /*
   * The player count comes from the database. This is the first screen an
   * organizer opens, and it reported "No players yet" however many people had
   * registered, because it was counting an array in browser storage that nothing
   * fills any more.
   */
  const roster = useRoster(ACTIVE_EVENT_ID);
  const players = roster.players;

  const round = tournament.currentRound;
  const roundPairings = React.useMemo(
    () => pairings.filter((p) => p.round === round).sort((a, b) => a.board - b.board),
    [pairings, round],
  );

  const checkedIn = players.filter((p) => p.checkIn === "checked-in").length;
  const liveGames = roundPairings.filter((p) => p.status === "live").length;
  const pending = roundPairings.filter((p) => p.status === "awaiting-verification");
  const verified = roundPairings.filter((p) => p.status === "verified").length;
  const playable = roundPairings.filter((p) => p.playerBId !== null).length;

  const conflicted = roundPairings.filter((p) =>
    p.conflicts.some((c) => !c.acknowledgedReason),
  ).length;
  const approvedExceptions = roundPairings.filter((p) =>
    p.conflicts.some((c) => !!c.acknowledgedReason),
  ).length;
  /*
   * No boards means there is nothing to report, not a perfect score. This read
   * 100% before a single pairing existed, which is a confident claim about work
   * that has not happened.
   */
  const health = playable > 0 ? Math.round(((playable - conflicted) / playable) * 100) : null;
  const completion = playable > 0 ? Math.round((verified / playable) * 100) : 0;

  const standings = React.useMemo(
    () => selectStandings(store, { division: "masters" }).slice(0, 5),
    [store],
  );
  const playerOf = (id: string) => players.find((p) => p.id === id);

  return (
    <div>
      {/* ---------------------------------------------------------------- */}
      {/* Championship hero                                                 */}
      {/* ---------------------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="glass relative mb-5 overflow-hidden rounded-hero"
      >
        {/* Event gradient wash */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(104deg, rgba(115,87,246,0.16) 0%, rgba(57,135,248,0.11) 46%, rgba(85,201,232,0.10) 100%)",
          }}
          aria-hidden
        />
        <div className="board-motif pointer-events-none absolute inset-0 opacity-40" aria-hidden />

        <div className="relative flex flex-col gap-5 p-6 sm:p-8 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            {/*
              * The status badge reads the tournament rather than asserting
              * "Live". A pulsing Live badge over a tournament with no players
              * and no played rounds claims an event is under way when nothing
              * has started.
              */}
            <div className="flex flex-wrap items-center gap-2">
              {tournament.status === "live" ? (
                <Badge tone="success" dot pulse>
                  Live
                </Badge>
              ) : tournament.status === "complete" ? (
                <Badge tone="neutral">Complete</Badge>
              ) : (
                <Badge tone="warning">Setup</Badge>
              )}
              <Badge tone="neutral">Swiss System</Badge>
              {/*
                * Reports the roster read, rather than claiming "Synced"
                * unconditionally as it did when nothing was being synced at all.
                */}
              {roster.loaded ? (
                roster.access === "ok" ? <SyncIndicator state="synced" /> : null
              ) : (
                <SyncIndicator state="syncing" />
              )}
            </div>

            <h1 className="mt-3 text-[26px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[34px]">
              {tournament.name.replace(" — Demo", "")}
            </h1>

            {/* Each fact appears only once it is real. */}
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-muted">
              {venue.totalBoards > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  {venue.name} · {tournament.city}
                </span>
              ) : null}
              {round > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <ListOrdered className="size-4" />
                  Round {round} of {tournament.totalRounds}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4" />
                {players.length === 0
                  ? "No players yet"
                  : `${players.length} player${players.length === 1 ? "" : "s"}`}
              </span>
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="primary"
                icon={<Grid3x3 className="size-4" />}
                onClick={() => router.push("/app/live-event")}
              >
                Generate Round {round + 1}
              </Button>
              <Button
                variant="secondary"
                icon={<Radio className="size-4" />}
                onClick={() => window.open("/live/tv", "_blank")}
              >
                Broadcast Mode
              </Button>
              <Button
                variant="secondary"
                icon={<ArrowRight className="size-4" />}
                onClick={() => window.open("/live", "_blank")}
              >
                Open Public Website
              </Button>
              <Button
                variant="ghost"
                icon={<Settings2 className="size-4" />}
                onClick={() => router.push("/app/settings")}
              >
                Tournament Controls
              </Button>
            </div>
          </div>

          {/* Decorative tile composition */}
          <div className="hidden shrink-0 items-end gap-2 xl:flex" aria-hidden>
            <LetterTile letter="W" size={54} className="float-soft-slow" />
            <LetterTile letter="I" size={54} className="float-soft" style={{ animationDelay: "300ms" }} />
            <LetterTile letter="N" size={54} tone="gold" className="float-soft-slow" style={{ animationDelay: "600ms" }} />
          </div>
        </div>
      </motion.div>

      {/* ---------------------------------------------------------------- */}
      {/* Six primary metrics                                               */}
      {/* ---------------------------------------------------------------- */}
      <div
        data-tour="command-stats"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
      >
        <Stat
          label="Registered Players"
          value={players.length}
          sub={`${checkedIn} checked in`}
          icon={<Users className="size-5" />}
          tone="primary"
          onClick={() => router.push("/app/players")}
        />
        <Stat
          label="Current Round"
          value={`${round} of ${tournament.totalRounds}`}
          sub={`${completion}% completed`}
          icon={<ListOrdered className="size-5" />}
          tone="info"
          onClick={() => router.push("/app/live-event")}
        />
        <Stat
          label="Active Boards"
          value={liveGames}
          sub={
            roundPairings.length === 0
              ? "No boards yet"
              : pending.length
                ? `${pending.length} awaiting results`
                : "All results in"
          }
          icon={<Activity className="size-5" />}
          tone="success"
          onClick={() => router.push("/app/score-entry")}
        />
        <Stat
          label="Pairing Health"
          value={health === null ? "—" : `${health}%`}
          sub={
            health === null
              ? "No pairings yet"
              : approvedExceptions
                ? `${approvedExceptions} approved exception${approvedExceptions === 1 ? "" : "s"}`
                : conflicted
                  ? `${conflicted} to review`
                  : "No conflicts"
          }
          icon={<CheckCircle2 className="size-5" />}
          tone={health === null ? "neutral" : health >= 95 ? "success" : "warning"}
          onClick={() => router.push("/app/live-event")}
        />
        {/*
          * Was "Schedule: 8 min behind" — a figure invented from the number of
          * results outstanding. Nothing in the system measures pacing against a
          * plan, so it now reports the tournament state, which is a fact.
          */}
        <Stat
          label="Tournament"
          value={
            tournament.status === "live"
              ? "Running"
              : tournament.status === "complete"
                ? "Complete"
                : "Not started"
          }
          sub={
            tournament.status === "live"
              ? `Round ${round} of ${tournament.totalRounds}`
              : tournament.status === "complete"
                ? "All rounds played"
                : "Set up and pair to begin"
          }
          icon={<CalendarClock className="size-5" />}
          tone={tournament.status === "live" ? "success" : "neutral"}
          onClick={() => router.push("/app/live-event")}
        />
        {/*
          * A "Venue: 0 boards" tile linking to a seating screen that no longer
          * exists. No venue layout is stored anywhere, so the number was always
          * zero and the link always led nowhere.
          */}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Main grid                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* LEFT — live round control */}
        <Card className="xl:col-span-4">
          <CardHeader
            title="Live Round Control"
            subtitle={`Round ${round} · ${playable} boards`}
            icon={<Gauge className="size-4.5" />}
            action={
              <Link
                href="/app/live-event"
                className="text-[12.5px] font-semibold text-primary-600 hover:underline"
              >
                Open
              </Link>
            }
          />
          <div className="space-y-3.5 px-5 pb-5">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[12.5px] font-semibold text-muted">Round progress</span>
                <span className="num text-[13px] font-bold text-ink">
                  {verified}/{playable}
                </span>
              </div>
              <Progress value={completion} tone="success" label="Round progress" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <RoundStat label="Completed" value={verified} tone="success" />
              <RoundStat label="Active" value={liveGames} tone="primary" />
              <RoundStat label="Pending scores" value={pending.length} tone="warning" />
              <RoundStat
                label="Disputed"
                value={roundPairings.filter((p) => p.status === "disputed").length}
                tone="critical"
              />
            </div>

            <div className="rounded-compact bg-[rgb(var(--c-surface-soft))] p-3.5">
              <p className="text-[12px] font-semibold text-muted">Estimated completion</p>
              <p className="mt-0.5 text-[15px] font-bold text-ink">
                {liveGames + pending.length === 0
                  ? "Round complete"
                  : `About ${Math.max(8, (liveGames + pending.length) * 2)} minutes`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
{/*
                * A "start the clock" button that only announced the clock was running.
                * The timer lives in Live Event and is the one that participants see, so
                * this offered a second, imaginary one.
                */}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push("/app/score-entry")}
              >
                Enter scores
              </Button>
            </div>
          </div>
        </Card>

        {/* CENTER — current leaders */}
        <Card className="xl:col-span-4">
          <CardHeader
            title="Current Leaders"
            subtitle="Masters division"
            icon={<TrendingUp className="size-4.5" />}
            action={
              <Link
                href="/app/standings"
                className="tap-target text-[12.5px] font-semibold text-primary-600 hover:underline"
              >
                Full table
              </Link>
            }
          />
          <div className="space-y-1.5 px-4 pb-4">
            {standings.map((row, i) => {
              const p = playerOf(row.playerId);
              if (!p) return null;
              const move = row.previousRank - row.rank;
              return (
                <button
                  key={row.playerId}
                  onClick={() => router.push(`/app/players/${p.playerId}`)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-compact px-3 py-2.5 text-left transition-colors",
                    i === 0
                      ? "bg-gradient-to-r from-gold-050 to-transparent"
                      : "bg-[rgb(var(--c-surface-soft))] hover:bg-[rgb(var(--c-surface-strong))]",
                  )}
                >
                  <span
                    className={cn(
                      "num grid size-7 shrink-0 place-items-center rounded-full text-[12.5px] font-extrabold",
                      i === 0
                        ? "bg-gradient-to-br from-[#F0BE5C] to-gold text-[#4A3208]"
                        : "bg-[rgb(var(--c-line))] text-ink",
                    )}
                  >
                    {row.rank}
                  </span>
                  <Avatar initials={p.initials} hue={p.avatarHue} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-ink">
                      {p.fullName}
                    </span>
                    <span className="num block text-[11.5px] text-muted">
                      {p.rating || "Unrated"} · {row.wins}–{row.losses} · {signed(row.spread)}
                    </span>
                  </span>
                  {move !== 0 ? (
                    <span
                      className={cn(
                        "num shrink-0 text-[11.5px] font-bold",
                        move > 0 ? "text-success" : "text-critical",
                      )}
                    >
                      {move > 0 ? "▲" : "▼"} {Math.abs(move)}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11.5px] text-faint">—</span>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {/* RIGHT — attention centre */}
        <div className="xl:col-span-4">
          <AttentionCentre />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Bottom grid                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/*
          * "Venue & Board Status" removed. It read a venue that is never set: no
          * halls, no accessible boards, zero total — so the card rendered three
          * zeroes and an empty list, under a link to a screen that is now gone.
          */}
        <Card className="xl:col-span-4">
          <CardHeader
            title="Round Timeline"
            subtitle={`${tournament.totalRounds} rounds scheduled`}
            icon={<Timer className="size-4.5" />}
          />
          <div className="px-5 pb-5">
            <ol className="relative space-y-2 border-l border-line pl-5">
              {Array.from({ length: tournament.totalRounds }, (_, i) => i + 1).map((r) => {
                const done = r < round;
                const current = r === round;
                return (
                  <li key={r} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[26px] top-2 size-3 rounded-full ring-4 ring-[rgb(var(--c-canvas))]",
                        done ? "bg-success" : current ? "bg-primary" : "bg-[rgb(var(--c-line-strong))]",
                      )}
                    />
                    <div
                      className={cn(
                        "flex items-center justify-between rounded-control px-3 py-2",
                        current ? "bg-primary-050" : "bg-[rgb(var(--c-surface-soft))]",
                      )}
                    >
                      <span className="text-[12.5px] font-semibold text-ink">Round {r}</span>
                      <Badge tone={done ? "success" : current ? "primary" : "neutral"} dot={current} pulse={current}>
                        {done ? "Complete" : current ? "In progress" : "Scheduled"}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader
            title="Recent Activity"
            subtitle="Every action is written to the audit log"
            icon={<Activity className="size-4.5" />}
            action={
              <Link
                href="/app/settings#audit"
                className="tap-target text-[12.5px] font-semibold text-primary-600 hover:underline"
              >
                Audit log
              </Link>
            }
          />
          <ul className="max-h-[340px] space-y-1 overflow-y-auto px-4 pb-4 scroll-slim">
            {activity.slice(0, 8).map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-2.5"
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-control",
                    a.kind === "result" && "bg-success-050 text-[#12855c]",
                    a.kind === "pairing" && "bg-primary-050 text-primary",
                    a.kind === "checkin" && "bg-info-050 text-[#2668c9]",
                    a.kind === "board" && "bg-warning-050 text-[#a76d16]",
                    a.kind === "correction" && "bg-critical-050 text-[#c33450]",
                    a.kind === "sync" && "bg-[rgb(var(--c-line))] text-muted",
                  )}
                >
                  <Activity className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{a.message}</span>
                  <span className="block text-[11.5px] text-muted">
                    {a.user} · {formatTime(a.at)} · {timeAgo(a.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="xl:col-span-12">
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RoundStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "primary" | "warning" | "critical";
}) {
  return (
    <div
      className={cn(
        "rounded-control px-3 py-2.5",
        tone === "success" && "bg-success-050",
        tone === "primary" && "bg-primary-050",
        tone === "warning" && "bg-warning-050",
        tone === "critical" && "bg-critical-050",
      )}
    >
      <p className="num text-[19px] font-extrabold text-ink">{value}</p>
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Attention centre — every alert carries a working action                     */
/* -------------------------------------------------------------------------- */

function AttentionCentre() {
  const router = useRouter();
  const store = useStore();
  const { tournament } = store;
  const players = useRoster(ACTIVE_EVENT_ID).players;

  /*
   * Games come from the database, so these alerts describe the tournament that is
   * actually being run. Every one of them read `store.pairings` before, which
   * nothing fills, so the Attention Centre could only ever say "nothing needs
   * attention" — the one message it must never get wrong.
   */
  const games = useGames(ACTIVE_EVENT_ID, tournament.id);
  const round = games.round;

  const boards = games.games.filter((g) => g.round === round);
  const outstanding = boards.filter((g) => g.scoreA === null);
  const everyBoardIn = boards.length > 0 && outstanding.length === 0;

  /*
   * Players who arrived but hold no board this round. On the day this is the
   * question that actually comes up: somebody is standing in the room and the
   * pairing sheet does not have them on it.
   */
  const seated = new Set(boards.flatMap((g) => [g.playerA, g.playerB].filter(Boolean) as string[]));
  const arrivedUnseated = players.filter(
    (p) => p.checkIn === "checked-in" && !seated.has(p.id),
  );

  const unpaid = players.filter((p) => p.checkIn === "checked-in" && p.payment === "pending");

  type Alert = {
    id: string;
    tone: "critical" | "warning" | "info";
    title: string;
    body: string;
    actionLabel: string;
    onAction: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
  };

  const alerts: Alert[] = [];

  if (round > 0 && arrivedUnseated.length > 0) {
    alerts.push({
      id: "unseated",
      tone: "critical",
      title: `${arrivedUnseated.length} player${arrivedUnseated.length === 1 ? "" : "s"} arrived with no board`,
      body:
        arrivedUnseated.length === 1
          ? `${arrivedUnseated[0]!.fullName} has checked in but is not on the round ${round} sheet.`
          : `They have checked in but are not on the round ${round} sheet. Re-pair to include them.`,
      actionLabel: "Open Live Event",
      onAction: () => router.push("/app/live-event"),
    });
  }

  if (outstanding.length > 0) {
    alerts.push({
      id: "outstanding",
      tone: "warning",
      title: `${outstanding.length} board${outstanding.length === 1 ? "" : "s"} without a score`,
      body: `Round ${round} cannot be closed until every board is recorded. Board${
        outstanding.length === 1 ? "" : "s"
      } ${outstanding.slice(0, 6).map((g) => g.board).join(", ")}${
        outstanding.length > 6 ? "…" : ""
      }.`,
      actionLabel: "Enter scores",
      onAction: () => router.push("/app/score-entry"),
    });
  }

  if (unpaid.length > 0) {
    alerts.push({
      id: "unpaid",
      tone: "warning",
      title: `${unpaid.length} player${unpaid.length === 1 ? "" : "s"} playing without a verified payment`,
      body: "They have arrived and their payment has not been confirmed.",
      actionLabel: "Open payments",
      onAction: () => router.push(`/app/events/${ACTIVE_EVENT_ID}/payments`),
    });
  }

  if (everyBoardIn && round < tournament.totalRounds) {
    alerts.push({
      id: "next-round",
      tone: "info",
      title: `Round ${round} is complete`,
      body: `Every board is recorded. Round ${round + 1} can be paired and published.`,
      actionLabel: "Pair next round",
      onAction: () => router.push("/app/live-event"),
    });
  }

  if (round === 0 && players.some((p) => p.checkIn === "checked-in")) {
    alerts.push({
      id: "not-started",
      tone: "info",
      title: "Players have arrived and no round is paired",
      body: `${players.filter((p) => p.checkIn === "checked-in").length} checked in. Pair round 1 when you are ready.`,
      actionLabel: "Open Live Event",
      onAction: () => router.push("/app/live-event"),
    });
  }

  return (
    <Card className="h-full">
      <CardHeader
        title="Attention Centre"
        subtitle={`${alerts.length} item${alerts.length === 1 ? "" : "s"} need a decision`}
        icon={<AlertTriangle className="size-4.5" />}
      />
      <div className="max-h-[420px] space-y-2 overflow-y-auto px-4 pb-4 scroll-slim">
        {alerts.length === 0 ? (
          <div className="rounded-compact bg-success-050 p-5 text-center">
            <CheckCircle2 className="mx-auto size-7 text-success" />
            <p className="mt-2 text-[14px] font-bold text-ink">Nothing needs attention</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              All boards are running and every result is verified.
            </p>
          </div>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-compact border p-3.5",
                a.tone === "critical" && "border-critical/25 bg-critical-050/50",
                a.tone === "warning" && "border-warning/25 bg-warning-050/50",
                a.tone === "info" && "border-info/25 bg-info-050/50",
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 grid size-7 shrink-0 place-items-center rounded-control",
                    a.tone === "critical" && "bg-critical/12 text-[#c33450]",
                    a.tone === "warning" && "bg-warning/15 text-[#a76d16]",
                    a.tone === "info" && "bg-info/12 text-[#2668c9]",
                  )}
                >
                  {a.tone === "critical" ? (
                    <UserX className="size-3.5" />
                  ) : a.tone === "warning" ? (
                    <AlertTriangle className="size-3.5" />
                  ) : (
                    <ClipboardList className="size-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold leading-snug text-ink">{a.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{a.body}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary" onClick={a.onAction}>
                      {a.actionLabel}
                      <ArrowRight className="size-3.5" />
                    </Button>
                    {a.secondaryLabel && a.onSecondary ? (
                      <Button size="sm" variant="ghost" onClick={a.onSecondary}>
                        {a.secondaryLabel}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
