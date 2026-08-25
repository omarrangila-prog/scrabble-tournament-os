/**
 * Pairings and results in the database.
 *
 * Every write goes through a database function that checks staff membership, so a
 * browser cannot invent a score for a board it is not sitting at. Reads of the
 * board list are public, because a pairing sheet is a thing taped to a wall.
 */

import type { BoardPlan, GameRow } from "@/lib/domain/games";

import { supabase } from "./client";
import { announceBoardsChanged } from "./realtime";

/** One row of the public pairing sheet: names, no ids. */
export interface PublicBoard {
  board: number;
  division: string;
  playerA: string;
  playerB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: string;
  /** Whether `playerA` plays first. Null: no decision was made. */
  aPlaysFirst: boolean | null;
}

function missingFunction(message: string): boolean {
  return message.toLowerCase().includes("could not find the function");
}

const NEEDS_MIGRATION = "Event-day pairings need migration 0018 applied to the database.";

/** Every game for an event. Staff only, enforced in the database. */
export async function listGames(eventId: string): Promise<GameRow[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("staff_games", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.out_id),
    round: Number(r.out_round),
    board: Number(r.out_board),
    division: String(r.out_division ?? ""),
    playerA: String(r.out_player_a),
    playerB: (r.out_player_b as string | null) ?? null,
    scoreA: r.out_score_a === null || r.out_score_a === undefined ? null : Number(r.out_score_a),
    scoreB: r.out_score_b === null || r.out_score_b === undefined ? null : Number(r.out_score_b),
    status: String(r.out_status ?? "scheduled"),
    verifiedBy: (r.out_verified_by as string | null) ?? null,
    verifiedAt: (r.out_verified_at as string | null) ?? null,
    note: (r.out_note as string | null) ?? null,
    aPlaysFirst: (r.out_a_plays_first as boolean | null) ?? null,
  }));
}

export type PublishOutcome =
  | { ok: true; boards: number }
  | { ok: false; message: string };

/**
 * Publishes a round.
 *
 * Sent as one array so the round appears complete or not at all. A director who loses
 * connection halfway through should not end up with half a round on the venue screen.
 *
 * `by` is who is publishing — recorded in the audit log, and falls back to the signed-in
 * staff member's own email server-side when omitted.
 */
export async function publishRound(
  eventId: string,
  round: number,
  boards: BoardPlan[],
  by?: string,
): Promise<PublishOutcome> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { data, error } = await db.rpc("staff_publish_round", {
    p_event_id: eventId,
    p_round: round,
    p_boards: boards.map((b) => ({
      board: b.board,
      division: b.division,
      playerA: b.playerA,
      playerB: b.playerB ?? "",
      aPlaysFirst: b.aPlaysFirst ?? null,
    })),
    p_by: by ?? null,
  });

  if (error) {
    if (missingFunction(error.message)) return { ok: false, message: NEEDS_MIGRATION };

    /*
     * The database's own refusals are specific — a round still has an unfinished
     * predecessor, a player is double-booked across columns, someone in the plan is not on
     * the locked list — and each one names exactly what to fix. Flattening them into
     * "could not publish" would hand a director a mystery mid-round.
     */
    const known = [
      "already has",
      "still has",
      "not on the locked active list",
      "same player onto more than one board",
    ];
    if (known.some((phrase) => error.message.includes(phrase))) {
      return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
    }
    return { ok: false, message: "Could not publish the round. Please try again." };
  }

  /*
   * Tell participants to look again. Sent after the write succeeds, never before —
   * a nudge for a round that failed to publish would send a room full of people to
   * boards that do not exist.
   */
  announceBoardsChanged(eventId);

  return { ok: true, boards: Number(data ?? 0) };
}

/** Removes a round, results included. */
export async function clearRound(eventId: string, round: number): Promise<boolean> {
  const db = supabase();
  if (!db) return false;

  const { error } = await db.rpc("staff_clear_round", {
    p_event_id: eventId,
    p_round: round,
  });

  if (!error) announceBoardsChanged(eventId);
  return !error;
}

export type ResultOutcome = { ok: true } | { ok: false; message: string };

/**
 * Records the official score for a board.
 *
 * `by` is who entered it, and the database refuses a blank. A score with nobody
 * attached is not an audit trail, and the only useful question about a disputed
 * score is who typed it.
 */
export async function recordResult(
  gameId: string,
  scoreA: number,
  scoreB: number | null,
  by: string,
  note?: string,
  eventId?: string,
): Promise<ResultOutcome> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { error } = await db.rpc("staff_record_result", {
    p_game_id: gameId,
    p_score_a: scoreA,
    p_score_b: scoreB,
    p_by: by,
    p_note: note ?? "",
  });

  if (error) {
    if (missingFunction(error.message)) return { ok: false, message: NEEDS_MIGRATION };
    // Messages like "Both scores are required" are worth showing verbatim.
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }

  /*
   * The event id is not a parameter here — a game is addressed by its own id — so
   * the caller passes it in purely to nudge. Without it a recorded score would show
   * on staff screens instantly and on phones up to thirty seconds later.
   */
  if (eventId) announceBoardsChanged(eventId);

  return { ok: true };
}

/**
 * Puts a board's result into dispute, with the reason.
 *
 * The score stays as it is. A disputed board is not a wrong score, it is a score somebody
 * has questioned — and until a person settles it, the round cannot advance and the
 * Conflicts figure on Live Event counts it.
 *
 * Resolving it is not a separate action: re-entering the score verifies the board and
 * records who typed it. There is one path by which a score becomes official, and a person
 * is always on it.
 */
export async function flagResult(
  gameId: string,
  by: string,
  reason: string,
  eventId?: string,
): Promise<ResultOutcome & { already?: boolean }> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { data, error } = await db.rpc("staff_flag_result", {
    p_game_id: gameId,
    p_by: by,
    p_reason: reason,
  });

  if (error) {
    if (missingFunction(error.message))
      return { ok: false, message: "Flagging a score needs migration 0026 applied." };
    return { ok: false, message: error.message.replace(/^.*?:\s*/, "") };
  }

  if (eventId) announceBoardsChanged(eventId);
  return { ok: true, already: data === "already-disputed" };
}

/** Reopens a board whose score was entered by mistake. */
export async function clearResult(gameId: string, eventId?: string): Promise<boolean> {
  const db = supabase();
  if (!db) return false;

  const { error } = await db.rpc("staff_clear_result", { p_game_id: gameId });
  if (!error && eventId) announceBoardsChanged(eventId);
  return !error;
}

/**
 * Which round is on the boards, readable without signing in.
 *
 * A participant's phone needs this to know what to ask for. Returns 0 before
 * anything has been published.
 */
export async function currentPublicRound(eventId: string): Promise<number> {
  const db = supabase();
  if (!db) return 0;

  const { data, error } = await db.rpc("event_current_round", { p_event_id: eventId });
  if (error) return 0;
  return Number(data ?? 0);
}

/**
 * The board list for a round, readable without signing in.
 *
 * This is what a participant opens on their phone to find their table. Returns an
 * empty list until the round is published, so refreshing early shows nothing
 * rather than next round's pairings.
 */
export async function boardsForRound(
  eventId: string,
  round: number,
): Promise<PublicBoard[]> {
  const db = supabase();
  if (!db) return [];

  const { data, error } = await db.rpc("event_round_boards", {
    p_event_id: eventId,
    p_round: round,
  });
  if (error || !Array.isArray(data)) return [];

  return (data as Record<string, unknown>[]).map((r) => ({
    board: Number(r.out_board),
    division: String(r.out_division ?? ""),
    playerA: String(r.out_player_a ?? ""),
    playerB: (r.out_player_b as string | null) ?? null,
    scoreA: r.out_score_a === null || r.out_score_a === undefined ? null : Number(r.out_score_a),
    scoreB: r.out_score_b === null || r.out_score_b === undefined ? null : Number(r.out_score_b),
    status: String(r.out_status ?? "scheduled"),
    aPlaysFirst: (r.out_a_plays_first as boolean | null) ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Locking who is actually playing                                            */
/* -------------------------------------------------------------------------- */

export type LockOutcome =
  | { ok: true; count: number; alreadyPublished: boolean }
  | { ok: false; message: string };

/**
 * Snapshots who is checked in, right now, as the tournament's active player list.
 *
 * Pairing has always read the live roster at the instant the button is pressed — somebody
 * checking in mid-generation changed who got paired, with nothing recorded afterward about
 * who the tournament actually considered present. This is that record. Safe to call more
 * than once before Round 1 exists; refuses once it does, so a second lock cannot quietly
 * change who a published round was drawn from.
 */
export async function lockActivePlayers(eventId: string, by: string): Promise<LockOutcome> {
  const db = supabase();
  if (!db) return { ok: false, message: "The database is not reachable right now." };

  const { data, error } = await db.rpc("staff_lock_active_players", {
    p_event_id: eventId,
    p_by: by,
  });
  if (error) return { ok: false, message: "Could not lock the active player list." };

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  return {
    ok: true,
    count: Number(row?.out_locked_count ?? 0),
    alreadyPublished: Boolean(row?.out_already_published),
  };
}

/** The locked active list, or null when nothing has been locked for this event yet. */
export async function activePlayerIds(eventId: string): Promise<string[] | null> {
  const db = supabase();
  if (!db) return null;

  const { data, error } = await db.rpc("staff_active_player_ids", { p_event_id: eventId });
  if (error || !Array.isArray(data)) return null;
  return data.map((id) => String(id));
}
