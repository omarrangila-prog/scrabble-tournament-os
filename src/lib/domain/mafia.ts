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
