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
  }));
}

export type PublishOutcome =
  | { ok: true; boards: number }
  | { ok: false; message: string };

/**
 * Publishes a round.
 *
 * Sent as one array so the round appears complete or not at all. A director who
 * loses connection halfway through should not end up with half a round on the
 * venue screen.
 */
export async function publishRound(
  eventId: string,
  round: number,
  boards: BoardPlan[],
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
    })),
  });

  if (error) {
    if (missingFunction(error.message)) return { ok: false, message: NEEDS_MIGRATION };

    /*
     * The database refuses to re-pair a round that has results. That is a real
     * answer to a real question, so it is passed through rather than flattened
     * into "could not publish".
     */
    if (error.message.includes("already has")) {
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
  }));
}
