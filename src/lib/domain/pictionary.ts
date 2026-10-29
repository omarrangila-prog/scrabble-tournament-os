/**
 * Signing up for Speed Pictionary, which is not entering a tournament.
 *
 * An entry is one person or a pair. It has no Scrabble category, rating or player number, so it
 * shares nothing with the tournament's registration beyond the phone validator, and is stored in
 * a collection of its own for the reason `training.ts` explains: a payload flag would be one
 * forgotten `where` away from a board.
 *
 * Everything a participant is told about the day — the prices, the age limit, the prize, the
 * number of spots — is read from the event row. What lives here is the rules of the form: who
 * must be named, what the entry costs, and when it may be submitted. The database enforces the
 * age limit, the price and the spot count again (see `0095_pictionary_individuals_and_pairs.sql`),
 * so a form that is bypassed gets the same answer.
 */

import { proofRequired, type PaymentChoice } from "./paymentProof";
import { phoneOk } from "./registrationParticipants";

/** Fallbacks only: the event row's own settings are what is shown and charged. */
export const INDIVIDUAL_FEE = 1250;
export const TEAM_FEE = 2000;
export const TEAM_OF = 2;
export const AGE_MIN = 13;
export const AGE_MAX = 23;
export const MAX_PLAYERS = 32;

export type EntryType = "individual" | "team";
export type PictionaryPayment = Extract<PaymentChoice, "online" | "cash">;

/** Everything about the event the rules need, read from its row. */
export interface PictionaryRules {
  individualFee: number;
  teamFee: number;
  ageMin: number;
  ageMax: number;
  /** Whether the event has terms to agree to. A form with none must not demand a tick. */
  termsOffered: boolean;
}

export const DEFAULT_RULES: PictionaryRules = {
  individualFee: INDIVIDUAL_FEE,
  teamFee: TEAM_FEE,
  ageMin: AGE_MIN,
  ageMax: AGE_MAX,
  termsOffered: true,
};

export interface PictionaryPlayer {
  name: string;
  /** Kept as typed so a half-typed number is not rewritten under the cursor. */
  age: string;
}

export interface PictionaryEntry {
  type: EntryType;
  /** One player for an individual, two for a pair. The first is who the organisers ring. */
  players: PictionaryPlayer[];
  phone: string;
  email: string;
  payment: PictionaryPayment;
  /** The receipt, when paying online. Uploaded by the caller. */
  proofFile: File | null;
  termsAccepted: boolean;
}

const blankPlayer = (): PictionaryPlayer => ({ name: "", age: "" });

/** The players an entry of this type holds, keeping what was already typed. */
export function playersFor(
  type: EntryType,
  current: PictionaryPlayer[],
): PictionaryPlayer[] {
  const size = type === "team" ? TEAM_OF : 1;
  return Array.from({ length: size }, (_, i) => current[i] ?? blankPlayer());
}

export const EMPTY_ENTRY: PictionaryEntry = {
  type: "individual",
  players: [blankPlayer()],
  phone: "",
  email: "",
  payment: "online",
  proofFile: null,
  termsAccepted: false,
};

/** What the entry owes. A pair pays one price for both, not twice the single price. */
export function entryTotal(
  type: EntryType,
  rules: Pick<PictionaryRules, "individualFee" | "teamFee">,
): number {
  return type === "team" ? rules.teamFee : rules.individualFee;
}

/** A whole number of years as typed, or null when it is not one. */
export function ageOf(value: string): number | null {
  const v = value.trim();
  if (!/^\d{1,3}$/.test(v)) return null;
  return Number(v);
}

/** A simple shape check. Whether the address exists is not something a form can know. */
export function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export type PictionaryField =
  "name" | "age" | "phone" | "email" | "terms" | "proof";

export interface PictionaryProblem {
  field: PictionaryField;
  /** Which player a name or age problem belongs to, so the message lands under the right row. */
  player?: number;
  message: string;
}

const same = (a: string) => a.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * What is still missing or wrong, in one pass, so the button and the messages under the inputs
 * cannot disagree about whether the form is ready.
 */
export function pictionaryProblems(
  entry: PictionaryEntry,
  rules: PictionaryRules = DEFAULT_RULES,
): PictionaryProblem[] {
  const problems: PictionaryProblem[] = [];

  entry.players.forEach((p, i) => {
    const who =
      entry.type === "team"
        ? i === 0
          ? "the first player"
          : "the second player"
        : "";
    if (p.name.trim().length < 2)
      problems.push({
        field: "name",
        player: i,
        message: who
          ? `Please give ${who}'s full name.`
          : "Please give your full name.",
      });

    const age = ageOf(p.age);
    if (age === null) {
      problems.push({
        field: "age",
        player: i,
        message: who ? `Please give ${who}'s age.` : "Please give your age.",
      });
    } else if (age < rules.ageMin || age > rules.ageMax) {
      problems.push({
        field: "age",
        player: i,
        message: `Players must be between ${rules.ageMin} and ${rules.ageMax} years old.`,
      });
    }
  });

  const names = entry.players.map((p) => same(p.name)).filter((n) => n !== "");
  if (entry.type === "team" && names.length === 2 && names[0] === names[1])
    problems.push({
      field: "name",
      player: 1,
      message: "Each player needs their own name.",
    });

  if (!phoneOk(entry.phone))
    problems.push({ field: "phone", message: "Please give a mobile number." });

  if (!emailOk(entry.email))
    problems.push({
      field: "email",
      message: "Please give an email address, like name@example.com.",
    });

  if (proofRequired(entry.payment) && entry.proofFile === null)
    problems.push({
      field: "proof",
      message: "Please attach your payment proof.",
    });

  if (rules.termsOffered && !entry.termsAccepted)
    problems.push({
      field: "terms",
      message: "Please confirm you have read this.",
    });

  return problems;
}

export function entryReady(
  entry: PictionaryEntry,
  rules: PictionaryRules = DEFAULT_RULES,
): boolean {
  return pictionaryProblems(entry, rules).length === 0;
}

/** The message for one field (and one player where it applies), or undefined. */
export function problemFor(
  problems: PictionaryProblem[],
  field: PictionaryField,
  player?: number,
): string | undefined {
  return problems.find(
    (p) => p.field === field && (player === undefined || p.player === player),
  )?.message;
}

/** "Ayesha (16)" or "Ayesha (16) & Sana (19)" — one line for a list. */
export function entryLine(entry: {
  players: string[];
  ages: number[];
}): string {
  return entry.players
    .map((name, i) =>
      entry.ages[i] !== undefined ? `${name} (${entry.ages[i]})` : name,
    )
    .join(" & ");
}

/** Spots left, never below zero; `null` when the count is not known. */
export function spotsLeft(taken: number | null, max: number): number | null {
  if (taken === null) return null;
  return Math.max(0, max - taken);
}

/** Whether a given entry still fits in the spots that are left. */
export function fits(type: EntryType, left: number | null): boolean {
  if (left === null) return true;
  return left >= (type === "team" ? TEAM_OF : 1);
}
