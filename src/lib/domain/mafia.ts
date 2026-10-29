/**
 * Signing up for Mafia Wars, which is not entering a tournament.
 *
 * One person per sign-up: a name, an age, a mobile number, an online payment and an answer about
 * photographs. It has no Scrabble category, rating or player number, so it shares nothing with
 * the tournament's registration beyond the phone validator, and is stored in a collection of its
 * own for the reason `training.ts` explains. The database enforces the same rules again
 * (`0096_mafia_wars_and_event_hosts.sql`), so a form that is bypassed gets the same answer.
 *
 * What the participant is told — the price, the date, the time, the venue — is read from the
 * event row. What lives here is the rules of the form.
 */

import { proofRequired } from "./paymentProof";
import { phoneOk } from "./registrationParticipants";

/** A fallback only: the event row's own `fee` is what is shown and charged. */
export const MAFIA_FEE = 1400;

/** Sanity limits, not eligibility: this catches "0" and "400", not anybody who really wants to play. */
export const AGE_FLOOR = 5;
export const AGE_CEILING = 99;

export interface MafiaEntry {
  fullName: string;
  /** Kept as typed so a half-typed number is not rewritten under the cursor. */
  age: string;
  phone: string;
  /** `null` until answered, which is why it is not a plain boolean. */
  mediaConsent: boolean | null;
  /** The receipt. Always required: this event is paid online. */
  proofFile: File | null;
  termsAccepted: boolean;
}

export const EMPTY_MAFIA_ENTRY: MafiaEntry = {
  fullName: "",
  age: "",
  phone: "",
  mediaConsent: null,
  proofFile: null,
  termsAccepted: false,
};

/** A whole number of years as typed, or null when it is not one. */
export function ageOf(value: string): number | null {
  const v = value.trim();
  if (!/^\d{1,3}$/.test(v)) return null;
  return Number(v);
}

export type MafiaField =
  "name" | "age" | "phone" | "consent" | "proof" | "terms";

export interface MafiaProblem {
  field: MafiaField;
  message: string;
}

/**
 * What is still missing or wrong, in one pass, so the button and the messages under the inputs
 * cannot disagree about whether the form is ready.
 */
export function mafiaProblems(
  entry: MafiaEntry,
  options: { termsOffered: boolean },
): MafiaProblem[] {
  const problems: MafiaProblem[] = [];

  if (entry.fullName.trim().length < 2)
    problems.push({ field: "name", message: "Please give your full name." });

  const age = ageOf(entry.age);
  if (age === null || age < AGE_FLOOR || age > AGE_CEILING)
    problems.push({ field: "age", message: "Please give your age." });

  if (!phoneOk(entry.phone))
    problems.push({ field: "phone", message: "Please give a mobile number." });

  if (entry.mediaConsent === null)
    problems.push({ field: "consent", message: "Please choose yes or no." });

  /* Online is the only way to pay, so a receipt is always needed. */
  if (proofRequired("online") && entry.proofFile === null)
    problems.push({
      field: "proof",
      message: "Please attach your payment proof.",
    });

  if (options.termsOffered && !entry.termsAccepted)
    problems.push({
      field: "terms",
      message: "Please confirm you have read this.",
    });

  return problems;
}

export function mafiaReady(
  entry: MafiaEntry,
  options: { termsOffered: boolean },
): boolean {
  return mafiaProblems(entry, options).length === 0;
}

export function problemFor(
  problems: MafiaProblem[],
  field: MafiaField,
): string | undefined {
  return problems.find((p) => p.field === field)?.message;
}

/** Whether a string looks like a name worth storing; trims and collapses inner spaces. */
export function tidyName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/** "1ST", "2ND", "3RD", "4TH" — including the teens, which catch people out. */
function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "TH";
  return ["TH", "ST", "ND", "RD"][n % 10] ?? "TH";
}

/**
 * The date as the poster sets it: "22ND NOV". Read from the date's own parts rather than through
 * a `Date`, so a time zone can never move it a day; empty when the date is not a real one.
 */
export function posterDate(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${day}${ordinalSuffix(day)} ${MONTHS[month - 1]}`;
}

/**
 * A link that adds the night to somebody's Google Calendar. The times are sent as written, with
 * the zone named beside them, so it lands at 4:30 pm in Karachi whatever the phone's own zone is.
 * Empty when the date or the start time is missing, because a calendar entry with no time is
 * worse than none.
 */
export function calendarLink(input: {
  title: string;
  date: string | undefined;
  start: string | undefined;
  end: string | undefined;
  location?: string;
  details?: string;
  timeZone?: string;
}): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.date ?? "");
  const s = /^(\d{1,2}):(\d{2})/.exec(input.start ?? "");
  if (!d || !s) return "";
  const e = /^(\d{1,2}):(\d{2})/.exec(input.end ?? "") ?? s;

  const stamp = (t: RegExpExecArray) =>
    `${d[1]}${d[2]}${d[3]}T${t[1].padStart(2, "0")}${t[2]}00`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${stamp(s)}/${stamp(e)}`,
    ctz: input.timeZone ?? "Asia/Karachi",
  });
  if (input.location) params.set("location", input.location);
  if (input.details) params.set("details", input.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

/**
 * "SUNDAY" for 2026-11-22. Worked out from the date's own parts in UTC, so the device's time zone
 * can never turn a Sunday into a Saturday.
 */
export function weekdayOf(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return "";
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  /* Rejects 2026-02-31, which JavaScript would quietly roll into March. */
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return "";
  return WEEKDAYS[d.getUTCDay()];
}

/**
 * The moment a date and a clock time on the event row fall at, in the event's own zone (Karachi,
 * UTC+5, which has no daylight saving). Null when either is missing or not real, because a
 * countdown to a guess is worse than none.
 */
export function startInstant(date: string | undefined, time: string | undefined): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  const t = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  if (!d || !t) return null;
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  if (hour > 23 || minute > 59) return null;
  if (weekdayOf(date) === "") return null;
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hour - 5, minute);
}

export type CountdownState =
  | { phase: "before"; days: number; hours: number; minutes: number }
  | { phase: "now" }
  | { phase: "over" };

/**
 * Where "now" stands against the night: counting down, under way, or finished. Rounds the
 * minutes down, so it never claims there is less time than there is.
 */
export function countdownTo(
  startMs: number | null,
  endMs: number | null,
  nowMs: number,
): CountdownState | null {
  if (startMs === null) return null;
  if (nowMs < startMs) {
    const total = Math.floor((startMs - nowMs) / 60000);
    return {
      phase: "before",
      days: Math.floor(total / 1440),
      hours: Math.floor((total % 1440) / 60),
      minutes: total % 60,
    };
  }
  if (endMs !== null && nowMs >= endMs) return { phase: "over" };
  return { phase: "now" };
}
