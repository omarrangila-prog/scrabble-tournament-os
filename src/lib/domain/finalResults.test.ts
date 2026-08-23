import { describe, expect, it } from "vitest";

import {
  awardFor,
  divisionName,
  type FinalPlayer,
  ordinal,
  signed,
  superlatives,
  winnersIn,
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
  it("names the top three by place and division", () => {
    const field = [p({ id: "a", rank: 1 }), p({ id: "b", rank: 2 }), p({ id: "c", rank: 3 })];
    expect(awardFor(field[0], field).title).toBe("Champion — Beginner");
    expect(awardFor(field[1], field).title).toBe("Runner-up — Beginner");
    expect(awardFor(field[2], field).title).toBe("Third place — Beginner");
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

describe("half of each category wins", () => {
  /**
   * The organizer's rule: take the number of people in a category and divide by two. It is a
   * rule about the room rather than the game — at an event this young, half the field going
   * home with something recognised is the point.
   */
  const field = (count: number, division = "beginner") =>
    Array.from({ length: count }, (_, i) =>
      p({
        id: `p${i}`,
        number: String(101 + i),
        division,
        rank: i + 1,
        played: 3,
        wins: Math.max(0, 3 - i),
        spread: 100 - i * 10,
        bestScore: 400 - i,
        bestMargin: 50 - i,
      }),
    );

  it("rounds down, so the winners can never be more than half", () => {
    expect(winnersIn(49)).toBe(24);
    expect(winnersIn(19)).toBe(9);
    expect(winnersIn(14)).toBe(7);
    expect(winnersIn(2)).toBe(1);
  });

  it("still recognises somebody in a category of one", () => {
    /* Floor would give zero winners, which would leave the only player with nothing. */
    expect(winnersIn(1)).toBe(1);
  });

  it("names the top three and calls the rest of the half winners", () => {
    const all = field(19);
    const titles = all.map((x) => awardFor(x, all).title);

    expect(titles[0]).toBe("Champion — Beginner");
    expect(titles[1]).toBe("Runner-up — Beginner");
    expect(titles[2]).toBe("Third place — Beginner");
    expect(titles[3]).toBe("Winner — Beginner");
    /* Nine winners in a field of nineteen: ranks one to nine. */
    expect(titles[8]).toBe("Winner — Beginner");
    expect(titles[9]).not.toContain("Winner");
  });

  it("counts only the people who actually played", () => {
    /*
     * The precondition: a prize list built from the registration list would award somebody
     * who never sat down, so the half is taken from those with games.
     */
    const played = field(8);
    const absent = Array.from({ length: 12 }, (_, i) =>
      p({ id: `a${i}`, number: String(200 + i), rank: 99, played: 0, wins: 0, losses: 0 }),
    );
    const all = [...played, ...absent];

    expect(all).toHaveLength(20);
    /* Four winners, from the eight who played — not ten from the twenty entered. */
    expect(awardFor(played[3], all).title).toBe("Winner — Beginner");
    expect(awardFor(played[4], all).title).not.toContain("Winner");
  });

  it("keeps a superlative rather than replacing it with the generic line", () => {
    const all = field(19);
    const award = awardFor(all[3], all);
    expect(award.title).toBe("Winner — Beginner");
    expect(award.note).toBeTruthy();
  });

  it("tells somebody outside the half what they did, not where they came", () => {
    const all = field(19);
    const award = awardFor(all[15], all);
    expect(award.title).toContain("Played");
    expect(award.title).not.toContain("Winner");
  });
});
