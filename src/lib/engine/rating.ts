/**
 * Player ratings.
 *
 * The Pakistan Scrabble Association publishes how its rating behaves but not the arithmetic
 * behind it. From https://pakistanscrabble.org/ratings/ :
 *
 *   - a rating tracks "winning probability per tournament", found from the average rating of
 *     the opponents played and how far the player's own rating sits above or below it;
 *   - a rating is provisional until 50 games have been played;
 *   - the published list runs from about 1216 at tenth place to 1618 at first.
 *
 * That description is the Elo family, and everything here implements it in the standard way.
 * What is *not* published is the constant that decides how far a rating moves — the K-factor —
 * and the rating a new player starts on. Those live in `PSA_RATING` below, in one place, so
 * that when the association's own figures are known they are a two-line change rather than a
 * rewrite, and every number in this file moves with them.
 *
 * Until that confirmation, nothing here should be presented to a player as their official PSA
 * rating. It is this tournament's arithmetic, computed the way PSA describes.
 *
 * Deliberately pure: no database, no clock, no randomness. A rating that cannot be recomputed
 * from the games that produced it is not a rating, it is a rumour — so every function here
 * takes the games and gives the same answer every time.
 */

export interface RatingConfig {
  /** Where an unrated player starts. */
  startRating: number;
  /** Games before a rating stops being provisional. PSA publishes this as 50. */
  provisionalGames: number;
  /** How far a provisional rating may move in one tournament — deliberately larger, so a new
   *  player reaches roughly the right level quickly instead of over several seasons. */
  kProvisional: number;
  /** How far an established rating may move. */
  kEstablished: number;
  /** Ratings are whole numbers on every list anyone publishes. */
  floor: number;
}

/**
 * The association's published behaviour, with the two unpublished constants set to the values
 * every comparable body uses. `provisionalGames` is PSA's own figure; `startRating` and the
 * two K-factors are conventional and are the ones to replace once PSA confirms them.
 */
export const PSA_RATING: RatingConfig = {
  startRating: 1200,
  provisionalGames: 50,
  kProvisional: 30,
  kEstablished: 20,
  floor: 500,
};

/** One game, from one player's side. */
export interface RatedGame {
  opponentRating: number;
  /** 1 for a win, 0.5 for a draw, 0 for a loss. Byes are not games and are not passed here. */
  score: number;
}

/**
 * The chance a player of `mine` beats a player of `theirs`, on the logistic curve every Elo
 * system uses: 400 points of advantage is roughly a 10-to-1 favourite.
 */
export function expectedScore(mine: number, theirs: number): number {
  return 1 / (1 + Math.pow(10, (theirs - mine) / 400));
}

export interface RatingChange {
  /** The rating this player carried into the tournament. */
  before: number;
  after: number;
  /** Signed, and already rounded — `after - before`. */
  delta: number;
  /** Games this tournament contributed. Byes excluded. */
  played: number;
  /** What the field said they should have scored, to two decimals. */
  expected: number;
  /** What they actually scored — a win 1, a draw 0.5. */
  actual: number;
  /** The K-factor that applied, which depends on whether they were still provisional. */
  k: number;
  /** True while under `provisionalGames`, so a screen can mark it rather than imply certainty. */
  provisional: boolean;
  /** Mean rating of the opponents faced — the figure PSA's own description turns on. */
  averageOpponent: number;
}

/**
 * A player's rating after one tournament.
 *
 * Aggregated across the whole event rather than applied game by game, which is what "winning
 * probability per tournament" means and what keeps the result independent of the order the
 * rounds happened to be played in.
 *
 * `gamesBefore` is how many rated games the player had already played in their career, not in
 * this event — it is what decides whether they are still provisional.
 */
export function ratingAfterTournament(
  before: number,
  gamesBefore: number,
  games: RatedGame[],
  config: RatingConfig = PSA_RATING,
): RatingChange {
  const provisional = gamesBefore + games.length <= config.provisionalGames;
  const k = provisional ? config.kProvisional : config.kEstablished;

  if (games.length === 0) {
    return {
      before,
      after: before,
      delta: 0,
      played: 0,
      expected: 0,
      actual: 0,
      k,
      provisional,
      averageOpponent: 0,
    };
  }

  const expected = games.reduce((sum, g) => sum + expectedScore(before, g.opponentRating), 0);
  const actual = games.reduce((sum, g) => sum + g.score, 0);
  const averageOpponent =
    games.reduce((sum, g) => sum + g.opponentRating, 0) / games.length;

  /*
   * Rounded once, at the end. Rounding each game separately and adding them up gives a
   * different answer, and the difference compounds over a season — so the whole tournament is
   * one calculation with one rounding.
   */
  const delta = Math.round(k * (actual - expected));
  const after = Math.max(config.floor, before + delta);

  return {
    before,
    after,
    /* Reports the change that actually happened: at the floor, `after - before` is the truth
       and `delta` alone would claim a drop the rating did not take. */
    delta: after - before,
    played: games.length,
    expected: Math.round(expected * 100) / 100,
    actual,
    k,
    provisional,
    averageOpponent: Math.round(averageOpponent),
  };
}

/** What a player's rated history amounts to, before this event. */
export interface RatedPlayerBefore {
  playerId: string;
  rating: number;
  gamesPlayed: number;
}

/** One board, as the rating engine needs it: two players and a settled result. */
export interface RatedResult {
  playerAId: string;
  playerBId: string;
  scoreA: number;
  scoreB: number;
}

/**
 * Every player's rating change across one tournament.
 *
 * Everyone is rated against the ratings they *arrived* with, never against a rating that has
 * already moved during the same event. Otherwise a player's result depends on which order the
 * engine happened to process the field in, and two runs over the same tournament disagree.
 *
 * A player with no prior history starts at `config.startRating`. A bye contributes nothing:
 * it is not a game, and rating a player for turning up would let a bye be worth points.
 */
export function rateTournament(
  before: RatedPlayerBefore[],
  results: RatedResult[],
  config: RatingConfig = PSA_RATING,
): Map<string, RatingChange> {
  const priorById = new Map(before.map((p) => [p.playerId, p]));
  const priorOf = (id: string): RatedPlayerBefore =>
    priorById.get(id) ?? { playerId: id, rating: config.startRating, gamesPlayed: 0 };

  const games = new Map<string, RatedGame[]>();
  const add = (id: string, game: RatedGame) => {
    const list = games.get(id) ?? [];
    list.push(game);
    games.set(id, list);
  };

  for (const r of results) {
    /* A game needs two players. A bye has one and is not rated. */
    if (!r.playerAId || !r.playerBId) continue;

    const a = priorOf(r.playerAId).rating;
    const b = priorOf(r.playerBId).rating;

    const scoreA = r.scoreA > r.scoreB ? 1 : r.scoreA < r.scoreB ? 0 : 0.5;

    add(r.playerAId, { opponentRating: b, score: scoreA });
    add(r.playerBId, { opponentRating: a, score: 1 - scoreA });
  }

  const out = new Map<string, RatingChange>();
  for (const [playerId, played] of games) {
    const prior = priorOf(playerId);
    out.set(playerId, ratingAfterTournament(prior.rating, prior.gamesPlayed, played, config));
  }
  return out;
}
