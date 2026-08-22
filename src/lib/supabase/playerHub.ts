"use client";

import { supabase } from "./client";

/**
 * The reads behind a participant's own page.
 *
 * Everything here is either public already — a name, a player number, a board — or behind the
 * token their phone was given at check-in. Nothing returns a mobile number or an address.
 */

export interface PlayerHit {
  number: string;
  name: string;
  division: string;
}

/**
 * Finding somebody by what they can remember.
 *
 * Their number if they still have it, otherwise their name, spelled however they spell it.
 * The matching lives in the database — see `player_search` — because being generous about
 * names is the whole point and doing it in the browser would mean shipping the roster there.
 */
export async function searchPlayers(eventId: string, query: string): Promise<PlayerHit[]> {
  const db = supabase();
  const q = query.trim();
  if (!db || q.length < 2) return [];

  const { data, error } = await db.rpc("player_search", { p_event_id: eventId, p_query: q });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    number: String(r.out_number ?? ""),
    name: String(r.out_name ?? ""),
    division: String(r.out_division ?? ""),
  }));
}

export interface PlayerRound {
  round: number;
  board: number;
  seat: "A" | "B";
  opponent: string | null;
  opponentNumber: string | null;
  status: string;
  myScore: number | null;
  theirScore: number | null;
  iSubmitted: boolean;
  confirmed: boolean;
  isBye: boolean;
}

/** Every round this player has been paired for, oldest first. */
export async function playerRounds(eventId: string, token: string): Promise<PlayerRound[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("player_rounds", {
    p_event_id: eventId,
    p_token: token.trim(),
  });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    round: Number(r.out_round),
    board: Number(r.out_board),
    seat: r.out_seat === "A" ? "A" : "B",
    opponent: (r.out_opponent as string | null) ?? null,
    opponentNumber: (r.out_opponent_number as string | null) ?? null,
    status: String(r.out_status ?? "scheduled"),
    myScore: r.out_my_score === null ? null : Number(r.out_my_score),
    theirScore: r.out_their_score === null ? null : Number(r.out_their_score),
    iSubmitted: Boolean(r.out_i_submitted),
    confirmed: Boolean(r.out_confirmed),
    isBye: Boolean(r.out_is_bye),
  }));
}

/**
 * What a round looks like to the person playing it.
 *
 * Derived rather than stored, so it cannot disagree with the game it describes. The order
 * matters: a disputed board is disputed however good the scores look, and a bye is a bye
 * before it is anything else.
 */
export type RoundState = "bye" | "disputed" | "settled" | "awaiting" | "live" | "upcoming";

export function roundState(r: PlayerRound, currentRound: number): RoundState {
  if (r.isBye) return "bye";
  if (r.status === "disputed" || r.status === "flagged") return "disputed";
  if (r.myScore !== null && r.theirScore !== null) {
    /*
     * `verified` is not the same as agreed.
     *
     * Submitting a score sets the board to verified straight away — deliberately, so the
     * standings move while the round is still running rather than waiting on somebody who has
     * gone to find a drink. Agreement is a separate fact, and it is `confirmed_by`.
     *
     * Reading verified as settled here meant the opponent opened their phone to a finished
     * board and no way to say the number was wrong, which is the one thing they are there to
     * do. Only `confirmed` settles it.
     */
    return r.confirmed ? "settled" : "awaiting";
  }
  return r.round <= currentRound ? "live" : "upcoming";
}

/** Won, lost or drawn, once there are two numbers to compare. */
export function outcome(r: PlayerRound): "Won" | "Lost" | "Drew" | null {
  if (r.myScore === null || r.theirScore === null) return null;
  if (r.myScore > r.theirScore) return "Won";
  if (r.myScore < r.theirScore) return "Lost";
  return "Drew";
}
