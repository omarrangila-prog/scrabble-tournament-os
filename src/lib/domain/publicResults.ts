/**
 * The public results page, worked out from the games alone.
 *
 * Everything on the page — standings, pairings, results, the round selector — is derived from
 * one list of games, read from `event_public_games`. Nothing is stored, so there is nothing to
 * fall out of step: correct a score and the standings are recalculated from the corrected game
 * the next time the page reads.
 *
 * The ranking mirrors the database's `event_standings` exactly — a win is a point, a draw half
 * of one, then spread, then name — because that is what the venue television already shows. Two
 * public screens in one room must never rank the same people differently. A bye is left out of
 * the record the same way it is there. The test file pins this, and the acceptance run compares
 * the two against a real database.
 */

export interface PublicGame {
  round: number;
  /** The table number. */
  board: number;
  division: string;
  playerA: string;
  /** Null on a bye. */
  playerB: string | null;
  scoreA: number | null;
  scoreB: number | null;
  status: string;
  /** Whether playerA played first, where that is recorded. */
  aFirst: boolean | null;
}

/** A game with a result nobody disputes: verified, and with every score it needs. */
export function isFinished(game: PublicGame): boolean {
  if (game.status !== "verified" || game.scoreA === null) return false;
  return game.playerB === null || game.scoreB !== null;
}

export function isBye(game: PublicGame): boolean {
  return game.playerB === null;
}

export function roundsOf(games: PublicGame[]): number[] {
  return [...new Set(games.map((g) => g.round))].sort((a, b) => a - b);
}

export function latestRound(games: PublicGame[]): number {
  return games.reduce((max, g) => Math.max(max, g.round), 0);
}

export function divisionsOf(games: PublicGame[]): string[] {
  return [...new Set(games.map((g) => g.division))];
}

export interface RoundStatus {
  round: number;
  /** Boards that have somebody to play. A bye has no result to wait for. */
  boards: number;
  finished: number;
  pending: number;
  complete: boolean;
}

export function roundStatus(games: PublicGame[], round: number, division?: string): RoundStatus {
  const boards = games.filter(
    (g) => g.round === round && !isBye(g) && (!division || g.division === division),
  );
  const finished = boards.filter(isFinished).length;
  return {
    round,
    boards: boards.length,
    finished,
    pending: boards.length - finished,
    complete: boards.length > 0 && finished === boards.length,
  };
}

export interface StandingRow {
  division: string;
  rank: number;
  name: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  /** A win is one, a draw is half. */
  points: number;
  spread: number;
}

/**
 * Standings after `throughRound`, per division.
 *
 * Only finished games with two players count, which is what the database's version counts: a
 * board still being played adds nothing, and a bye adds nothing. Ranked by points, then spread,
 * then name — and two players level on all three share a rank rather than being separated by the
 * alphabet, since the alphabet is not a result.
 */
export function standingsThrough(
  games: PublicGame[],
  throughRound: number,
  division?: string,
): StandingRow[] {
  type Tally = Omit<StandingRow, "rank">;
  const tallies = new Map<string, Tally>();

  const tally = (div: string, name: string): Tally => {
    const key = `${div}\u0000${name}`;
    let row = tallies.get(key);
    if (!row) {
      row = { division: div, name, played: 0, wins: 0, losses: 0, draws: 0, points: 0, spread: 0 };
      tallies.set(key, row);
    }
    return row;
  };

  for (const g of games) {
    if (g.round > throughRound || isBye(g) || !isFinished(g)) continue;
    if (division && g.division !== division) continue;

    const a = tally(g.division, g.playerA);
    const b = tally(g.division, g.playerB as string);
    const sa = g.scoreA as number;
    const sb = g.scoreB as number;

    a.played += 1;
    b.played += 1;
    a.spread += sa - sb;
    b.spread += sb - sa;

    if (sa > sb) {
      a.wins += 1;
      a.points += 1;
      b.losses += 1;
    } else if (sb > sa) {
      b.wins += 1;
      b.points += 1;
      a.losses += 1;
    } else {
      a.draws += 1;
      b.draws += 1;
      a.points += 0.5;
      b.points += 0.5;
    }
  }

  const order = (x: Tally, y: Tally) =>
    y.points - x.points || y.spread - x.spread || x.name.localeCompare(y.name, "en");

  const byDivision = new Map<string, Tally[]>();
  for (const row of tallies.values()) {
    const list = byDivision.get(row.division) ?? [];
    list.push(row);
    byDivision.set(row.division, list);
  }

  const out: StandingRow[] = [];
  for (const [div, list] of byDivision) {
    list.sort(order);
    list.forEach((row, i) => {
      const previous = list[i - 1];
      const tied = previous && previous.points === row.points && previous.spread === row.spread;
      const rank = tied ? out[out.length - 1].rank : i + 1;
      out.push({ ...row, rank, division: div });
    });
  }
  return out;
}

export function boardsOf(games: PublicGame[], round: number, division?: string): PublicGame[] {
  return games
    .filter((g) => g.round === round && (!division || g.division === division))
    .sort((a, b) => a.board - b.board);
}

export interface Outcome {
  winner: "a" | "b" | "draw" | null;
  winnerName: string | null;
  /** The winner's margin, always positive; zero for a draw. */
  spread: number;
}

export function outcomeOf(game: PublicGame): Outcome {
  if (!isFinished(game) || game.playerB === null)
    return { winner: null, winnerName: null, spread: 0 };

  const sa = game.scoreA as number;
  const sb = game.scoreB as number;
  if (sa === sb) return { winner: "draw", winnerName: null, spread: 0 };
  return sa > sb
    ? { winner: "a", winnerName: game.playerA, spread: sa - sb }
    : { winner: "b", winnerName: game.playerB, spread: sb - sa };
}

/** "+214", "-12", "0". */
export function signedSpread(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

/** "3-1" or "2-1-1" when there are draws. */
export function recordLabel(row: Pick<StandingRow, "wins" | "losses" | "draws">): string {
  return row.draws > 0 ? `${row.wins}-${row.losses}-${row.draws}` : `${row.wins}-${row.losses}`;
}

/** "3" or "2.5". */
export function pointsLabel(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}
