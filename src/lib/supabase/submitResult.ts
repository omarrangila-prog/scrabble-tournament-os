"use client";

import { supabase } from "./client";

/**
 * A player submitting their own board's result.
 *
 * The six-digit code they already hold does two jobs: it proves who they are, and it tells
 * the system which board they are on. So nothing is typed that could be typed wrongly — no
 * table number, no opponent's name, no name of their own.
 */

export interface Board {
  gameId: string;
  round: number;
  board: number;
  you: string;
  /** Null for a bye, which has no result to submit. */
  opponent: string | null;
  alreadyRecorded: boolean;
}

/**
 * Which board a six-digit check-in code is playing.
 *
 * No screen asks for that code any more — a participant is told one identity, their
 * three-digit player number — but the function stays because the code is still on the
 * records of everybody who registered before numbers existed, and a person holding one
 * should not be turned away.
 *
 * Null covers every failure — unknown code, not checked in, no round yet. The page says one
 * thing for all of them, because distinguishing them would let somebody use this to find out
 * whether a code exists or whether a particular person has arrived.
 */
export async function boardForCode(eventId: string, code: string): Promise<Board | null> {
  return read(eventId, { p_code: code.trim() }, "board_for_code");
}

/**
 * The same, for a phone that proved who it belongs to at check-in.
 *
 * This is the path almost everybody takes between rounds: the page opens already knowing
 * the board, so there is nothing to type but two scores.
 */
export async function boardForToken(eventId: string, token: string): Promise<Board | null> {
  return read(eventId, { p_token: token.trim() }, "board_for_token");
}

async function read(
  eventId: string,
  key: Record<string, string>,
  fn: "board_for_code" | "board_for_token",
): Promise<Board | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc(fn, { p_event_id: eventId, ...key });

  if (error || !Array.isArray(data) || data.length === 0) return null;

  const row = data[0] as Record<string, unknown>;
  return {
    gameId: String(row.out_game_id),
    round: Number(row.out_round),
    board: Number(row.out_board),
    you: String(row.out_you ?? ""),
    opponent: (row.out_opponent as string | null) ?? null,
    alreadyRecorded: Boolean(row.out_already_recorded),
  };
}

export type SubmitOutcome =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * What each refusal from the database means, in words a player reading a phone at a noisy
 * venue can act on. Every one of them ends with something to do.
 */
const REFUSALS: Record<string, string> = {
  "not-found": "That code did not match anybody checked in. Check the digits, or ask at the desk.",
  "no-round": "No round has been published yet. Wait for the boards to go up.",
  "no-board": "You are not on a board this round. Please see the desk.",
  bye: "You have a bye this round, so there is no score to enter.",
  "already-recorded":
    "This board already has a score. If it is wrong, the desk can correct it.",
  "no-result": "There is no score on this board yet.",
  "missing-score": "Enter both scores.",
  "out-of-range": "Those numbers do not look right. Check them and try again.",
};

/**
 * Sends the result. Scores are given as the submitter's own and their opponent's, and the
 * database maps them onto the board — asking a player which side of the board they are is
 * how a result gets entered backwards.
 */
export async function submitResult(
  eventId: string,
  identity: { code: string } | { token: string },
  myScore: number,
  theirScore: number,
): Promise<SubmitOutcome> {
  const db = supabase();
  if (!db) return { ok: false, reason: "No connection. Please see the desk." };

  /*
   * Whichever proof the phone has. A remembered phone sends its token and types nothing; a
   * borrowed one sends the code its owner read out. The rules either side are identical.
   */
  const usingToken = "token" in identity;

  const { data, error } = await db.rpc(
    usingToken ? "submit_result_by_token" : "submit_result_by_code",
    {
      p_event_id: eventId,
      ...(usingToken ? { p_token: identity.token.trim() } : { p_code: identity.code.trim() }),
      p_my_score: myScore,
      p_their_score: theirScore,
    },
  );

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, reason: "Score submission needs migrations 0029 and 0031 applied." };
    }
    return { ok: false, reason: "That did not save. Please see the desk." };
  }

  if (data === "recorded") return { ok: true };

  return { ok: false, reason: REFUSALS[String(data)] ?? "Please see the desk." };
}

/* -------------------------------------------------------------------------- */
/* The other player's turn                                                     */
/* -------------------------------------------------------------------------- */

export interface ResultState {
  gameId: string;
  round: number;
  board: number;
  myScore: number;
  theirScore: number;
  opponent: string | null;
  /** True when this phone is the one that sent the score. */
  iSubmitted: boolean;
  confirmed: boolean;
  disputed: boolean;
}

/**
 * What this phone should be shown about a board that already has a score.
 *
 * The submitter sees what they sent; the opponent is asked whether it is right. Both need
 * the same three facts, so one read answers for either of them.
 */
export async function resultStateByToken(
  eventId: string,
  token: string,
): Promise<ResultState | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("result_state_by_token", {
    p_event_id: eventId,
    p_token: token.trim(),
  });

  if (error || !Array.isArray(data) || data.length === 0) return null;

  const row = data[0] as Record<string, unknown>;
  return {
    gameId: String(row.out_game_id),
    round: Number(row.out_round),
    board: Number(row.out_board),
    myScore: Number(row.out_my_score),
    theirScore: Number(row.out_their_score),
    opponent: (row.out_opponent as string | null) ?? null,
    iSubmitted: Boolean(row.out_i_submitted),
    confirmed: Boolean(row.out_confirmed),
    disputed: Boolean(row.out_disputed),
  };
}

/** The opponent agreeing. Changes nothing about the score, which was already official. */
export async function confirmResult(eventId: string, token: string): Promise<SubmitOutcome> {
  return call(eventId, "confirm_result_by_token", { p_token: token.trim() }, "confirmed");
}

/**
 * The opponent objecting.
 *
 * The score is left exactly as it is. A disagreement does not say which number is right, and
 * letting the second player overwrite the first would only move the argument.
 */
export async function disputeResult(
  eventId: string,
  token: string,
  reason: string,
): Promise<SubmitOutcome> {
  return call(
    eventId,
    "dispute_result_by_token",
    { p_token: token.trim(), p_reason: reason },
    "disputed",
  );
}

async function call(
  eventId: string,
  fn: string,
  args: Record<string, string>,
  success: string,
): Promise<SubmitOutcome> {
  const db = supabase();
  if (!db) return { ok: false, reason: "No connection. Please see the desk." };

  const { data, error } = await db.rpc(fn, { p_event_id: eventId, ...args });

  if (error) return { ok: false, reason: "That did not save. Please see the desk." };
  if (data === success) return { ok: true };

  return {
    ok: false,
    reason:
      data === "you-submitted-it"
        ? "You sent this score, so your opponent is the one who confirms it."
        : (REFUSALS[String(data)] ?? "Please see the desk."),
  };
}

/* -------------------------------------------------------------------------- */
/* Standings, for a screen with no session                                     */
/* -------------------------------------------------------------------------- */

export interface PublicStanding {
  division: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  spread: number;
}

/**
 * Standings anybody can read.
 *
 * The wall computed these from the roster, which needs a signed-in staff session — so a
 * television showed "nothing to show yet" while the results sat in the database. Names are
 * already public through the round's board list; this adds no disclosure pairing has not
 * already made, and returns nothing else about anybody.
 */
export async function publicStandings(eventId: string): Promise<PublicStanding[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("event_standings", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    division: String(row.out_division ?? ""),
    name: String(row.out_name ?? ""),
    played: Number(row.out_played ?? 0),
    wins: Number(row.out_wins ?? 0),
    losses: Number(row.out_losses ?? 0),
    draws: Number(row.out_draws ?? 0),
    spread: Number(row.out_spread ?? 0),
  }));
}

/** One arrival on the wall's list: what a badge already says, and nothing more. */
export interface PublicArrival {
  number: string;
  name: string;
  division: string;
  at: string | null;
}

/**
 * Everybody who has checked in, readable without an account.
 *
 * The wall's list of arrivals came from the staff roster, so on a television it was empty
 * while the desk's laptop — signed in — showed it correctly. Same mistake, same place, third
 * time: anything a screen with no account has to show needs a read that expects no account.
 *
 * A name, a category and a player number. All three are on the badge and on the pairing
 * sheet; no phone number, no payment state, nothing a person did not bring into the room.
 */
export async function publicArrivals(eventId: string): Promise<PublicArrival[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("event_checked_in", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((row) => ({
    number: String(row.out_number ?? ""),
    name: String(row.out_name ?? ""),
    division: String(row.out_division ?? ""),
    at: (row.out_at as string | null) ?? null,
  }));
}
