/**
 * Self check-in.
 *
 * A participant arrives, opens their own phone and is checked in — no app, no
 * account, no password, and no queue at a desk. Three routes lead to the same
 * record: a personal link, a six-digit code typed after scanning the venue QR,
 * and a staff search as the fallback.
 *
 * The rules that matter are all in here rather than in the pages, because each
 * of them is a way to get someone's arrival wrong:
 *
 * - A code identifies a participant, so it must not be guessable in bulk and
 *   must never be another participant's code at the same event.
 * - Checking in twice must not count twice, or the arrivals figure the director
 *   sets tables out from is wrong.
 * - The check-in time is the moment of arrival and must never be overwritten by
 *   a second tap.
 * - Nothing in a URL or on screen may expose an internal record id.
 */

import { GuestPaymentStatus, GuestRegistration } from "../store/useEventStore";

/* -------------------------------------------------------------------------- */
/* Codes                                                                       */
/* -------------------------------------------------------------------------- */

export const CHECK_IN_CODE_LENGTH = 6;

/**
 * A six-digit check-in code, unique within its event.
 *
 * Digits only, so the phone opens a numeric keypad and the code can be read
 * aloud across a noisy room without spelling anything out.
 *
 * Uniqueness is checked against codes already issued for the same event. Two
 * participants sharing a code would check each other in, and the collision
 * would only surface when one of them was marked present twice.
 */
export function generateCheckInCode(
  taken: Iterable<string>,
  random: () => number = Math.random,
): string {
  const used = new Set(taken);
  const span = 10 ** CHECK_IN_CODE_LENGTH;

  // 900,000 codes against a field of tens: a collision is rare, but retrying is
  // cheap and a duplicate is not recoverable once printed on a confirmation.
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const code = String(Math.floor(random() * span)).padStart(CHECK_IN_CODE_LENGTH, "0");
    if (!used.has(code)) return code;
  }

  // Exhausting the space is not realistic at event scale, but returning a
  // duplicate silently would be worse than failing loudly.
  throw new Error("Could not allocate an unused check-in code");
}

/** Digits only, so a pasted "482 731" or "482-731" still works. */
export function normaliseCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CHECK_IN_CODE_LENGTH);
}

/* -------------------------------------------------------------------------- */
/* Payment policy                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Which payment states may check in.
 *
 * Check-in and payment are separate concepts: somebody paying cash at the desk
 * has arrived and should be recorded as arrived. The organizer decides which
 * states pass, so an event can let cash payers in and still hold back a
 * rejected payment.
 */
export interface CheckInPolicy {
  allow: GuestPaymentStatus[];
  /** Let a cash payer through, flagged for the desk to collect. */
  provisionalForCash: boolean;
}

export const DEFAULT_CHECK_IN_POLICY: CheckInPolicy = {
  allow: ["verified", "complimentary", "cash-at-venue"],
  provisionalForCash: true,
};

export type PaymentGate =
  | { allowed: true; collectCash: boolean }
  | { allowed: false; reason: string };

/** Whether this payment state may check in, and what the desk must do. */
export function paymentGate(
  status: GuestPaymentStatus,
  policy: CheckInPolicy = DEFAULT_CHECK_IN_POLICY,
): PaymentGate {
  if (status === "cash-at-venue")
    return policy.allow.includes(status) || policy.provisionalForCash
      ? { allowed: true, collectCash: true }
      : { allowed: false, reason: "Please pay at the event desk to check in." };

  if (policy.allow.includes(status)) return { allowed: true, collectCash: false };

  // Never quote a Firebase state at a participant.
  if (status === "receipt-uploaded" || status === "processing" || status === "review-required")
    return { allowed: false, reason: "Your payment is still being checked. Please see the desk." };

  return { allowed: false, reason: "Please see the event desk to complete your registration." };
}

/* -------------------------------------------------------------------------- */
/* The check-in window                                                         */
/* -------------------------------------------------------------------------- */

export type CheckInWindow = "not-open" | "open" | "paused" | "closed";

export interface WindowState {
  state: CheckInWindow;
  /** What the participant reads. Never a technical reason. */
  message: string;
  canCheckIn: boolean;
}

/** What the participant is told, given where the organizer has set the window. */
export function windowState(state: CheckInWindow, opensAt?: string): WindowState {
  switch (state) {
    case "open":
      return { state, message: "Check in for today's event.", canCheckIn: true };
    case "paused":
      return {
        state,
        message: "Check-in is paused for a moment. Please try again shortly.",
        canCheckIn: false,
      };
    case "closed":
      return {
        state,
        message: "Online check-in has closed. Please visit the event desk.",
        canCheckIn: false,
      };
    default:
      return {
        state: "not-open",
        message: opensAt
          ? `Check-in is not open yet. Please return at ${opensAt}.`
          : "Check-in is not open yet.",
        canCheckIn: false,
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Lookup                                                                      */
/* -------------------------------------------------------------------------- */

export type CheckInMethod = "personal_link" | "venue_qr" | "staff_manual";

export type Lookup =
  | { found: true; registration: GuestRegistration }
  | { found: false; reason: "unknown" | "wrong-event" };

/**
 * Finds a participant by check-in code, within one event only.
 *
 * Event-scoped deliberately: a code issued for a different event must not check
 * somebody in here, and reusing digits across events is otherwise inevitable.
 */
export function findByCode(
  registrations: GuestRegistration[],
  rawCode: string,
  eventId: string,
): Lookup {
  const code = normaliseCode(rawCode);
  if (code.length !== CHECK_IN_CODE_LENGTH) return { found: false, reason: "unknown" };

  const matches = registrations.filter((r) => r.checkInCode === code);
  const here = matches.find((r) => r.eventId === eventId);

  if (here) return { found: true, registration: here };
  return { found: false, reason: matches.length ? "wrong-event" : "unknown" };
}

/** Finds a participant by their personal token, within one event only. */
export function findByToken(
  registrations: GuestRegistration[],
  token: string,
  eventId: string,
): Lookup {
  const clean = token.trim();
  if (!clean) return { found: false, reason: "unknown" };

  const match = registrations.find((r) => r.token === clean);
  if (!match) return { found: false, reason: "unknown" };
  if (match.eventId !== eventId) return { found: false, reason: "wrong-event" };
  return { found: true, registration: match };
}

/* -------------------------------------------------------------------------- */
/* Recording an arrival                                                        */
/* -------------------------------------------------------------------------- */

export type CheckInOutcome =
  | { result: "checked-in"; at: string; method: CheckInMethod }
  | { result: "already-checked-in"; at: string }
  | { result: "blocked"; reason: string };

/**
 * Decides what a check-in attempt should do.
 *
 * Returning `already-checked-in` rather than writing again is the point. A
 * participant who taps twice, or scans and then opens their link, must not be
 * counted twice — the arrivals figure is what the director sets tables out
 * from — and their arrival time must stay the moment they actually arrived.
 *
 * The caller performs the write, so the store or a server function can apply
 * this atomically. This function makes the decision; it does not mutate.
 */
export function checkInOutcome(
  registration: Pick<GuestRegistration, "checkedInAt" | "paymentStatus">,
  method: CheckInMethod,
  now: string,
  policy: CheckInPolicy = DEFAULT_CHECK_IN_POLICY,
): CheckInOutcome {
  if (registration.checkedInAt)
    return { result: "already-checked-in", at: registration.checkedInAt };

  const gate = paymentGate(registration.paymentStatus, policy);
  if (!gate.allowed) return { result: "blocked", reason: gate.reason };

  return { result: "checked-in", at: now, method };
}

/* -------------------------------------------------------------------------- */
/* Arrival figures                                                             */
/* -------------------------------------------------------------------------- */

export interface ArrivalCounts {
  expected: number;
  checkedIn: number;
  notArrived: number;
  paymentIssue: number;
  cancelled: number;
  /** Whole percent, 0 when nobody is expected — never NaN on screen. */
  percent: number;
}

/**
 * The arrivals picture, derived rather than counted up by hand.
 *
 * Rejected entrants are excluded from `expected`: counting somebody who is not
 * coming makes the event look emptier than it is, and the director lays out
 * tables for people who will never sit at them.
 *
 * Waitlisted entrants stay in `expected`. They are uncertain rather than
 * cancelled, and one who is admitted at the desk and checks in must not push
 * `checkedIn` above `expected`.
 */
export function arrivalCounts(registrations: GuestRegistration[]): ArrivalCounts {
  const cancelled = registrations.filter((r) => r.status === "rejected").length;
  const expectedList = registrations.filter((r) => r.status !== "rejected");

  const checkedIn = expectedList.filter((r) => Boolean(r.checkedInAt)).length;

  const paymentIssue = expectedList.filter(
    (r) => !r.checkedInAt && !paymentGate(r.paymentStatus).allowed,
  ).length;

  const expected = expectedList.length;

  return {
    expected,
    checkedIn,
    notArrived: expected - checkedIn,
    paymentIssue,
    cancelled,
    percent: expected === 0 ? 0 : Math.round((checkedIn / expected) * 100),
  };
}

/* -------------------------------------------------------------------------- */
/* Guessing protection                                                         */
/* -------------------------------------------------------------------------- */

export const MAX_CODE_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 60_000;

export interface AttemptLog {
  /** Timestamps of recent failures, newest last. */
  failures: number[];
}

export type AttemptVerdict =
  | { allowed: true; remaining: number }
  | { allowed: false; message: string; retryAfterMs: number };

/**
 * Rate-limits code entry.
 *
 * Six digits is 900,000 possibilities, which is plenty against a person but
 * nothing against a script. Without a limit, somebody could walk the space and
 * read back the name and level of every participant at the event.
 *
 * The message never says how many attempts remain — that is a hint for whoever
 * is guessing.
 */
export function attemptVerdict(
  log: AttemptLog,
  now: number,
  max = MAX_CODE_ATTEMPTS,
  windowMs = ATTEMPT_WINDOW_MS,
): AttemptVerdict {
  const recent = log.failures.filter((t) => now - t < windowMs);

  if (recent.length < max) return { allowed: true, remaining: max - recent.length };

  const oldest = Math.min(...recent);
  return {
    allowed: false,
    message: "Please wait a moment before trying again.",
    retryAfterMs: Math.max(0, windowMs - (now - oldest)),
  };
}

/** Records a failure, dropping entries that have aged out of the window. */
export function recordFailure(log: AttemptLog, now: number, windowMs = ATTEMPT_WINDOW_MS): AttemptLog {
  return { failures: [...log.failures.filter((t) => now - t < windowMs), now] };
}

/* -------------------------------------------------------------------------- */
/* Privacy                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Masks a name for the recovery flow.
 *
 * "Ahmed Khan" becomes "A**** K***". Enough for the right person to recognise
 * themselves, not enough for somebody fishing with a phone number to learn who
 * is attending.
 */
export function maskName(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + "*".repeat(Math.max(1, part.length - 1)))
    .join(" ");
}

/** Masks a mobile number to its last three digits: "•••• ••• 594". */
export function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length <= 3) return "•".repeat(digits.length);
  return `•••• ••• ${digits.slice(-3)}`;
}
