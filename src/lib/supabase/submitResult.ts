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
 * Which board this code is playing, so the page can show it back before anybody types a
 * score.
 *
 * Null covers every failure — unknown code, not checked in, no round yet. The page says one
 * thing for all of them, because distinguishing them would let somebody use this to find out
 * whether a code exists or whether a particular person has arrived.
 */
export async function boardForCode(eventId: string, code: string): Promise<Board | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("board_for_code", {
    p_event_id: eventId,
    p_code: code.trim(),
  });

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
  code: string,
  myScore: number,
  theirScore: number,
): Promise<SubmitOutcome> {
  const db = supabase();
  if (!db) return { ok: false, reason: "No connection. Please see the desk." };

  const { data, error } = await db.rpc("submit_result_by_code", {
    p_event_id: eventId,
    p_code: code.trim(),
    p_my_score: myScore,
    p_their_score: theirScore,
  });

  if (error) {
    if (error.message.toLowerCase().includes("could not find the function")) {
      return { ok: false, reason: "Score submission needs migration 0029 applied." };
    }
    return { ok: false, reason: "That did not save. Please see the desk." };
  }

  if (data === "recorded") return { ok: true };

  return { ok: false, reason: REFUSALS[String(data)] ?? "Please see the desk." };
}
