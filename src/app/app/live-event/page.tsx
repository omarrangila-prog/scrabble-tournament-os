"use client";

import * as React from "react";
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
import { RosterGate } from "@/components/organizer/RosterGate";
import { EventState, EVENT_STATE_LABEL } from "@/lib/domain/events";
import type { Player } from "@/lib/domain/types";
import {
  canAdvanceRound,
  formatClock,
  phaseOf,
  remainingMs,
} from "@/lib/engine/roundTimer";
import { qrToDataUri } from "@/lib/qr/qrcode";
import { cn, formatTime } from "@/lib/utils";

const EVENT_ID = "evt-alphabattle-23-august";

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
  const roster = useRoster(EVENT_ID);

  const origin = React.useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const [extendOpen, setExtendOpen] = React.useState(false);

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

  const round = live.currentRound(event.id);
  const timer = live.timerFor(event.id, round);
  const phase = timer ? phaseOf(timer) : "not-started";
  const remaining = timer ? remainingMs(timer) : event.roundMinutes * 60_000;

  /*
   * Arrivals are counted from the database, so the number agrees with the one the
   * self check-in page and the venue display show. Counting them in this browser
   * gave each device its own answer.
   */
  const attending = roster.players.filter((p) => p.checkIn !== "withdrawn");
  const checkedIn = attending.filter((p) => p.checkIn === "checked-in").length;
  const progress = live.progressFor(event.id, round);
  const advance = canAdvanceRound(progress);

  const liveUrl = origin ? `${origin}/live/${event.slug}` : `/live/${event.slug}`;

  const setState = (state: EventState) => {
    events.setEventState(event.id, state);
    if (state === "round-active") {
      live.ensureTimer(event.id, round, event.roundMinutes);
      live.start(event.id, round);
    }
    app.toast({
      title: EVENT_STATE_LABEL[state],
      description: "Participant screens and the venue display have been updated.",
      tone: "success",
    });
  };

  const publishPairings = () => {
    const ids = attending
      .filter((p) => p.checkIn === "checked-in")
      .map((p) => p.id);
    if (ids.length < 2) {
      app.toast({
        title: "Not enough players checked in",
        description: "At least two checked-in players are needed to pair a round.",
        tone: "warning",
      });
      return;
    }
    live.generatePairings(event.id, round, ids);
    live.ensureTimer(event.id, round, event.roundMinutes);
    setState("round-published");
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
            {EVENT_STATE_LABEL[event.state]}
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
        <Stat label="Boards" value={progress.totalBoards} sub={`round ${round}`} icon={<Grid3x3 className="size-5" />} tone="primary" />
        <Stat label="Verified" value={progress.verified} sub={`${progress.percentComplete}% complete`} icon={<CheckCircle2 className="size-5" />} tone="success" />
        <Stat label="Awaiting" value={progress.awaitingConfirmation} sub="opponent confirmation" icon={<Timer className="size-5" />} tone={progress.awaitingConfirmation ? "warning" : "success"} />
        <Stat label="Conflicts" value={progress.conflicts} sub={progress.conflicts ? "need a ruling" : "none"} icon={<AlertTriangle className="size-5" />} tone={progress.conflicts ? "critical" : "success"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
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
                <Button variant="success" icon={<Play className="size-4" />} onClick={() => setState("round-active")}>
                  Start round
                </Button>
              ) : null}
              {phase === "running" ? (
                <Button variant="secondary" icon={<Pause className="size-4" />} onClick={() => live.pause(event.id, round)}>
                  Pause
                </Button>
              ) : null}
              {phase === "paused" ? (
                <Button variant="success" icon={<Play className="size-4" />} onClick={() => live.resume(event.id, round)}>
                  Resume
                </Button>
              ) : null}
              {phase === "running" || phase === "paused" ? (
                <Button variant="danger" icon={<Square className="size-4" />} onClick={() => { live.end(event.id, round); setState("result-entry"); }}>
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
              currently <strong className="font-semibold text-ink">{EVENT_STATE_LABEL[event.state]}</strong>.
            </p>
          </div>
        </Card>

        {/* Phase control -------------------------------------------------- */}
        <Card className="xl:col-span-4">
          <CardHeader title="Event phase" subtitle="Controls what every participant sees" />
          <div className="space-y-3 px-5 pb-5">
            <Field label="Current phase">
              <Select value={event.state} onChange={(e) => setState(e.target.value as EventState)}>
                {DAY_FLOW.map((s) => (
                  <option key={s} value={s}>
                    {EVENT_STATE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="space-y-2">
              {event.state === "registration-closed" || event.state === "preparing" ? (
                <Button variant="primary" className="w-full" icon={<UserCheck className="size-4" />} onClick={() => setState("check-in-open")}>
                  Open check-in
                </Button>
              ) : null}
              {event.state === "check-in-open" ? (
                <Button variant="primary" className="w-full" onClick={() => setState("check-in-closed")}>
                  Close check-in ({checkedIn} in)
                </Button>
              ) : null}
              {event.state === "check-in-closed" ? (
                <Button variant="primary" className="w-full" icon={<Grid3x3 className="size-4" />} onClick={publishPairings}>
                  Publish round {round} pairings
                </Button>
              ) : null}
              {event.state === "result-entry" ? (
                <>
                  <div
                    className={cn(
                      "rounded-control px-3.5 py-2.5 text-[12.5px] leading-relaxed",
                      advance.ready ? "bg-success-050 text-[#12855c]" : "bg-warning-050 text-[#a76d16]",
                    )}
                  >
                    {advance.reason}
                  </div>
                  <Button variant="secondary" className="w-full" icon={<Coffee className="size-4" />} onClick={() => setState("break")}>
                    Start break
                  </Button>
                </>
              ) : null}
              {event.state === "break" ? (
                <Button
                  variant="primary"
                  className="w-full"
                  icon={<ArrowRight className="size-4" />}
                  disabled={round >= event.rounds}
                  onClick={() => {
                    live.setRound(event.id, round + 1);
                    setState("check-in-closed");
                  }}
                >
                  {round >= event.rounds ? "Final round complete" : `Prepare round ${round + 1}`}
                </Button>
              ) : null}
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[12.5px] font-semibold text-muted">Results verified</span>
                <span className="num text-[13px] font-bold text-ink">
                  {progress.verified}/{progress.totalBoards}
                </span>
              </div>
              <Progress value={progress.percentComplete} tone="success" label="Results verified" />
            </div>
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
          live.extend(event.id, round, minutes, reason, app.currentUser?.name ?? "Director");
          app.toast({
            title: `Round extended by ${minutes} minutes`,
            description: reason,
            tone: "success",
          });
          setExtendOpen(false);
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
