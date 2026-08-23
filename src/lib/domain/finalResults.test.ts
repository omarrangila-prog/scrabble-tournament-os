import { describe, expect, it } from "vitest";

import {
  awardFor,
  divisionName,
  type FinalPlayer,
  ordinal,
  signed,
  superlatives,
} from "./finalResults";

const p = (over: Partial<FinalPlayer> = {}): FinalPlayer => ({
  id: over.id ?? "p1",
  number: "101",
  name: "Test Player",
  email: "t@example.com",
  division: "beginner",
  rank: 5,
  played: 5,
  wins: 2,
  losses: 3,
  draws: 0,
  spread: -40,
  bestScore: 380,
  bestMargin: 20,
  bestAgainst: "Someone",
  ...over,
});

describe("spread reads as a direction", () => {
  it("signs it", () => {
    expect(signed(142)).toBe("+142");
    expect(signed(-87)).toBe("−87");
    expect(signed(0)).toBe("0");
  });
});

describe("superlatives", () => {
  it("keeps every holder of a tie rather than inventing a tiebreak", () => {
    const field = [
      p({ id: "a", bestScore: 512 }),
      p({ id: "b", bestScore: 512 }),
      p({ id: "c", bestScore: 400 }),
    ];
    const s = superlatives(field);
    expect(s.highestScore).toBe(512);
    expect([...s.highestScoreIds].sort()).toEqual(["a", "b"]);
  });

  it("ignores anybody who played nothing", () => {
    const s = superlatives([p({ id: "a", played: 0, bestScore: 999 }), p({ id: "b", bestScore: 300 })]);
    expect(s.highestScore).toBe(300);
  });

  it("reports nothing at all when nobody has played", () => {
    const s = superlatives([p({ played: 0 }), p({ id: "z", played: 0 })]);
    expect(s.highestScore).toBeNull();
    expect(s.highestScoreIds.size).toBe(0);
  });
});

describe("the title each player is given", () => {
  it("names the winner and the runner-up, and nobody below them", () => {
    const field = [p({ id: "a", rank: 1 }), p({ id: "b", rank: 2 }), p({ id: "c", rank: 3 })];
    expect(awardFor(field[0], field).title).toBe("Winner — Beginner");
    expect(awardFor(field[1], field).title).toBe("Runner-up — Beginner");
    expect(awardFor(field[2], field).kind).not.toBe("placement");
  });

  it("says so when somebody won everything", () => {
    const field = [p({ id: "a", rank: 4, played: 5, wins: 5, losses: 0 })];
    expect(awardFor(field[0], field).title).toContain("Unbeaten");
  });

  it("gives everybody else something true rather than nothing", () => {
    const field = [
      p({ id: "a", rank: 9, wins: 1, losses: 4, spread: -200, bestScore: 250, bestMargin: -10 }),
      p({ id: "b", rank: 1, wins: 5, losses: 0, spread: 400, bestScore: 500, bestMargin: 120 }),
    ];
    const award = awardFor(field[0], field);
    /* Their placing is on the wall and in the summary; the certificate says what they did. */
    expect(award.title).toBe("Played 5 games — Beginner");
    expect(award.title).not.toContain("9th");
    expect(award.summary).toContain("Played 5, won 1, lost 4");
    expect(award.summary).toContain("Spread −200");
  });

  it("never claims a superlative that belongs to somebody else", () => {
    const field = [
      p({ id: "a", rank: 2, bestScore: 300, bestMargin: 10, spread: 10 }),
      p({ id: "b", rank: 1, bestScore: 500, bestMargin: 200, spread: 400 }),
    ];
    expect(awardFor(field[0], field).note).toBeNull();
    expect(awardFor(field[1], field).note).toContain("Highest single score");
  });

  it("has something to say to somebody who never played", () => {
    const only = p({ played: 0, wins: 0, losses: 0, spread: 0, bestScore: null, bestMargin: null });
    const award = awardFor(only, [only]);
    expect(award.kind).toBe("participation");
    expect(award.title).toBe("For taking part");
    expect(award.summary).not.toContain("Played 0");
  });

  it("puts the real numbers in the summary, so it can be checked", () => {
    const field = [p({ id: "a", rank: 1, played: 5, wins: 4, losses: 1, spread: 142, bestScore: 421, bestAgainst: "Ahmed Ali" })];
    const award = awardFor(field[0], field);
    expect(award.summary).toBe(
      "Played 5, won 4, lost 1. Spread +142. Best game 421 against Ahmed Ali.",
    );
  });

  it("counts draws only when there were some", () => {
    const drew = p({ id: "a", rank: 4, played: 4, wins: 2, losses: 1, draws: 1 });
    expect(awardFor(drew, [drew]).summary).toContain("drew 1");
    const none = p({ id: "b", rank: 4, played: 4, wins: 2, losses: 2, draws: 0 });
    expect(awardFor(none, [none]).summary).not.toContain("drew");
  });
});

describe("wording", () => {
  it("writes ordinals the way people read them", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st",
    ]);
  });

  it("names divisions properly", () => {
    expect(divisionName("beginner")).toBe("Beginner");
    expect(divisionName("recreational")).toBe("Recreational");
    expect(divisionName("")).toBe("Open");
  });
});

describe("two placings a category, and nothing further down", () => {
  /**
   * This moved about — half the field, then three, then two. Pinned because a placing quietly
   * reappearing is the kind of change nobody notices until certificates have gone out.
   */
  const field = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      p({
        id: `p${i}`,
        number: String(101 + i),
        rank: i + 1,
        played: 3,
        wins: Math.max(0, 3 - i),
        spread: 100 - i * 10,
        bestScore: 400 - i,
        bestMargin: 50 - i,
      }),
    );

  it("names exactly two, however large the category", () => {
    const all = field(49);
    const placements = all.filter((x) => awardFor(x, all).kind === "placement");
    expect(placements).toHaveLength(2);
    expect(placements.map((x) => awardFor(x, all).title)).toEqual([
      "Winner — Beginner",
      "Runner-up — Beginner",
    ]);
  });

  it("gives third place something true rather than a prize", () => {
    const all = field(19);
    const third = awardFor(all[2], all);
    expect(third.kind).not.toBe("placement");
    expect(third.title).not.toContain("Winner");
    expect(third.title).not.toContain("Third place");
  });
});
