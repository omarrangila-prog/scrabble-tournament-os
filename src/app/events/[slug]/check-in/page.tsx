"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, Check, Clock, MapPin, Wallet } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { CodeInput } from "@/components/checkin/CodeInput";
import {
  attemptVerdict,
  CHECK_IN_CODE_LENGTH,
  paymentGate,
  recordFailure,
  type AttemptLog,
  type CheckInMethod,
} from "@/lib/domain/checkIn";
import { selectEventBySlug, useEventStore } from "@/lib/store/useEventStore";
import type { GuestPaymentStatus } from "@/lib/store/useEventStore";
import {
  arrivalTotals,
  checkInParticipant,
  recoverRegistration,
  findByCheckInCode,
  findByPersonalToken,
  type CheckInSubject,
} from "@/lib/supabase/registrations";
import { CATEGORY_LABEL, type PlayerCategory } from "@/lib/domain/identity";
import { formatDate, formatTime } from "@/lib/utils";

const CREAM = "#F5F0E4";
const FOREST = "#2F5D3A";
const GOLD = "#C89B3C";
const BROWN = "#3E2F23";

/** Read outside the component: the compiler treats Date.now() in render as impure. */
const nowMs = () => Date.now();

/**
 * Self check-in.
 *
 * Two ways in, one record. A personal link identifies the participant from its
 * token and needs a single tap; the venue QR lands here with no token, so they
 * type the six digits from their confirmation.
 *
 * Deliberately spare: no navigation, no footer, no promotional anything. Someone
 * is standing in a doorway with people behind them, and every element that is
 * not the next action is in the way. The whole first screen fits a phone without
 * scrolling.
 *
 * Nothing here shows an email, a phone number, a receipt or an internal id.
 */
export default function CheckInPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const slug = decodeURIComponent(params.slug ?? "");
  const token = search.get("t") ?? "";

  const store = useEventStore();
  const event = selectEventBySlug(store, slug);
  const eventId = event?.id;

  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [candidate, setCandidate] = React.useState<CheckInSubject | null>(null);
  const [done, setDone] = React.useState<{ at: string; already: boolean } | null>(null);
  const [recovering, setRecovering] = React.useState(false);

  /*
   * Attempts are held per mount rather than persisted. This is a speed bump for
   * somebody typing digits by hand; the real limit belongs on the server, and
   * the domain rule is shared so both apply the same one.
   */
  const [attempts, setAttempts] = React.useState<AttemptLog>({ failures: [] });
  const [busy, setBusy] = React.useState(false);
  const [totals, setTotals] = React.useState({ expected: 0, checkedIn: 0 });

  React.useEffect(() => {
    if (!eventId) return;
    let live = true;
    arrivalTotals(eventId).then((t) => {
      if (live) setTotals(t);
    });
    return () => {
      live = false;
    };
  }, [eventId, done]);

  /*
   * A personal link identifies its holder immediately — that is the point of
   * sending it. The tap that follows is the check-in, not a second lookup.
   */
  /*
   * A personal link identifies its holder from the database, not from this
   * browser. The registration was almost certainly made on a different device.
   */
  const [fromToken, setFromToken] = React.useState<CheckInSubject | null>(null);

  React.useEffect(() => {
    if (!token || !eventId) return;
    let live = true;
    findByPersonalToken(eventId, token).then((found) => {
      if (live) setFromToken(found);
    });
    return () => {
      live = false;
    };
  }, [token, eventId]);

  const subject = candidate ?? fromToken;

  if (!event) {
    return (
      <Shell>
        <Panel>
          <p className="text-[15px] font-bold" style={{ color: BROWN }}>
            Check-in link not recognised
          </p>
          <p className="mt-1.5 text-[13.5px]" style={{ color: `${BROWN}A6` }}>
            Please check the link, or visit the event desk.
          </p>
        </Panel>
      </Shell>
    );
  }

  const counts = totals;

  const submitCode = async (entered: string) => {
    setError(null);

    const verdict = attemptVerdict(attempts, nowMs());
    if (!verdict.allowed) {
      setError(verdict.message);
      return;
    }

    setBusy(true);
    const found = await findByCheckInCode(event.id, entered);
    setBusy(false);

    if (!found) {
      setAttempts((log) => recordFailure(log, nowMs()));
      setCode("");
      setError("We could not find that code. Please check and try again.");
      return;
    }

    setCandidate(found);
  };

  /*
   * The arrival is recorded by the database, which holds the row lock, refuses a
   * second arrival and stamps its own clock. Doing this in the browser would let
   * two taps count twice and a wrong phone clock write a wrong time.
   */
  const confirm = async (method: CheckInMethod) => {
    if (!subject || !event) return;

    setBusy(true);
    const outcome = await checkInParticipant({
      eventId: event.id,
      code: candidate ? code : undefined,
      token: candidate ? undefined : subject.token,
      method,
    });
    setBusy(false);

    if (outcome.result === "blocked" || outcome.result === "not_found") {
      setError(outcome.message);
      return;
    }

    setDone({ at: outcome.at, already: outcome.result === "already_checked_in" });
    setTotals(await arrivalTotals(event.id));
  };

  /* ---- Checked in ------------------------------------------------------ */
  if (done && subject) {
    return (
      <Shell>
        <Success
          registration={subject}
          at={done.at}
          already={done.already}
          eventName={event.name}
          eventDate={formatDate(event.startDate)}
          venue={event.venueName}
        />
      </Shell>
    );
  }

  /* ---- Confirm it is them --------------------------------------------- */
  if (subject) {
    const gate = paymentGate(subject.paymentStatus as GuestPaymentStatus);
    const alreadyIn = Boolean(subject.checkedInAt);

    return (
      <Shell>
        <Panel>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: GOLD }}
          >
            {fromToken && !candidate ? "Welcome" : "We found you"}
          </p>

          <p className="mt-2 text-[26px] font-extrabold leading-tight" style={{ color: BROWN }}>
            {subject.fullName}
          </p>

          <dl className="mt-4 space-y-1.5 text-left">
            <Row
              label="Playing level"
              value={
                CATEGORY_LABEL[subject.playingLevel as PlayerCategory] ?? subject.playingLevel
              }
            />
            <Row
              label="Registration"
              value={subject.registrationStatus === "waitlisted" ? "Waiting list" : "Confirmed"}
            />
            <Row
              label="Payment"
              value={
                subject.paymentStatus === "verified" || subject.paymentStatus === "complimentary"
                  ? "Verified"
                  : subject.paymentStatus === "cash-at-venue"
                    ? "Pay at the desk"
                    : "Being checked"
              }
            />
          </dl>

          {gate.allowed && gate.collectCash ? (
            <p
              className="mt-4 flex items-start gap-2 rounded-2xl px-3.5 py-3 text-left text-[12.5px] leading-relaxed"
              style={{ background: `${GOLD}26`, color: "#8A6A1F" }}
            >
              <Wallet className="mt-0.5 size-3.5 shrink-0" />
              Please pay {subject.currency} {subject.amountDue.toLocaleString("en-PK")} at the desk.
              You can still check in now.
            </p>
          ) : null}

          {!gate.allowed ? (
            <p
              className="mt-4 flex items-start gap-2 rounded-2xl px-3.5 py-3 text-left text-[12.5px] leading-relaxed text-critical"
              style={{ background: "rgba(200,60,60,0.08)" }}
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {gate.reason}
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 text-[12.5px] text-critical">{error}</p>
          ) : null}

          <div className="mt-5 space-y-2.5">
            <Button
              size="lg"
              className="w-full border-0"
              style={{ background: FOREST, color: "white" }}
              disabled={!gate.allowed || busy}
              onClick={() => confirm(fromToken && !candidate ? "personal_link" : "venue_qr")}
            >
              {busy ? "Checking you in…" : alreadyIn ? "Show my check-in" : "Check me in"}
            </Button>

            {/* Wrong person: back out rather than checking somebody else in. */}
            {candidate ? (
              <button
                onClick={() => {
                  setCandidate(null);
                  setCode("");
                  setError(null);
                }}
                className="w-full py-2 text-[13px] font-semibold underline underline-offset-4"
                style={{ color: `${BROWN}99` }}
              >
                Not me
              </button>
            ) : null}
          </div>
        </Panel>
      </Shell>
    );
  }

  /* ---- Recovery -------------------------------------------------------- */
  if (recovering) {
    return (
      <Shell>
        <Recover
          eventId={event.id}
          onBack={() => setRecovering(false)}
          onFound={(r) => {
            setRecovering(false);
            setCandidate(r);
          }}
        />
      </Shell>
    );
  }

  /* ---- Enter the code -------------------------------------------------- */
  return (
    <Shell>
      <Panel>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
          {event.name}
        </p>
        <p className="mt-2 text-[24px] font-extrabold leading-tight" style={{ color: BROWN }}>
          Welcome
        </p>
        <p className="mt-1 text-[13.5px]" style={{ color: `${BROWN}A6` }}>
          Enter your {CHECK_IN_CODE_LENGTH}-digit check-in code.
        </p>

        <div className="mt-5">
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={submitCode}
            invalid={Boolean(error)}
          />
        </div>

        {error ? (
          <p className="mt-3 text-[12.5px] font-semibold text-critical">{error}</p>
        ) : null}

        <Button
          size="lg"
          className="mt-5 w-full border-0"
          style={{ background: FOREST, color: "white" }}
          disabled={code.length !== CHECK_IN_CODE_LENGTH || busy}
          onClick={() => submitCode(code)}
        >
          {busy ? "Looking you up…" : "Check me in"}
        </Button>

        <button
          onClick={() => {
            setRecovering(true);
            setError(null);
          }}
          className="tap-target mt-4 text-[13px] font-semibold underline underline-offset-4"
          style={{ color: `${BROWN}99` }}
        >
          Forgot your code?
        </button>

        {/* A quiet reassurance that the desk is keeping up. */}
        {counts.expected > 0 ? (
          <p className="mt-5 text-[11.5px]" style={{ color: `${BROWN}80` }}>
            {counts.checkedIn} of {counts.expected} checked in
          </p>
        ) : null}
      </Panel>
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */

/** Nothing but the panel: no navigation, no footer, no distractions. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    /*
     * Flex centring, not `grid place-items-center`.
     *
     * A grid with no column count sizes its single track to max-content, so the card
     * grew to whatever its widest line wanted — 392px — and hung 92px off the side of a
     * 320px phone. This is the screen every participant opens at the door, so it has to
     * fit the smallest phone anybody brings.
     */
    <main
      className="flex min-h-dvh items-center justify-center px-5 py-8"
      style={{ background: CREAM }}
    >
      <div className="w-full min-w-0 max-w-[420px]">{children}</div>
    </main>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[28px] border bg-white/85 p-6 text-center sm:p-7"
      style={{ borderColor: `${BROWN}1F` }}
    >
      {children}
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12.5px]" style={{ color: `${BROWN}99` }}>
        {label}
      </dt>
      <dd className="text-right text-[13px] font-bold capitalize" style={{ color: BROWN }}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The success screen.
 *
 * Shows the table and opponent only once the round is published — inventing one
 * would send somebody to the wrong seat. Until then it says so plainly rather
 * than leaving an empty space.
 */
function Success({
  registration,
  at,
  already,
  eventName,
  eventDate,
  venue,
}: {
  registration: CheckInSubject;
  at: string;
  already: boolean;
  eventName: string;
  eventDate: string;
  venue: string;
}) {
  return (
    <Panel>
      <motion.span
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 20 }}
        className="inline-grid size-16 place-items-center rounded-full"
        style={{ background: `${FOREST}1A`, color: FOREST }}
      >
        <Check className="size-8" strokeWidth={3} />
      </motion.span>

      <p className="mt-4 text-[22px] font-extrabold leading-tight" style={{ color: FOREST }}>
        {already ? "Already checked in" : "You're checked in"}
      </p>
      <p className="mt-1 text-[15px] font-bold" style={{ color: BROWN }}>
        {registration.fullName}
      </p>

      <div
        className="mt-5 rounded-2xl px-4 py-3.5 text-left"
        style={{ background: `${BROWN}0A` }}
      >
        <p className="text-[13px] font-bold" style={{ color: BROWN }}>
          {eventName}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px]" style={{ color: `${BROWN}A6` }}>
          <MapPin className="size-3.5" />
          {venue} · {eventDate}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px]" style={{ color: `${BROWN}A6` }}>
          <Clock className="size-3.5" />
          Checked in at {formatTime(at)}
        </p>
      </div>

      <p className="mt-4 text-[12.5px] leading-relaxed" style={{ color: `${BROWN}99` }}>
        Your table will appear here when the first round is published. Keep this page open.
      </p>
    </Panel>
  );
}

/**
 * Recovery for a forgotten code.
 *
 * Never lists matches, and never echoes back what was typed. A masked name is
 * enough for the right person to recognise themselves and not enough for
 * somebody trying phone numbers to learn who is attending.
 */
function Recover({
  eventId,
  onBack,
  onFound,
}: {
  eventId: string;
  onBack: () => void;
  onFound: (subject: CheckInSubject) => void;
}) {
  const [contact, setContact] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [match, setMatch] = React.useState<{ maskedName: string; token: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [attempts, setAttempts] = React.useState<AttemptLog>({ failures: [] });
  const [busy, setBusy] = React.useState(false);

  const search = async () => {
    setError(null);

    const verdict = attemptVerdict(attempts, nowMs(), 4);
    if (!verdict.allowed) {
      setError(verdict.message);
      return;
    }

    setBusy(true);
    const found = await recoverRegistration(eventId, contact, lastName);
    setBusy(false);

    if (!found) {
      setAttempts((log) => recordFailure(log, nowMs()));
      setError("We could not find a registration with those details.");
      return;
    }
    setMatch(found);
  };

  if (match) {
    return (
      <Panel>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: GOLD }}>
          Registration found
        </p>
        <p className="mt-3 num text-[26px] font-extrabold" style={{ color: BROWN }}>
          {match.maskedName}
        </p>
        <p className="mt-1 text-[13px]" style={{ color: `${BROWN}A6` }}>
          Is this you?
        </p>
        <Button
          size="lg"
          className="mt-5 w-full border-0"
          style={{ background: FOREST, color: "white" }}
          onClick={async () => {
            const subject = await findByPersonalToken(eventId, match.token);
            if (subject) onFound(subject);
            else setError("Please see the event desk.");
          }}
        >
          Yes, continue
        </Button>
        <button
          onClick={() => setMatch(null)}
          className="mt-3 text-[13px] font-semibold underline underline-offset-4"
          style={{ color: `${BROWN}99` }}
        >
          No, go back
        </button>
      </Panel>
    );
  }

  return (
    <Panel>
      <p className="text-[20px] font-extrabold leading-tight" style={{ color: BROWN }}>
        Find my registration
      </p>
      <p className="mt-1 text-[13px]" style={{ color: `${BROWN}A6` }}>
        Use the mobile or email you registered with.
      </p>

      <div className="mt-5 space-y-3.5 text-left">
        <Field label="Mobile number or email">
          <Input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="0300 1234567"
            autoComplete="tel"
          />
        </Field>
        <Field label="Last name">
          <Input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Khan"
            autoComplete="family-name"
          />
        </Field>
      </div>

      {error ? <p className="mt-3 text-[12.5px] text-critical">{error}</p> : null}

      <Button
        size="lg"
        className="mt-5 w-full border-0"
        style={{ background: FOREST, color: "white" }}
        disabled={!contact.trim() || !lastName.trim() || busy}
        onClick={search}
      >
        {busy ? "Searching…" : "Find my registration"}
      </Button>

      <button
        onClick={onBack}
        className="mt-3 text-[13px] font-semibold underline underline-offset-4"
        style={{ color: `${BROWN}99` }}
      >
        Back to code entry
      </button>
    </Panel>
  );
}
