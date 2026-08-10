/**
 * Who leads each category, on the figures that decide the prizes.
 *
 * Categories are the unit this event awards in — 5,000 to the winner of each — so the
 * numbers that matter are per category, not across the room. A single "highest spread of
 * the day" tells a beginner nothing except that an advanced player scored more.
 *
 * Everything is derived from the same performance records the standings and certificates
 * use, so a leader shown here cannot disagree with the certificate that names them.
 * Nothing is stored.
 */

import type { PerformanceRecord } from "./citations";

export interface Leader {
  playerId: string;
  playerName: string;
  value: number;
}

export interface CategoryLeaders {
  category: string;
  played: number;

  /**
   * Best points margin in the category.
   *
   * A list, not one name: two players can finish level, and picking one of them would be
   * choosing arbitrarily where the results do not.
   */
  bestSpread: Leader[];
  /** Highest single game recorded in the category. */
  highestGame: Leader[];
  /** Most games won in the category. */
  mostWins: Leader[];
}

/** Everyone tied at the top of one measure, or an empty list when nobody qualifies. */
function topOf(
  records: PerformanceRecord[],
  value: (r: PerformanceRecord) => number | undefined,
  /** Below this a figure is not worth reporting — a negative margin is not a leader. */
  floor: number,
): Leader[] {
  const scored = records
    .map((r) => ({ record: r, v: value(r) }))
    .filter((x): x is { record: PerformanceRecord; v: number } => x.v !== undefined && x.v >= floor);

  if (scored.length === 0) return [];

  const best = Math.max(...scored.map((x) => x.v));
  return scored
    .filter((x) => x.v === best)
    .map((x) => ({ playerId: x.record.playerId, playerName: x.record.playerName, value: x.v }));
}

/**
 * One row per category that has played, in the order given.
 *
 * Categories with nobody in them are left out rather than shown empty: a row reading
 * "Advanced — no leader" invites the reader to wonder whether the data is missing, when
 * in fact nobody entered.
 */
export function categoryLeaders(
  records: PerformanceRecord[],
  categories: string[],
): CategoryLeaders[] {
  return categories
    .map((category) => {
      const inCategory = records.filter((r) => r.division === category && r.gamesPlayed > 0);

      return {
        category,
        played: inCategory.length,
        /*
         * A margin has to be positive to lead. In a category where everybody finished
         * behind, the honest answer is that there is no best margin to report — not that
         * the least-negative player holds one.
         */
        bestSpread: topOf(inCategory, (r) => r.spread, 1),
        highestGame: topOf(inCategory, (r) => r.highestGame, 1),
        mostWins: topOf(inCategory, (r) => r.wins, 1),
      };
    })
    .filter((row) => row.played > 0);
}

/** "Ahmed Khan", or "Ahmed Khan and Nida Fatima", or "3 players level". */
export function leaderLabel(leaders: Leader[]): string {
  if (leaders.length === 0) return "—";
  if (leaders.length === 1) return leaders[0]!.playerName;
  if (leaders.length === 2) return `${leaders[0]!.playerName} and ${leaders[1]!.playerName}`;
  return `${leaders.length} players level`;
}
