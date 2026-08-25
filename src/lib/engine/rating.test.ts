import { describe, expect, it } from "vitest";

import {
  expectedScore,
  PSA_RATING,
  rateTournament,
  ratingAfterTournament,
  type RatedResult,
} from "./rating";

describe("expected score", () => {
  it("is even between equal players", () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 10);
  });

  it("is about ten to one at 400 points", () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 6);
    expect(expectedScore(1200, 1600)).toBeCloseTo(1 / 11, 6);
  });

  it("is symmetric — the two sides always sum to one", () => {
    for (const [a, b] of [[1200, 1200], [1000, 1750], [1618, 1216], [900, 901]]) {
      expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 10);
    }
  });
});

describe("rating after a tournament", () => {
  it("does not move a player who scores exactly what the field expected", () => {
    /* Four opponents of the same rating, two wins and two losses: expectation met. */
    const games = [1200, 1200, 1200, 1200].map((opponentRating, i) => ({
      opponentRating,
      score: i < 2 ? 1 : 0,
    }));
    const out = ratingAfterTournament(1200, 100, games);
    expect(out.expected).toBeCloseTo(2, 6);
    expect(out.actual).toBe(2);
    expect(out.delta).toBe(0);
    expect(out.after).toBe(1200);
  });

  it("rewards beating a stronger field more than beating a weaker one", () => {
    const strong = ratingAfterTournament(1200, 100, [{ opponentRating: 1600, score: 1 }]);
    const weak = ratingAfterTournament(1200, 100, [{ opponentRating: 800, score: 1 }]);

    expect(strong.delta).toBeGreaterThan(weak.delta);
    expect(strong.delta).toBeGreaterThan(0);
    expect(weak.delta).toBeGreaterThanOrEqual(0);
  });

  it("punishes losing to a weaker field more than losing to a stronger one", () => {
    const toWeak = ratingAfterTournament(1200, 100, [{ opponentRating: 800, score: 0 }]);
    const toStrong = ratingAfterTournament(1200, 100, [{ opponentRating: 1600, score: 0 }]);

    expect(toWeak.delta).toBeLessThan(toStrong.delta);
    expect(toWeak.delta).toBeLessThan(0);
  });

  it("moves a provisional rating further than an established one, on the same result", () => {
    const games = [{ opponentRating: 1400, score: 1 }];
    const newcomer = ratingAfterTournament(1200, 0, games);
    const veteran = ratingAfterTournament(1200, 500, games);

    expect(newcomer.provisional).toBe(true);
    expect(veteran.provisional).toBe(false);
    expect(newcomer.k).toBe(PSA_RATING.kProvisional);
    expect(veteran.k).toBe(PSA_RATING.kEstablished);
    expect(Math.abs(newcomer.delta)).toBeGreaterThan(Math.abs(veteran.delta));
  });

  /*
   * PSA publishes 50 games as the provisional threshold. The boundary is the part worth
   * pinning: a player who reaches exactly 50 during the event is still provisional for it,
   * and is established from the next one.
   */
  it("treats the fiftieth game as still provisional and the fifty-first as established", () => {
    const games = [{ opponentRating: 1200, score: 1 }];
    expect(ratingAfterTournament(1200, 49, games).provisional).toBe(true);
    expect(ratingAfterTournament(1200, 50, games).provisional).toBe(false);
  });

  it("reports the average opponent, which is what the published description turns on", () => {
    const out = ratingAfterTournament(1200, 100, [
      { opponentRating: 1000, score: 1 },
      { opponentRating: 1400, score: 0 },
    ]);
    expect(out.averageOpponent).toBe(1200);
  });

  it("leaves a player who played nothing exactly where they were", () => {
    const out = ratingAfterTournament(1350, 100, []);
    expect(out.delta).toBe(0);
    expect(out.after).toBe(1350);
    expect(out.played).toBe(0);
  });

  /*
   * Rounding once at the end, not per game. Rounding each game separately and summing gives a
   * different number, and over a season the difference compounds into a visible drift.
   */
  it("rounds the tournament once rather than each game", () => {
    /* Three losses to slightly weaker opponents: each game's change carries a fraction, and
       the fractions only add up to a different whole number if they are kept until the end. */
    const games = [
      { opponentRating: 1150, score: 0 },
      { opponentRating: 1150, score: 0 },
      { opponentRating: 1150, score: 0 },
    ];
    const once = ratingAfterTournament(1200, 100, games);

    const perGame = games.reduce(
      (sum, g) => sum + Math.round(PSA_RATING.kEstablished * (g.score - expectedScore(1200, g.opponentRating))),
      0,
    );

    expect(once.delta).toBe(
      Math.round(
        PSA_RATING.kEstablished *
          games.reduce((s, g) => s + g.score - expectedScore(1200, g.opponentRating), 0),
      ),
    );
    // And that this genuinely differs from the naive approach, or the test proves nothing.
    expect(once.delta).not.toBe(perGame);
  });

  it("never falls through the floor, and reports the change it actually took", () => {
    const out = ratingAfterTournament(505, 100, [
      { opponentRating: 400, score: 0 },
      { opponentRating: 400, score: 0 },
      { opponentRating: 400, score: 0 },
    ]);
    expect(out.after).toBe(PSA_RATING.floor);
    expect(out.after - out.before).toBe(out.delta);
  });
});

describe("rating a whole tournament", () => {
  const result = (
    playerAId: string,
    playerBId: string,
    scoreA: number,
    scoreB: number,
  ): RatedResult => ({ playerAId, playerBId, scoreA, scoreB });

  it("rates everyone against the rating they arrived with, not one already moved", () => {
    const before = [
      { playerId: "a", rating: 1200, gamesPlayed: 100 },
      { playerId: "b", rating: 1200, gamesPlayed: 100 },
      { playerId: "c", rating: 1200, gamesPlayed: 100 },
    ];

    /* a beats b, then b beats c. If b's loss were applied before its win, c would be rated
       against a weaker b than the one it actually played. */
    const out = rateTournament(before, [
      result("a", "b", 500, 400),
      result("b", "c", 500, 400),
    ]);

    expect(out.get("c")!.averageOpponent).toBe(1200);
    expect(out.get("a")!.averageOpponent).toBe(1200);
  });

  it("is independent of the order the results are given in", () => {
    const before = [
      { playerId: "a", rating: 1300, gamesPlayed: 100 },
      { playerId: "b", rating: 1100, gamesPlayed: 100 },
      { playerId: "c", rating: 1250, gamesPlayed: 100 },
    ];
    const games = [
      result("a", "b", 500, 400),
      result("b", "c", 300, 450),
      result("a", "c", 400, 410),
    ];

    const forwards = rateTournament(before, games);
    const backwards = rateTournament(before, [...games].reverse());

    for (const id of ["a", "b", "c"]) {
      expect(backwards.get(id)!.after).toBe(forwards.get(id)!.after);
    }
  });

  it("gives a player with no history the starting rating", () => {
    const out = rateTournament(
      [{ playerId: "known", rating: 1400, gamesPlayed: 100 }],
      [result("known", "newcomer", 500, 400)],
    );

    expect(out.get("newcomer")!.before).toBe(PSA_RATING.startRating);
    expect(out.get("newcomer")!.provisional).toBe(true);
    /* Faced a 1400 and lost — the loss is small, because it was expected. */
    expect(out.get("newcomer")!.delta).toBeLessThan(0);
    expect(out.get("known")!.averageOpponent).toBe(PSA_RATING.startRating);
  });

  it("does not rate a bye — turning up is not a game", () => {
    const out = rateTournament(
      [{ playerId: "a", rating: 1200, gamesPlayed: 100 }],
      [{ playerAId: "a", playerBId: "", scoreA: 0, scoreB: 0 }],
    );
    expect(out.has("a")).toBe(false);
  });

  it("scores a draw as half to each side", () => {
    const out = rateTournament(
      [
        { playerId: "a", rating: 1400, gamesPlayed: 100 },
        { playerId: "b", rating: 1200, gamesPlayed: 100 },
      ],
      [result("a", "b", 420, 420)],
    );

    expect(out.get("a")!.actual).toBe(0.5);
    expect(out.get("b")!.actual).toBe(0.5);
    /* The favourite drops on a draw, the underdog gains — and by the same amount. */
    expect(out.get("a")!.delta).toBeLessThan(0);
    expect(out.get("b")!.delta).toBeGreaterThan(0);
    expect(out.get("a")!.delta + out.get("b")!.delta).toBe(0);
  });

  /*
   * The property that makes a rating list add up: whatever one player gains, the other loses.
   * It holds only while everyone shares a K-factor, so this fixes the field as established —
   * a provisional player deliberately moves further than their opponent, which is the point
   * of a provisional rating and not a bug.
   */
  it("is zero-sum across a field on the same K-factor", () => {
    const before = ["a", "b", "c", "d"].map((playerId, i) => ({
      playerId,
      rating: 1150 + i * 70,
      gamesPlayed: 200,
    }));

    const out = rateTournament(before, [
      result("a", "b", 500, 400),
      result("c", "d", 380, 420),
      result("a", "c", 410, 430),
      result("b", "d", 500, 300),
    ]);

    const total = [...out.values()].reduce((sum, c) => sum + c.delta, 0);
    /* Rounding is per player, so the sum lands within a point or two of nothing rather than
       exactly nothing — but it must not drift. */
    expect(Math.abs(total)).toBeLessThanOrEqual(2);
  });
});
