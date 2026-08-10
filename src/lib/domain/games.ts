/**
 * Games, from the database into the engine.
 *
 * The standings, tie-break and awards engines are already written and tested
 * against the `Pairing` shape. Rather than rewriting them to read a new row type,
 * this converts one into the other — so wiring event day to the database changes
 * where the games come from, not how a tournament is scored.
 *
 * Standings are not here, and are not stored anywhere. They are computed from
 * verified games on demand.
 */

import type { DivisionId, Pairing, PairingStatus } from "./types";

/** A game as the database holds it. */
export interface GameRow {
  id: string;
  round: number;
  board: number;
  division: string;
  playerA: string;
  playerB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  /** Why a score is what it is, when somebody had to explain it. */
  note: string | null;
}

/** One board being proposed for publication. */
export interface BoardPlan {
  board: number;
  division: DivisionId;
  playerA: string;
  playerB: string | null;
}

const STATUSES: PairingStatus[] = [
  "scheduled",
  "live",
  "awaiting-verification",
  "verified",
];

function statusOf(row: GameRow): PairingStatus {
  /*
   * A row carrying scores is treated as verified even if its status somehow says
   * otherwise. The database will not accept 'verified' without scores, so scores
   * present is the stronger signal.
   */
  if (row.status === "disputed") return "awaiting-verification";
  const known = STATUSES.find((s) => s === row.status);
  return known ?? "scheduled";
}

const DIVISIONS: DivisionId[] = ["masters", "advanced", "recreational", "beginner"];

function divisionOf(value: string): DivisionId {
  return DIVISIONS.find((d) => d === value) ?? "recreational";
}

/**
 * Converts database games into engine pairings.
 *
 * `tournamentId` is carried on every pairing because the engine groups by it.
 */
export function pairingsFromGames(rows: GameRow[], tournamentId: string): Pairing[] {
  return rows
    .slice()
    .sort((a, b) => a.round - b.round || a.board - b.board)
    .map((row) => {
      const pairing: Pairing = {
        id: row.id,
        tournamentId,
        round: row.round,
        division: divisionOf(row.division),
        board: row.board,
        playerAId: row.playerA,
        playerBId: row.playerB,
        status: statusOf(row),

        /*
         * A published round is settled: the boards are on the wall and people are
         * sitting at them, so every board is locked against regeneration.
         *
         * The pairing engine's own fields — its justification, its confidence and
         * the conflicts it noticed — belong to the moment a round was proposed and
         * are not stored. Reporting an empty conflict list is honest: what is known
         * about this game is who played whom and what the score was. Inventing a
         * confidence figure for a game already played would be worse than omitting
         * one.
         */
        locked: true,
        reason: "Published round, read from the database.",
        confidence: 0,
        conflicts: [],
      };

      /*
       * Scores are set only when present. Writing 0 for a game nobody has played
       * would tell the standings engine it ended in a draw at zero.
       */
      if (row.scoreA !== null) pairing.scoreA = row.scoreA;
      if (row.scoreB !== null) pairing.scoreB = row.scoreB;

      return pairing;
    });
}

/** Progress through one round, for the director's tiles. */
export interface RoundProgress {
  totalBoards: number;
  verified: number;
  outstanding: number;
  percentComplete: number;
}

export function roundProgress(rows: GameRow[], round: number): RoundProgress {
  const boards = rows.filter((r) => r.round === round);
  const verified = boards.filter((r) => r.scoreA !== null).length;

  return {
    totalBoards: boards.length,
    verified,
    outstanding: boards.length - verified,
    // No boards means no progress to report, not complete.
    percentComplete: boards.length ? Math.round((verified / boards.length) * 100) : 0,
  };
}

/**
 * The highest round that has any boards, or 0.
 *
 * Used to work out where a tournament has got to, rather than keeping a
 * "current round" counter that can disagree with the games that exist.
 */
export function latestRound(rows: GameRow[]): number {
  return rows.reduce((max, r) => Math.max(max, r.round), 0);
}

/** Whether every board in a round has a result. */
export function roundComplete(rows: GameRow[], round: number): boolean {
  const boards = rows.filter((r) => r.round === round);
  return boards.length > 0 && boards.every((r) => r.scoreA !== null);
}

/**
 * Checks a proposed round before it is sent.
 *
 * The database rejects a duplicate board or a double-booked player, but a
 * constraint violation arrives as a Postgres error in front of a director holding
 * a room full of people. Naming the problem here means it can be fixed rather than
 * reported.
 */
export function validateBoardPlan(plan: BoardPlan[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];

  if (plan.length === 0) problems.push("There are no boards to publish.");

  const boards = new Set<number>();
  for (const b of plan) {
    if (boards.has(b.board)) problems.push(`Board ${b.board} appears twice.`);
    boards.add(b.board);
  }

  const seen = new Map<string, number>();
  for (const b of plan) {
    for (const id of [b.playerA, b.playerB]) {
      if (!id) continue;
      const already = seen.get(id);
      if (already !== undefined) {
        problems.push(`A player is on both board ${already} and board ${b.board}.`);
      }
      seen.set(id, b.board);
    }
  }

  for (const b of plan) {
    if (b.playerB !== null && b.playerA === b.playerB) {
      problems.push(`Board ${b.board} pairs a player with themselves.`);
    }
  }

  return { ok: problems.length === 0, problems };
}
