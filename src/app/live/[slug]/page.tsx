"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Trophy,
  UserCheck,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input } from "@/components/ui";
import {
  GuestRegistration,
  selectEventBySlug,
  selectRegistrations,
  useEventStore,
} from "@/lib/store/useEventStore";
import { EVENT_STATE_LABEL, STATE_DESTINATION } from "@/lib/domain/events";
import { CATEGORY_LABEL } from "@/lib/domain/identity";
import { formatClock, phaseOf, remainingMs } from "@/lib/engine/roundTimer";
import { useLiveStore } from "@/lib/store/useLiveStore";
import { cn, formatDate } from "@/lib/utils";

/**
 * The phase-aware participant entry point.
 *
 * One stable URL printed on the venue QR. What it shows depends entirely on the
 * event's current state, so a participant who scans at 09:00 sees check-in and
 * the same scan at 14:00 shows their result submission — without the organizer
 * reprinting anything.
 */
export default function LiveEventPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug ?? "");

  const store = useEventStore();
  const live = useLiveStore();
  const event = selectEventBySlug(store, slug);
  const registrations = event ? selectRegistrations(store, event.id) : [];

  /** The device remembers who it belongs to, so identity is asked once. */
  const [identity, setIdentity] = React.useState<GuestRegistration | null>(null);
  const [lookup, setLookup] = React.useState("");
  const [lookupError, setLookupError] = React.useState<string | null>(null);

  // Restore a previous session on this device.
  const remembered = live.sessionFor(event?.id ?? "");
  const [restored, setRestored] = React.useState(false);
  if (!restored && remembered && !identity) {
    setRestored(true);
    const found = registrations.find((r) => r.id === remembered);
    if (found) setIdentity(found);
  }

  if (!event) {
    return (
      <Shell>
        <EmptyState title="Event not found" description="Check the link, or ask a volunteer." />
      </Shell>
    );
  }

  const destination = STATE_DESTINATION[event.state];
  const timer = live.timerFor(event.id, live.currentRound(event.id));

  const identify = () => {
    const q = lookup.trim().toLowerCase();
    if (!q) return;
    const found = registrations.find(
      (r) =>
        r.email.toLowerCase() === q ||
        r.mobile.replace(/\D/g, "").endsWith(q.replace(/\D/g, "")) ||
        r.token.toLowerCase() === q ||
        r.fullName.toLowerCase() === q,
    );
    if (!found) {
      setLookupError("We could not find that entry. Try your email, or ask a volunteer.");
      return;
    }
    setLookupError(null);
    setIdentity(found);
    live.rememberSession(event.id, found.id);
  };

  /* ---- Identity gate ------------------------------------------------- */

  if (!identity && destination !== "register" && destination !== "closed") {
    return (
      <Shell>
        <EventHeading event={event} />
        <Card className="mt-6">
          <CardHeader
            title="Let's find you"
            subtitle="Enter the email or phone number you registered with."
          />
          <div className="space-y-3 px-5 pb-5">
            <Field label="Email or mobile number" error={lookupError ?? undefined}>
              <Input
                autoFocus
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && identify()}
                placeholder="you@example.com"
                invalid={!!lookupError}
              />
            </Field>
            <Button variant="primary" size="lg" className="w-full" onClick={identify}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
            <p className="text-center text-[12.5px] text-muted">
              No password needed. This device will remember you for the rest of the event.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  /* ---- Phase views ---------------------------------------------------- */

  return (
    <Shell>
      <EventHeading event={event} />

      {destination === "closed" ? (
        <Card className="mt-6">
          <EmptyState
            icon={<Clock className="size-5" />}
            title={EVENT_STATE_LABEL[event.state]}
            description="Nothing to do here just yet. Check back closer to the start."
          />
        </Card>
      ) : null}

      {destination === "register" ? (
        <Card className="mt-6">
          <div className="p-6 text-center">
            <Trophy className="mx-auto size-8 text-primary" />
            <p className="mt-3 text-[17px] font-bold text-ink">Registration is open</p>
            <p className="mt-1 text-[13.5px] text-muted">
              Secure your place — it takes about two minutes.
            </p>
            <Link href={`/events/${event.slug}/register`}>
              <Button variant="primary" size="lg" className="mt-4 w-full">
                Register now
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {destination === "check-in" && identity ? (
        <CheckInView
          registration={identity}
          alreadyIn={live.isCheckedIn(event.id, identity.id)}
          onCheckIn={() => live.checkIn(event.id, identity.id)}
        />
      ) : null}

      {destination === "pairing" && identity ? (
        <PairingView
          registration={identity}
          round={live.currentRound(event.id)}
          board={live.boardFor(event.id, identity.id)}
          opponent={live.opponentFor(event.id, identity.id, registrations)}
          remaining={timer ? remainingMs(timer) : null}
          running={timer ? phaseOf(timer) === "running" : false}
        />
      ) : null}

      {destination === "submit-result" && identity ? (
        <SubmitResultView
          eventId={event.id}
          registration={identity}
          round={live.currentRound(event.id)}
          board={live.boardFor(event.id, identity.id)}
          opponent={live.opponentFor(event.id, identity.id, registrations)}
        />
      ) : null}

      {destination === "standings" || destination === "results" ? (
        <Card className="mt-6">
          <CardHeader
            title={destination === "results" ? "Final results" : "Standings"}
            subtitle={
              destination === "results"
                ? "The tournament is complete."
                : "Updated as results are verified."
            }
          />
          <div className="px-5 pb-5">
            <p className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[13px] text-muted">
              Standings appear on the venue screen and on the public site.
            </p>
            <Link href="/live" className="mt-3 block">
              <Button variant="secondary" className="w-full">
                Open live standings
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {identity ? (
        <p className="mt-6 text-center text-[12px] text-faint">
          Signed in as {identity.fullName} ·{" "}
          <button
            onClick={() => {
              live.forgetSession(event.id);
              setIdentity(null);
            }}
            className="underline underline-offset-2 hover:text-muted"
          >
            not you?
          </button>
        </p>
      ) : null}
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-lg px-5 py-8 sm:py-12">{children}</div>;
}

function EventHeading({ event }: { event: { name: string; state: string; startDate: string; venueName: string } }) {
  return (
    <div>
      <Badge tone="success" dot pulse>
        {EVENT_STATE_LABEL[event.state as keyof typeof EVENT_STATE_LABEL]}
      </Badge>
      <h1 className="mt-3 text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-ink">
        {event.name}
      </h1>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          {formatDate(event.startDate)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5" />
          {event.venueName}
        </span>
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CheckInView({
  registration,
  alreadyIn,
  onCheckIn,
}: {
  registration: GuestRegistration;
  alreadyIn: boolean;
  onCheckIn: () => void;
}) {
  const [done, setDone] = React.useState(alreadyIn);
  const paid =
    registration.paymentStatus === "verified" || registration.paymentStatus === "complimentary";

  if (done)
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="mt-6">
          <div className="p-6 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-br from-success to-cyan text-white shadow-[0_14px_36px_rgba(32,185,130,0.36)]">
              <CheckCircle2 className="size-8" strokeWidth={2.5} />
            </div>
            <p className="mt-4 text-[22px] font-extrabold tracking-[-0.025em] text-ink">
              You&apos;re checked in
            </p>
            <p className="mt-1 text-[15px] text-ink">{registration.fullName}</p>
            <p className="text-[13px] capitalize text-muted">
              {CATEGORY_LABEL[registration.confirmedDivision ?? registration.preferredDivision]}
            </p>
            <p className="mt-4 rounded-control bg-[rgb(var(--c-surface-soft))] px-3.5 py-3 text-[13px] text-muted">
              Your round 1 pairing will appear here as soon as it is published.
            </p>
          </div>
        </Card>
      </motion.div>
    );

  return (
    <Card className="mt-6">
      <CardHeader title="Is this you?" icon={<UserCheck className="size-4.5" />} />
      <div className="px-5 pb-5">
        <div className="rounded-compact bg-[rgb(var(--c-surface-soft))] p-4">
          <p className="text-[18px] font-bold text-ink">{registration.fullName}</p>
          <p className="text-[13px] capitalize text-muted">
            {CATEGORY_LABEL[registration.confirmedDivision ?? registration.preferredDivision]} division
          </p>
          <div className="mt-2">
            <Badge tone={paid ? "success" : "warning"} dot>
              {paid ? "Payment verified" : "Payment outstanding"}
            </Badge>
          </div>
        </div>

        {!paid ? (
          <p className="mt-3 rounded-control bg-warning-050 px-3.5 py-2.5 text-[12.5px] text-[#a76d16]">
            Please see the organizer desk to settle your entry fee before playing.
          </p>
        ) : null}

        <Button
          variant="primary"
          size="xl"
          className="mt-4 w-full"
          onClick={() => {
            onCheckIn();
            setDone(true);
          }}
        >
          Yes, check me in
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function PairingView({
  registration,
  round,
  board,
  opponent,
  remaining,
  running,
}: {
  registration: GuestRegistration;
  round: number;
  board?: number;
  opponent?: GuestRegistration;
  remaining: number | null;
  running: boolean;
}) {
  // Re-render each second while the round is live.
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  if (!board)
    return (
      <Card className="mt-6">
        <EmptyState
          icon={<Clock className="size-5" />}
          title="Pairings are being prepared"
          description="Your board and opponent will appear here the moment the round is published."
        />
      </Card>
    );

  return (
    <Card className="mt-6">
      <div className="p-6 text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-primary">
          Round {round}
        </p>

        <p className="num mt-3 text-[76px] font-extrabold leading-none tracking-[-0.05em] text-ink">
          {board}
        </p>
        <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">Table</p>

        <div className="mt-5 rounded-compact bg-[rgb(var(--c-surface-soft))] p-4">
          <p className="text-[12.5px] text-muted">You are playing</p>
          <p className="mt-0.5 text-[18px] font-bold text-ink">
            {opponent?.fullName ?? "To be confirmed"}
          </p>
        </div>

        {remaining !== null && running ? (
          <div className="mt-4">
            <p className="text-[12.5px] text-muted">Time remaining</p>
            <p className="num text-[34px] font-extrabold tracking-[-0.03em] text-ink">
              {formatClock(remaining)}
            </p>
          </div>
        ) : null}

        <p className="mt-5 text-[12.5px] text-muted">
          {registration.fullName} · result submission opens when the round ends.
        </p>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function SubmitResultView({
  eventId,
  registration,
  round,
  board,
  opponent,
}: {
  eventId: string;
  registration: GuestRegistration;
  round: number;
  board?: number;
  opponent?: GuestRegistration;
}) {
  const live = useLiveStore();
  const [mine, setMine] = React.useState("");
  const [theirs, setTheirs] = React.useState("");
  const [review, setReview] = React.useState(false);

  const existing = board ? live.submissionFor(eventId, round, board, registration.id) : undefined;

  if (existing)
    return (
      <Card className="mt-6">
        <div className="p-6 text-center">
          <CheckCircle2 className="mx-auto size-8 text-success" />
          <p className="mt-3 text-[17px] font-bold text-ink">Result submitted</p>
          <p className="num mt-2 text-[28px] font-extrabold text-ink">
            {existing.myScore} – {existing.theirScore}
          </p>
          <p className="mt-2 text-[13px] text-muted">
            {existing.confirmed
              ? "Confirmed by your opponent and included in the standings."
              : `Waiting for ${opponent?.fullName ?? "your opponent"} to confirm.`}
          </p>
        </div>
      </Card>
    );

  if (!board)
    return (
      <Card className="mt-6">
        <EmptyState title="No match to report" description="You were not paired in this round." />
      </Card>
    );

  const a = Number(mine);
  const b = Number(theirs);
  const valid = mine !== "" && theirs !== "" && !Number.isNaN(a) && !Number.isNaN(b);

  if (review && valid) {
    const winner = a > b ? registration.fullName : b > a ? (opponent?.fullName ?? "Opponent") : "Tie";
    return (
      <Card className="mt-6">
        <CardHeader title={`Round ${round} · Table ${board}`} subtitle="Check this is right before submitting." />
        <div className="px-5 pb-5">
          <div className="space-y-2">
            <ScoreRow name={registration.fullName} score={a} winner={a > b} />
            <ScoreRow name={opponent?.fullName ?? "Opponent"} score={b} winner={b > a} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Box label="Winner" value={winner} />
            <Box label="Spread" value={`${a - b > 0 ? "+" : ""}${a - b}`} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setReview(false)}>
              Edit scores
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => live.submitResult(eventId, round, board, registration.id, a, b)}
            >
              Confirm and submit
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader title={`Round ${round} · Table ${board}`} subtitle="Enter both final scores." />
      <div className="space-y-3 px-5 pb-5">
        <Field label={`${registration.fullName} — your score`} required>
          <Input
            value={mine}
            onChange={(e) => setMine(e.target.value)}
            inputMode="numeric"
            className="num h-14 text-center text-[24px] font-bold"
          />
        </Field>
        <Field label={`${opponent?.fullName ?? "Opponent"} — their score`} required>
          <Input
            value={theirs}
            onChange={(e) => setTheirs(e.target.value)}
            inputMode="numeric"
            className="num h-14 text-center text-[24px] font-bold"
          />
        </Field>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!valid}
          onClick={() => setReview(true)}
        >
          Review result
        </Button>
      </div>
    </Card>
  );
}

function ScoreRow({ name, score, winner }: { name: string; score: number; winner: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-control px-3.5 py-3",
        winner ? "bg-success-050" : "bg-[rgb(var(--c-surface-soft))]",
      )}
    >
      <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{name}</span>
      <span className="num text-[22px] font-extrabold text-ink">{score}</span>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-[rgb(var(--c-surface-soft))] px-3 py-2.5 text-center">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="num mt-0.5 truncate text-[15px] font-bold text-ink">{value}</p>
    </div>
  );
}
