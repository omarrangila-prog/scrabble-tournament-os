import { describe, expect, it } from "vitest";

import type { ValidatorRules } from "./pairingValidator";
import { seededRandom, simulateTournament, type SimReport } from "./tournamentSim";

/**
 * The acceptance tests.
 *
 * A tester ran the software and reported that Beginner, Recreational and Advanced players
 * were mixed together and that the pairings looked random. These tests drive the real
 * engine — not a copy of it — through whole tournaments and assert the properties that
 * failure would violate. The stated target is zero: no category mixing, no duplicate
 * players, nobody missing, no self-pairing, no invalid bye, no table collision.
 */

const RULES: ValidatorRules = {
  divisions: ["beginner", "recreational", "advanced"],
  repeatPolicy: "avoid-repeat",
  maxByesPerPlayer: 1,
  crossDivisionPairing: false,
  firstSecondEnabled: false,
};

/** Blocking findings grouped by code, which is what a failure report should read as. */
function tally(report: SimReport): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of report.blocking) out[f.code] = (out[f.code] ?? 0) + 1;
  return out;
}

/** Spreads `total` players across the divisions as evenly as the number allows. */
function spread(total: number, divisions: string[]): Record<string, number> {
  const per: Record<string, number> = {};
  divisions.forEach((d, i) => {
    per[d] = Math.floor(total / divisions.length) + (i < total % divisions.length ? 1 : 0);
  });
  return per;
}

describe("category isolation — the failure the acceptance test found", () => {
  /*
   * The counts the brief asked for. The small ones matter most: two, three and five players
   * are where a fold-and-pair loop runs out of people, and an odd division is where the bye
   * has to come from somewhere.
   */
  const COUNTS = [2, 3, 4, 5, 7, 8, 17, 31, 42, 52, 71, 100];

  for (const total of COUNTS) {
    it(`never mixes categories with ${total} players across 3 divisions`, () => {
      const report = simulateTournament({
        rounds: 5,
        divisions: RULES.divisions,
        perDivision: spread(total, RULES.divisions),
        rules: RULES,
        random: seededRandom(total * 7919),
      });

      expect(tally(report)).toEqual({});
    });
  }

  for (const divisionCount of [1, 2, 3, 4]) {
    it(`keeps ${divisionCount} division(s) separate over 5 rounds`, () => {
      const divisions = ["beginner", "recreational", "advanced", "masters"].slice(0, divisionCount);
      const rules = { ...RULES, divisions };

      const report = simulateTournament({
        rounds: 5,
        divisions,
        perDivision: spread(52, divisions),
        rules,
        random: seededRandom(divisionCount * 104729),
      });

      expect(tally(report)).toEqual({});
      expect(Object.keys(report.standings)).toEqual(divisions);
    });
  }

  it("runs a division of one without pairing them against anybody else", () => {
    /*
     * The shape the real Cafe Leap roster had for a while: one player alone in Advanced.
     * The temptation is to pair them with the nearest Recreational player, which is exactly
     * the mixing this suite exists to refuse. They get a bye, and when the event allows only
     * one, the round after that has nothing legal to give them — which is the director's
     * problem to solve and must not be solved by quietly crossing categories.
     */
    const report = simulateTournament({
      rounds: 1,
      divisions: RULES.divisions,
      perDivision: { beginner: 6, recreational: 6, advanced: 1 },
      rules: RULES,
      random: seededRandom(11),
    });

    expect(tally(report)).toEqual({});
    const solo = report.rounds[0].boards.filter((b) => b.division === "advanced");
    expect(solo).toHaveLength(1);
    expect(solo[0].playerB).toBeNull();
  });
});

describe("randomised Swiss testing", () => {
  /*
   * Many tournaments rather than one, because a pairing fault is usually a shape rather than
   * a bug that fires every time: a score group that empties at the wrong moment, a repeat
   * that only becomes unavoidable in round four. Seeds are fixed so a failure names the
   * tournament that produced it.
   */
  it("survives 300 seeded tournaments with no blocking finding", () => {
    const failures: { seed: number; codes: Record<string, number> }[] = [];
    let rounds = 0;
    let matches = 0;
    let byes = 0;

    for (let seed = 1; seed <= 300; seed += 1) {
      /* Player counts and division shapes both vary with the seed. */
      const total = 4 + (seed % 60);
      const divisionCount = 1 + (seed % 3);
      const divisions = RULES.divisions.slice(0, divisionCount);
      const rules = { ...RULES, divisions };

      const report = simulateTournament({
        rounds: 4,
        divisions,
        perDivision: spread(total, divisions),
        rules,
        random: seededRandom(seed * 2654435761),
      });

      rounds += report.rounds.length;
      matches += report.matches;
      byes += report.byes;

      const codes = tally(report);
      if (Object.keys(codes).length > 0) failures.push({ seed, codes });
    }

    expect(failures).toEqual([]);
    /* The suite is worth nothing if it did not actually play anything. */
    expect(rounds).toBeGreaterThan(1000);
    expect(matches).toBeGreaterThan(10000);
    expect(byes).toBeGreaterThan(0);
  });
});

describe("the day going wrong", () => {
  it("handles a withdrawal mid-event without corrupting later rounds", () => {
    const report = simulateTournament({
      rounds: 5,
      divisions: RULES.divisions,
      perDivision: spread(52, RULES.divisions),
      rules: RULES,
      random: seededRandom(4242),
      withdrawAfterRound: { round: 3, index: 7 },
    });

    expect(tally(report)).toEqual({});
    expect(report.rounds).toHaveLength(5);
  });

  it("handles a late arrival joining after round two", () => {
    const report = simulateTournament({
      rounds: 5,
      divisions: RULES.divisions,
      perDivision: spread(31, RULES.divisions),
      rules: RULES,
      random: seededRandom(99),
      lateArrivalAfterRound: 2,
    });

    expect(tally(report)).toEqual({});
  });

  it("gives one bye per odd division and never two to the same player", () => {
    const report = simulateTournament({
      rounds: 5,
      divisions: RULES.divisions,
      /* All three odd, so every round of the event has three byes to place. */
      perDivision: { beginner: 7, recreational: 9, advanced: 5 },
      rules: RULES,
      random: seededRandom(77),
    });

    expect(tally(report)).toEqual({});

    const byesPerPlayer = new Map<string, number>();
    for (const r of report.rounds) {
      for (const b of r.boards.filter((x) => x.playerB === null)) {
        byesPerPlayer.set(b.playerA, (byesPerPlayer.get(b.playerA) ?? 0) + 1);
      }
    }
    expect(Math.max(...byesPerPlayer.values())).toBeLessThanOrEqual(RULES.maxByesPerPlayer);
  });
});

describe("THE FINAL ACCEPTANCE TEST", () => {
  /*
   * The scenario the brief specifies: three categories, more than fifty players, five
   * rounds, with a withdrawal and byes along the way. Run end to end, with every round
   * validated against the roster it was drawn from.
   */
  const report = simulateTournament({
    rounds: 5,
    divisions: RULES.divisions,
    /* 57 players, and every division odd so a bye has to be placed in each, every round. */
    perDivision: { beginner: 21, recreational: 19, advanced: 17 },
    rules: RULES,
    random: seededRandom(20260920),
    withdrawAfterRound: { round: 3, index: 5 },
  });

  it("plays all five rounds", () => {
    expect(report.rounds.map((r) => r.round)).toEqual([1, 2, 3, 4, 5]);
  });

  it("reaches zero on every acceptance target", () => {
    expect(tally(report)).toEqual({});
  });

  it("never puts two categories on one board", () => {
    const mixed = report.rounds.flatMap((r) =>
      r.findings.filter((f) => f.code === "cross-division-pairing"),
    );
    expect(mixed).toEqual([]);
  });

  it("keeps every board inside one category, round by round", () => {
    for (const round of report.rounds) {
      for (const division of RULES.divisions) {
        const boards = round.boards.filter((b) => b.division === division);
        for (const b of boards) {
          expect(b.playerA.startsWith(`sim-${division}-`)).toBe(true);
          if (b.playerB) expect(b.playerB.startsWith(`sim-${division}-`)).toBe(true);
        }
      }
    }
  });

  it("seats every played board at a table of its own", () => {
    for (const round of report.rounds) {
      const tables = round.boards.filter((b) => b.playerB !== null).map((b) => b.board);
      expect(new Set(tables).size).toBe(tables.length);
      expect(tables.every((t) => t > 0)).toBe(true);
    }
  });

  it("produces a separate final ranking for each category", () => {
    expect(Object.keys(report.standings).sort()).toEqual(
      ["advanced", "beginner", "recreational"],
    );
    /* One player withdrew, so one category is one shorter than it started. */
    const total = Object.values(report.standings).reduce((n, ids) => n + ids.length, 0);
    expect(total).toBe(56);

    for (const [division, ids] of Object.entries(report.standings)) {
      expect(ids.every((id) => id.startsWith(`sim-${division}-`))).toBe(true);
    }
  });

  it("played a real tournament and not an empty one", () => {
    expect(report.matches).toBeGreaterThan(120);
    /*
     * Fifteen byes would be three odd divisions across five rounds. There are thirteen,
     * because the withdrawal after round three left that division even — so rounds four and
     * five needed no bye in it at all. The number falling is the withdrawal working.
     */
    expect(report.byes).toBe(13);
  });
});
