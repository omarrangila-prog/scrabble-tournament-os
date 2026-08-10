import { describe, expect, it } from "vitest";

import type { PerformanceRecord } from "./citations";
import { categoryLeaders, leaderLabel } from "./categoryLeaders";

function rec(over: Partial<PerformanceRecord> = {}): PerformanceRecord {
  return {
    playerId: "p",
    playerName: "Player",
    division: "beginner",
    rank: 1,
    fieldSize: 2,
    wins: 1,
    losses: 1,
    draws: 0,
    spread: 50,
    gamesPlayed: 2,
    roundsScheduled: 5,
    ...over,
  };
}

const CATEGORIES = ["advanced", "recreational", "beginner"];

describe("categoryLeaders", () => {
  it("reports a leader per category, not one for the event", () => {
    const records = [
      rec({ playerId: "a1", playerName: "Adv One", division: "advanced", spread: 900 }),
      rec({ playerId: "b1", playerName: "Beg One", division: "beginner", spread: 120 }),
      rec({ playerId: "b2", playerName: "Beg Two", division: "beginner", spread: 40 }),
    ];

    const rows = categoryLeaders(records, CATEGORIES);
    const byCategory = new Map(rows.map((r) => [r.category, r]));

    // The beginner leader is the best beginner, not beaten into nothing by an advanced score.
    expect(byCategory.get("beginner")!.bestSpread.map((l) => l.playerName)).toEqual(["Beg One"]);
    expect(byCategory.get("advanced")!.bestSpread.map((l) => l.playerName)).toEqual(["Adv One"]);
  });

  it("leaves out a category nobody entered", () => {
    const rows = categoryLeaders([rec({ division: "beginner" })], CATEGORIES);

    // Better than a row reading "no leader", which looks like missing data.
    expect(rows.map((r) => r.category)).toEqual(["beginner"]);
  });

  it("leaves out a category where everybody was scheduled but nobody played", () => {
    const rows = categoryLeaders([rec({ division: "advanced", gamesPlayed: 0 })], CATEGORIES);
    expect(rows).toHaveLength(0);
  });

  it("names everybody when a measure is tied", () => {
    const records = [
      rec({ playerId: "x", playerName: "Ayesha", spread: 100 }),
      rec({ playerId: "y", playerName: "Bilal", spread: 100 }),
      rec({ playerId: "z", playerName: "Chand", spread: 20 }),
    ];

    const [row] = categoryLeaders(records, ["beginner"]);
    expect(row!.bestSpread.map((l) => l.playerName).sort()).toEqual(["Ayesha", "Bilal"]);
  });

  it("reports no best margin when every margin is negative", () => {
    /*
     * The least-bad loss is not an achievement. Reporting it as the category's best margin
     * would put a player's name against a prize nobody won.
     */
    const records = [
      rec({ playerId: "x", spread: -40 }),
      rec({ playerId: "y", spread: -300 }),
    ];

    const [row] = categoryLeaders(records, ["beginner"]);
    expect(row!.bestSpread).toEqual([]);
  });

  it("reports the highest game only where one was recorded", () => {
    const withScores = categoryLeaders(
      [rec({ playerId: "x", highestGame: 410 }), rec({ playerId: "y", highestGame: 380 })],
      ["beginner"],
    );
    expect(withScores[0]!.highestGame.map((l) => l.value)).toEqual([410]);

    const withNone = categoryLeaders([rec({ playerId: "x" })], ["beginner"]);
    expect(withNone[0]!.highestGame).toEqual([]);
  });

  it("reports most wins, and nothing when nobody won a game", () => {
    const some = categoryLeaders(
      [rec({ playerId: "x", wins: 3 }), rec({ playerId: "y", wins: 1 })],
      ["beginner"],
    );
    expect(some[0]!.mostWins.map((l) => l.value)).toEqual([3]);

    const none = categoryLeaders([rec({ playerId: "x", wins: 0 })], ["beginner"]);
    expect(none[0]!.mostWins).toEqual([]);
  });

  it("keeps the order the categories were given in", () => {
    const records = CATEGORIES.map((division, i) => rec({ playerId: `p${i}`, division }));
    expect(categoryLeaders(records, CATEGORIES).map((r) => r.category)).toEqual(CATEGORIES);
  });
});

describe("leaderLabel", () => {
  it("names one, two, or counts a crowd", () => {
    const l = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ playerId: `p${i}`, playerName: `P${i}`, value: 1 }));

    expect(leaderLabel([])).toBe("—");
    expect(leaderLabel(l(1))).toBe("P0");
    expect(leaderLabel(l(2))).toBe("P0 and P1");
    expect(leaderLabel(l(3))).toBe("3 players level");
  });
});
