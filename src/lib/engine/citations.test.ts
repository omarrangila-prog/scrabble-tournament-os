import { describe, expect, it } from "vitest";
import {
  buildCitation,
  factsFor,
  PerformanceRecord,
  tierFor,
  titlesFor,
  unsupportedClaims,
} from "./citations";

const record = (over: Partial<PerformanceRecord> = {}): PerformanceRecord => ({
  playerId: "p1",
  playerName: "Hunain Ahmed",
  division: "Advanced",
  rank: 5,
  fieldSize: 32,
  wins: 4,
  losses: 3,
  draws: 0,
  spread: 210,
  gamesPlayed: 7,
  roundsScheduled: 7,
  ...over,
});

describe("factsFor", () => {
  it("states a first-place finish", () => {
    const facts = factsFor(record({ rank: 1 }));
    expect(facts[0].phrase).toContain("first place");
    expect(facts[0].evidence).toContain("Rank 1 of 32");
  });

  it("names second and third place by ordinal", () => {
    expect(factsFor(record({ rank: 2 }))[0].phrase).toContain("2nd place");
    expect(factsFor(record({ rank: 3 }))[0].phrase).toContain("3rd place");
  });

  it("recognises a top-quarter finish in a large field", () => {
    const facts = factsFor(record({ rank: 6, fieldSize: 32 }));
    expect(facts.some((f) => f.phrase.includes("top-quarter"))).toBe(true);
  });

  it("does not claim a top-quarter finish in a tiny field", () => {
    const facts = factsFor(record({ rank: 2, fieldSize: 4 }));
    expect(facts.some((f) => f.phrase.includes("top-quarter"))).toBe(false);
  });

  it("spells small win counts as words", () => {
    expect(factsFor(record({ wins: 4 })).some((f) => f.phrase === "four victories")).toBe(true);
  });

  it("uses the singular for a single win", () => {
    expect(factsFor(record({ wins: 1 })).some((f) => f.phrase === "one victory")).toBe(true);
  });

  /** A player who won nothing gets no victory clause, not a softened one. */
  it("makes no claim about victories when there were none", () => {
    const facts = factsFor(record({ wins: 0, losses: 7 }));
    expect(facts.some((f) => f.phrase.includes("victor"))).toBe(false);
  });

  it("recognises an unbeaten record", () => {
    const facts = factsFor(record({ wins: 7, losses: 0, gamesPlayed: 7 }));
    expect(facts.some((f) => f.phrase === "an unbeaten record")).toBe(true);
  });

  it("does not claim positive spread when spread is negative", () => {
    const facts = factsFor(record({ spread: -300 }));
    expect(facts.some((f) => f.phrase.includes("positive spread"))).toBe(false);
  });

  it("quotes a recorded best word", () => {
    const facts = factsFor(record({ bestWord: { word: "quixotry", points: 365 } }));
    expect(facts.some((f) => f.phrase.includes("QUIXOTRY"))).toBe(true);
  });

  it("says nothing about words when none was recorded", () => {
    expect(factsFor(record()).some((f) => f.phrase.includes("play of"))).toBe(false);
  });

  it("recognises a rating gain but not a loss", () => {
    const gained = factsFor(record({ ratingBefore: 1400, ratingAfter: 1460 }));
    expect(gained.some((f) => f.phrase.includes("rating gain of 60"))).toBe(true);

    const lost = factsFor(record({ ratingBefore: 1460, ratingAfter: 1400 }));
    expect(lost.some((f) => f.phrase.includes("rating gain"))).toBe(false);
  });

  it("recognises full attendance only when every round was played", () => {
    expect(
      factsFor(record({ gamesPlayed: 7, roundsScheduled: 7 })).some((f) =>
        f.phrase.includes("every one"),
      ),
    ).toBe(true);
    expect(
      factsFor(record({ gamesPlayed: 5, roundsScheduled: 7 })).some((f) =>
        f.phrase.includes("every one"),
      ),
    ).toBe(false);
  });

  it("ranks the most distinguishing fact first", () => {
    const facts = factsFor(record({ rank: 1, wins: 7, gamesPlayed: 7, losses: 0 }));
    expect(facts[0].phrase).toContain("first place");
  });

  it("attaches checkable evidence to every fact", () => {
    for (const fact of factsFor(record({ rank: 1, bestWord: { word: "zephyr", points: 80 } }))) {
      expect(fact.evidence.length).toBeGreaterThan(0);
    }
  });

  it("produces nothing for a record with no achievements", () => {
    const facts = factsFor(
      record({ rank: 30, fieldSize: 32, wins: 0, spread: -400, gamesPlayed: 3, roundsScheduled: 7 }),
    );
    expect(facts).toEqual([]);
  });
});

describe("titlesFor", () => {
  it("titles a division winner", () => {
    expect(titlesFor(record({ rank: 1 }))[0].title).toBe("Division Champion");
  });

  it("distinguishes a strong debut from a modest one", () => {
    const strong = titlesFor(record({ isDebut: true, wins: 5, gamesPlayed: 7 }));
    expect(strong.some((t) => t.title === "Excellent Tournament Debut")).toBe(true);

    const modest = titlesFor(record({ isDebut: true, wins: 1, gamesPlayed: 7 }));
    expect(modest.some((t) => t.title === "Promising Tournament Debut")).toBe(true);
    expect(modest.some((t) => t.title === "Excellent Tournament Debut")).toBe(false);
  });

  it("recognises a strong spread", () => {
    expect(
      titlesFor(record({ spread: 900 })).some((t) => t.title === "Strong Positive Spread"),
    ).toBe(true);
  });

  it("recognises real improvement only", () => {
    expect(
      titlesFor(record({ ratingBefore: 1400, ratingAfter: 1450 })).some(
        (t) => t.title === "Most Improved",
      ),
    ).toBe(true);
    expect(
      titlesFor(record({ ratingBefore: 1400, ratingAfter: 1405 })).some(
        (t) => t.title === "Most Improved",
      ),
    ).toBe(false);
  });

  /** An honest plain title beats a flattering invention. */
  it("falls back to plain participation when nothing stands out", () => {
    const titles = titlesFor(
      record({ rank: 30, fieldSize: 32, wins: 0, spread: -500, gamesPlayed: 3, roundsScheduled: 7 }),
    );
    expect(titles).toHaveLength(1);
    expect(titles[0].title).toBe("Certificate of Participation");
  });

  it("gives every title the figure that earned it", () => {
    for (const title of titlesFor(record({ rank: 1, spread: 900 }))) {
      expect(title.basis.length).toBeGreaterThan(0);
    }
  });
});

describe("buildCitation", () => {
  it("names the participant and what they did", () => {
    const c = buildCitation(record({ rank: 1, wins: 7, gamesPlayed: 7, losses: 0 }), "champion");
    expect(c.text).toContain("Hunain Ahmed");
    expect(c.text).toContain("first place");
  });

  /** The platform records nobody's pronouns; guessing would misgender people. */
  it("uses the name rather than a pronoun", () => {
    const c = buildCitation(record(), "participation");
    expect(c.text).not.toMatch(/\b(his|her|their|he|she|they)\b/i);
  });

  it("keeps a citation to at most three clauses", () => {
    const c = buildCitation(
      record({
        rank: 1,
        wins: 7,
        losses: 0,
        gamesPlayed: 7,
        spread: 900,
        bestWord: { word: "quartz", points: 120 },
        highestGame: 600,
        ratingBefore: 1400,
        ratingAfter: 1500,
      }),
      "champion",
    );
    // Commas plus one "and" join at most three clauses.
    expect((c.text.match(/,/g) ?? []).length).toBeLessThanOrEqual(2);
  });

  it("falls back to a plain participation sentence with no facts", () => {
    const c = buildCitation(
      record({ rank: 30, fieldSize: 32, wins: 0, spread: -400, gamesPlayed: 2, roundsScheduled: 7 }),
      "participation",
    );
    expect(c.text).toContain("participation");
    expect(c.evidence.length).toBeGreaterThan(0);
  });

  it("carries the evidence for every clause it prints", () => {
    const c = buildCitation(record({ rank: 1, wins: 6, gamesPlayed: 7 }), "champion");
    expect(c.evidence.length).toBeGreaterThan(0);
  });

  it("awards rather than presents a placement certificate", () => {
    expect(buildCitation(record({ rank: 1 }), "champion").text.startsWith("Awarded")).toBe(true);
    expect(buildCitation(record(), "participation").text.startsWith("Presented")).toBe(true);
  });
});

describe("tierFor", () => {
  it("maps the podium and everyone else", () => {
    expect(tierFor(record({ rank: 1 }))).toBe("champion");
    expect(tierFor(record({ rank: 2 }))).toBe("runner-up");
    expect(tierFor(record({ rank: 3 }))).toBe("third");
    expect(tierFor(record({ rank: 4 }))).toBe("participation");
  });
});

describe("unsupportedClaims", () => {
  it("passes wording the record supports", () => {
    expect(
      unsupportedClaims("Awarded to Hunain Ahmed in recognition of first place.", record({ rank: 1 })),
    ).toEqual([]);
  });

  /** A director may edit wording by hand; the organization still signs it. */
  it("catches a superlative no figure backs", () => {
    const problems = unsupportedClaims(
      "Presented to Hunain Ahmed, an outstanding competitor.",
      record({ rank: 18, fieldSize: 32 }),
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toContain("18th of 32");
  });

  it("allows a superlative when a high score backs it", () => {
    expect(
      unsupportedClaims("A player of the highest calibre.", record({ rank: 18, highestGame: 620 })),
    ).toEqual([]);
  });

  it("catches unbeaten when there were losses", () => {
    const problems = unsupportedClaims("An unbeaten run.", record({ losses: 3 }));
    expect(problems[0]).toContain("3 losses");
  });

  it("catches champion when the player did not win", () => {
    const problems = unsupportedClaims("Division champion.", record({ rank: 4 }));
    expect(problems[0]).toContain("4th");
  });

  it("allows champion for an actual winner", () => {
    expect(unsupportedClaims("Division champion.", record({ rank: 1 }))).toEqual([]);
  });

  it("uses the singular for one loss", () => {
    expect(unsupportedClaims("Undefeated.", record({ losses: 1 }))[0]).toContain("1 recorded");
  });
});
