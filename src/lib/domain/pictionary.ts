/**
 * Entering a Speed Pictionary team, which is not entering a tournament.
 *
 * A team is two to four people who pay PKR 1,400 each and play as one. It has no Scrabble
 * category, rating or player number, so it shares nothing with the tournament's registration
 * beyond the two field validators — and is stored in a collection of its own for the reason
 * `training.ts` explains: a payload flag would be one forgotten `where` away from a board.
 *
 * Everything a participant is told about the day — the fee, the date, the prizes — is read from
 * the event row. What lives here is the rules of the form: who must be named, what the team
 * owes, and when the form may be submitted.
 */

import { proofRequired, type PaymentChoice } from "./paymentProof";
import { phoneOk } from "./registrationParticipants";

/** Per player. A fallback only: the event row's own `fee` is what is charged. */
export const PICTIONARY_FEE = 1400;

/** The most a team may hold. The event row's `teamSize` overrides it. */
export const MAX_TEAM_SIZE = 4;

/**
 * The fewest a team may hold.
 *
 * Two, because the game needs somebody to draw and somebody to guess. The organiser only
 * stated the maximum; this is the one rule added on top, and it is a single number to change.
 */
export const MIN_TEAM_SIZE = 2;

/** Teams in round one. The event row's `maxTeams` overrides it. */
export const MAX_TEAMS = 8;

export type PictionaryPayment = Extract<PaymentChoice, "online" | "cash">;

export interface PictionaryEntry {
  teamName: string;
  /** Player names, the captain first. Blank rows are ignored, so a team may be 2 to 4. */
  players: string[];
  /** The captain's number: the one the organisers ring. */
  captainPhone: string;
  payment: PictionaryPayment;
  /** The receipt, when paying online. Uploaded by the caller. */
  proofFile: File | null;
  termsAccepted: boolean;
}

export const EMPTY_ENTRY: PictionaryEntry = {
  teamName: "",
  players: ["", ""],
  captainPhone: "",
  payment: "online",
  proofFile: null,
  termsAccepted: false,
};

/** The names actually filled in, tidied. */
export function namedPlayers(
  entry: Pick<PictionaryEntry, "players">,
): string[] {
  return entry.players
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter((p) => p !== "");
}

/** What the team owes: the fee for each named player. */
export function teamTotal(playerCount: number, fee: number): number {
  return Math.max(0, playerCount) * fee;
}

export type PictionaryField =
  "teamName" | "captain" | "players" | "phone" | "terms" | "proof";

export interface PictionaryProblem {
  field: PictionaryField;
  message: string;
}

/** The comparison used to spot the same person typed twice. */
function sameName(a: string): string {
  return a.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * What is still missing or wrong, in one pass, so the button and the messages under the inputs
 * cannot disagree about whether the form is ready.
 */
export function pictionaryProblems(
  entry: PictionaryEntry,
  options: { termsOffered: boolean; maxSize?: number },
): PictionaryProblem[] {
  const problems: PictionaryProblem[] = [];
  const max = options.maxSize ?? MAX_TEAM_SIZE;
  const names = namedPlayers(entry);

  if (entry.teamName.trim().length < 2)
    problems.push({
      field: "teamName",
      message: "Please give your team a name.",
    });

  if (entry.players[0]?.trim() === "" || entry.players[0] === undefined)
    problems.push({
      field: "captain",
      message: "Please give the team captain's full name.",
    });

  if (names.length < MIN_TEAM_SIZE)
    problems.push({
      field: "players",
      message: `A team needs at least ${MIN_TEAM_SIZE} players. Please name them all.`,
    });
  else if (names.length > max)
    problems.push({
      field: "players",
      message: `A team can have at most ${max} players.`,
    });
  else if (new Set(names.map(sameName)).size !== names.length)
    problems.push({
      field: "players",
      message: "Each player needs their own name.",
    });

  if (!phoneOk(entry.captainPhone))
    problems.push({
      field: "phone",
      message: "Please give the captain's mobile number.",
    });

  if (proofRequired(entry.payment) && entry.proofFile === null)
    problems.push({
      field: "proof",
      message: "Please attach your payment proof.",
    });

  /* Only asked for when there are terms to agree to; otherwise nobody could ever submit. */
  if (options.termsOffered && !entry.termsAccepted)
    problems.push({
      field: "terms",
      message: "Please confirm you have read this.",
    });

  return problems;
}

export function entryReady(
  entry: PictionaryEntry,
  options: { termsOffered: boolean; maxSize?: number },
): boolean {
  return pictionaryProblems(entry, options).length === 0;
}

export function problemFor(
  problems: PictionaryProblem[],
  field: PictionaryField,
): string | undefined {
  return problems.find((p) => p.field === field)?.message;
}

/** "Team Chalk — Ayesha, Sana, Hamza (3 players)" for a list row or a message. */
export function teamLine(team: {
  teamName: string;
  players: string[];
}): string {
  const n = team.players.length;
  return `${team.teamName} — ${team.players.join(", ")} (${n} player${n === 1 ? "" : "s"})`;
}

/** Places left, never below zero; `null` when the count is not known. */
export function placesLeft(taken: number | null, max: number): number | null {
  if (taken === null) return null;
  return Math.max(0, max - taken);
}
