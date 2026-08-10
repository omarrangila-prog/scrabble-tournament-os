/**
 * Standings computation.
 *
 * Standings are always derived from verified results — never stored — so a
 * score correction anywhere immediately produces a correct table.
 */

import {
  Pairing,
  Player,
  RankingCriterion,
  StandingsRow,
  Tournament,
} from "../domain/types";
import { PerformanceRecord } from "./citations";

export interface PlayerRecord {
  playerId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  spread: number;
  points: number;
  opponents: string[];
  /** Running total of points after each round — the cumulative tiebreak. */
  cumulative: number;
  byes: number;
}

/** A pairing only counts once its result is verified. */
const isCounted = (p: Pairing) =>
  (p.status === "verified" && p.scoreA !== undefined && p.scoreB !== undefined) ||
  p.status === "bye";

export function buildRecords(
  players: Player[],
  pairings: Pairing[],
  upToRound?: number,
): Map<string, PlayerRecord> {
  const records = new Map<string, PlayerRecord>();
  for (const p of players) {
    records.set(p.id, {
      playerId: p.id,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      spread: 0,
      points: 0,
      opponents: [],
      cumulative: 0,
      byes: 0,
    });
  }

  const relevant = pairings
    .filter((p) => (upToRound === undefined ? true : p.round <= upToRound))
    .filter(isCounted)
    .sort((a, b) => a.round - b.round);

  for (const pair of relevant) {
    const a = records.get(pair.playerAId);
    if (!a) continue;

    if (pair.playerBId === null) {
      // A bye scores as a win with a fixed nominal spread.
      a.wins += 1;
      a.played += 1;
      a.points += 1;
      a.spread += 50;
      a.byes += 1;
      a.cumulative += a.points;
      continue;
    }

    const b = records.get(pair.playerBId);
    if (!b) continue;
    const sa = pair.scoreA!;
    const sb = pair.scoreB!;

    a.played += 1;
    b.played += 1;
    a.spread += sa - sb;
    b.spread += sb - sa;
    a.opponents.push(pair.playerBId);
    b.opponents.push(pair.playerAId);

    if (sa > sb) {
      a.wins += 1;
      b.losses += 1;
      a.points += 1;
    } else if (sb > sa) {
      b.wins += 1;
      a.losses += 1;
      b.points += 1;
    } else {
      a.draws += 1;
      b.draws += 1;
      a.points += 0.5;
      b.points += 0.5;
    }
    a.cumulative += a.points;
    b.cumulative += b.points;
  }

  return records;
}

/** Sum of opponents' points — the Buchholz tiebreak. */
function buchholz(rec: PlayerRecord, all: Map<string, PlayerRecord>): number {
  return rec.opponents.reduce((sum, id) => sum + (all.get(id)?.points ?? 0), 0);
}

function medianBuchholz(rec: PlayerRecord, all: Map<string, PlayerRecord>): number {
  const scores = rec.opponents
    .map((id) => all.get(id)?.points ?? 0)
    .sort((a, b) => a - b);
  if (scores.length <= 2) return scores.reduce((a, b) => a + b, 0);
  return scores.slice(1, -1).reduce((a, b) => a + b, 0);
}

function sonnebornBerger(
  rec: PlayerRecord,
  all: Map<string, PlayerRecord>,
  pairings: Pairing[],
): number {
  let total = 0;
  for (const pair of pairings.filter(isCounted)) {
    if (pair.playerBId === null) continue;
    const isA = pair.playerAId === rec.playerId;
    const isB = pair.playerBId === rec.playerId;
    if (!isA && !isB) continue;
    const oppId = isA ? pair.playerBId : pair.playerAId;
    const oppPoints = all.get(oppId)?.points ?? 0;
    const mine = isA ? pair.scoreA! : pair.scoreB!;
    const theirs = isA ? pair.scoreB! : pair.scoreA!;
    if (mine > theirs) total += oppPoints;
    else if (mine === theirs) total += oppPoints / 2;
  }
  return total;
}

/** Rating-based performance estimate; unrated opponents contribute 1200. */
function performance(
  rec: PlayerRecord,
  players: Map<string, Player>,
): number {
  if (rec.played === 0) return 0;
  const oppRatings = rec.opponents.map((id) => players.get(id)?.rating || 1200);
  const avg = oppRatings.length
    ? oppRatings.reduce((a, b) => a + b, 0) / oppRatings.length
    : 1200;
  const pct = rec.points / rec.played;
  // Standard performance adjustment, clamped to keep demo numbers sane.
  const delta = Math.max(-400, Math.min(400, Math.round((pct - 0.5) * 800)));
  return Math.round(avg + delta);
}

export function compareByRules(
  a: PlayerRecord,
  b: PlayerRecord,
  rules: RankingCriterion[],
  ctx: {
    all: Map<string, PlayerRecord>;
    players: Map<string, Player>;
    pairings: Pairing[];
  },
): number {
  for (const rule of rules) {
    let diff = 0;
    switch (rule) {
      case "wins":
        diff = b.wins + b.draws * 0.5 - (a.wins + a.draws * 0.5);
        break;
      case "draws":
        diff = b.draws - a.draws;
        break;
      case "spread":
        diff = b.spread - a.spread;
        break;
      case "head-to-head": {
        // Only decisive when the two players actually met.
        const meeting = ctx.pairings.find(
          (p) =>
            isCounted(p) &&
            p.playerBId !== null &&
            ((p.playerAId === a.playerId && p.playerBId === b.playerId) ||
              (p.playerAId === b.playerId && p.playerBId === a.playerId)),
        );
        if (meeting) {
          const aIsA = meeting.playerAId === a.playerId;
          const aScore = aIsA ? meeting.scoreA! : meeting.scoreB!;
          const bScore = aIsA ? meeting.scoreB! : meeting.scoreA!;
          diff = bScore - aScore;
        }
        break;
      }
      case "buchholz":
        diff = buchholz(b, ctx.all) - buchholz(a, ctx.all);
        break;
      case "median-buchholz":
        diff = medianBuchholz(b, ctx.all) - medianBuchholz(a, ctx.all);
        break;
      case "sonneborn-berger":
        diff =
          sonnebornBerger(b, ctx.all, ctx.pairings) -
          sonnebornBerger(a, ctx.all, ctx.pairings);
        break;
      case "cumulative":
        diff = b.cumulative - a.cumulative;
        break;
      case "performance":
        diff = performance(b, ctx.players) - performance(a, ctx.players);
        break;
    }
    if (diff !== 0) return diff;
  }
  // Final deterministic fallback so ordering never flickers between renders.
  return a.playerId.localeCompare(b.playerId);
}

export function computeStandings(
  players: Player[],
  pairings: Pairing[],
  tournament: Tournament,
  options: { division?: string; upToRound?: number } = {},
): StandingsRow[] {
  const pool = options.division
    ? players.filter((p) => p.division === options.division)
    : players;

  const all = buildRecords(players, pairings, options.upToRound);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const ctx = { all, players: playerMap, pairings };

  // Previous standings = same computation one round earlier, for movement.
  const previousRound = Math.max(0, (options.upToRound ?? tournament.currentRound) - 1);
  const prevAll = buildRecords(players, pairings, previousRound);
  const prevOrder = pool
    .map((p) => prevAll.get(p.id)!)
    .sort((a, b) => compareByRules(a, b, tournament.rankingRules, { ...ctx, all: prevAll }));
  const prevRank = new Map(prevOrder.map((r, i) => [r.playerId, i + 1]));

  const rows = pool
    .map((p) => all.get(p.id)!)
    .sort((a, b) => compareByRules(a, b, tournament.rankingRules, ctx))
    .map((rec, i) => {
      const player = playerMap.get(rec.playerId)!;
      const live = pairings.find(
        (p) =>
          p.round === tournament.currentRound &&
          (p.playerAId === rec.playerId || p.playerBId === rec.playerId),
      );
      return {
        playerId: rec.playerId,
        rank: i + 1,
        previousRank: prevRank.get(rec.playerId) ?? i + 1,
        played: rec.played,
        wins: rec.wins,
        draws: rec.draws,
        losses: rec.losses,
        spread: rec.spread,
        points: rec.points,
        buchholz: buchholz(rec, all),
        performance: performance(rec, playerMap),
        currentBoard: live?.board || undefined,
        status: player.checkIn,
      } satisfies StandingsRow;
    });

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Certificate records                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The highest single score a player recorded, or undefined if they have none.
 *
 * Only verified games count, and only games with a score: an unplayed board is not a
 * zero. Undefined rather than 0 when there is nothing, so a caller can tell "no games
 * recorded" apart from "scored nothing".
 */
function highestGameFor(playerId: string, pairings: Pairing[]): number | undefined {
  let best: number | undefined;

  for (const pairing of pairings) {
    if (pairing.status !== "verified") continue;

    const isA = pairing.playerAId === playerId;
    const isB = pairing.playerBId === playerId;
    if (!isA && !isB) continue;

    const score = isA ? pairing.scoreA : pairing.scoreB;
    if (score === undefined) continue;

    if (best === undefined || score > best) best = score;
  }

  return best;
}

/**
 * Converts standings into the performance records certificates are written
 * from.
 *
 * This adapter exists because an earlier awards screen synthesised records
 * from list position — rank by array index, wins by arithmetic — and fed them
 * into citation wording that presents itself as evidence-based. That produced
 * certificates asserting "first place, eight victories" for whoever happened to
 * sort first, with no game behind it.
 *
 * Going through computeStandings means a certificate can only ever restate
 * what the verified game record already says. Players with nothing verified are
 * excluded rather than given a placing they did not earn: a tournament with no
 * results yields no certificates, which is the honest outcome.
 *
 * Ranking is per division, because that is the field a player actually
 * competed in — ranking across divisions would place a Masters player fourth
 * behind three Beginners and call it a finish.
 */
export function performanceRecordsFor(
  players: Player[],
  pairings: Pairing[],
  tournament: Tournament,
  divisions: string[],
): PerformanceRecord[] {
  const records: PerformanceRecord[] = [];

  for (const division of divisions) {
    const rows = computeStandings(players, pairings, tournament, { division });
    // A player with no verified game has nothing to certify.
    const played = rows.filter((r) => r.played > 0);

    played.forEach((row, index) => {
      const player = players.find((p) => p.id === row.playerId);
      if (!player) return;

      records.push({
        playerId: player.id,
        playerName: player.fullName,
        division,
        // Re-ranked over players who actually played, so a field of absentees
        // does not leave gaps in the placings.
        rank: index + 1,
        fieldSize: played.length,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        spread: row.spread,
        gamesPlayed: row.played,
        roundsScheduled: tournament.totalRounds,
        /*
         * The player's best single game, from the results themselves.
         *
         * This was never populated, which quietly disabled every statement that depends
         * on it — the citation engine's "highest game" fact and the personal note on the
         * certificate both had a branch they could not reach. A field left undefined is
         * indistinguishable from a tournament where nobody scored well.
         */
        highestGame: highestGameFor(player.id, pairings),
      });
    });
  }

  return records;
}
