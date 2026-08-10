import { describe, expect, it } from "vitest";

import type { PerformanceRecord } from "./citations";
import { personalNote, personalNotes } from "./personalNote";

function player(over: Partial<PerformanceRecord> = {}): PerformanceRecord {
  return {
    playerId: "p1",
    playerName: "Ahmed Khan",
    division: "recreational",
    rank: 1,
    fieldSize: 4,
    wins: 2,
    losses: 1,
    draws: 0,
    spread: 60,
    gamesPlayed: 3,
    roundsScheduled: 3,
    ...over,
  };
}

describe("everyone gets a note", () => {
  it("gives a note to every player in the field", () => {
    const field = [
      player({ playerId: "a", rank: 1 }),
      player({ playerId: "b", rank: 2 }),
      player({ playerId: "c", rank: 3 }),
      player({ playerId: "d", rank: 4 }),
    ];

    const notes = personalNotes(field);
    expect(notes.size).toBe(4);
    for (const p of field) expect(notes.get(p.playerId)?.text).toBeTruthy();
  });

  it("gives the player who lost every game something true, not a consolation", () => {
    const loser = player({ playerId: "z", rank: 4, wins: 0, losses: 3, spread: -240 });
    const note = personalNote(loser, [player({ playerId: "a", rank: 1 }), loser]);

    expect(note?.text).toBeTruthy();
    // Nothing claiming quality: there is no figure behind such a claim.
    expect(note!.text).not.toMatch(/excellent|outstanding|brilliant|superb|best/i);
    expect(note!.text).toContain("played");
  });

  it("never says a player won games they did not", () => {
    const loser = player({ playerId: "z", wins: 0, losses: 3, spread: -100, rank: 3 });
    const note = personalNote(loser, [loser]);
    expect(note!.text).not.toMatch(/\bwon\b/);
  });
});

describe("superlatives are checked against the field", () => {
  it("awards the highest game only to the player who actually had it", () => {
    const top = player({ playerId: "top", rank: 1, highestGame: 431 });
    const other = player({ playerId: "other", rank: 2, highestGame: 388 });
    const notes = personalNotes([top, other]);

    expect(notes.get("top")!.text).toContain("highest single game");
    expect(notes.get("other")!.text).not.toContain("highest single game");
  });

  it("softens to \"among the highest\" when two players tie", () => {
    /*
     * Both certificates are read by both people. Neither can be told they alone had the
     * highest game when they scored the same.
     */
    const a = player({ playerId: "a", rank: 1, highestGame: 400, spread: 10 });
    const b = player({ playerId: "b", rank: 2, highestGame: 400, spread: 5 });
    const notes = personalNotes([a, b]);

    for (const id of ["a", "b"]) {
      const text = notes.get(id)!.text;
      if (text.includes("highest")) expect(text).toContain("among the highest");
    }
  });

  it("gives the best margin to one player only", () => {
    const field = [
      player({ playerId: "a", rank: 1, spread: 300, highestGame: 0 }),
      player({ playerId: "b", rank: 2, spread: 120, highestGame: 0 }),
      player({ playerId: "c", rank: 3, spread: -40, highestGame: 0 }),
    ];
    const notes = personalNotes(field);
    const withMargin = field.filter((p) => notes.get(p.playerId)!.text.includes("points margin"));

    expect(withMargin).toHaveLength(1);
    expect(withMargin[0]!.playerId).toBe("a");
  });

  it("does not claim a best margin for a losing record", () => {
    const only = player({ playerId: "a", spread: -200, highestGame: 0 });
    expect(personalNote(only, [only])!.text).not.toContain("margin");
  });
});

describe("notes differ across a division", () => {
  it("does not repeat the same sentence for everyone", () => {
    const field = [
      player({ playerId: "a", rank: 1, wins: 3, losses: 0, spread: 300, highestGame: 455 }),
      player({ playerId: "b", rank: 2, wins: 2, losses: 1, spread: 120, highestGame: 402 }),
      player({ playerId: "c", rank: 3, wins: 1, losses: 2, spread: -60, highestGame: 350 }),
      player({ playerId: "d", rank: 4, wins: 0, losses: 3, spread: -360, highestGame: 300 }),
    ];

    const notes = personalNotes(field);
    const texts = field.map((p) => notes.get(p.playerId)!.text);

    // Precondition: the field really does give four different things to say.
    expect(texts.every(Boolean)).toBe(true);
    expect(new Set(texts).size).toBe(4);
  });

  it("still gives a true note when the only available one is taken", () => {
    // Two identical records: there is one honest thing to say, so both may say it.
    const field = [
      player({ playerId: "a", rank: 1, wins: 0, losses: 2, spread: -100, gamesPlayed: 2, roundsScheduled: 2, highestGame: 0 }),
      player({ playerId: "b", rank: 2, wins: 0, losses: 2, spread: -100, gamesPlayed: 2, roundsScheduled: 2, highestGame: 0 }),
    ];
    const notes = personalNotes(field);

    expect(notes.get("a")!.text).toBeTruthy();
    expect(notes.get("b")!.text).toBeTruthy();
  });
});

describe("unbeaten", () => {
  it("is only claimed with more than one game and no losses", () => {
    const unbeaten = player({ playerId: "u", wins: 3, losses: 0, draws: 0, gamesPlayed: 3 });
    expect(personalNote(unbeaten, [unbeaten])!.text).toContain("unbeaten");
  });

  it("is not claimed off a single game", () => {
    // One win is a win, not an unbeaten run.
    const one = player({ playerId: "u", wins: 1, losses: 0, draws: 0, gamesPlayed: 1, roundsScheduled: 1, highestGame: 0, spread: 0 });
    expect(personalNote(one, [one])!.text).not.toContain("unbeaten");
  });

  it("is not claimed when a game was drawn", () => {
    const drawn = player({ playerId: "u", wins: 2, losses: 0, draws: 1, gamesPlayed: 3 });
    expect(personalNote(drawn, [drawn])!.text).not.toContain("unbeaten");
  });
});

describe("evidence", () => {
  it("carries the figures behind the wording, so a director can check it", () => {
    const top = player({ playerId: "top", highestGame: 431 });
    const note = personalNote(top, [top, player({ playerId: "o", highestGame: 300 })]);
    expect(note!.evidence).toContain("431");
  });
});

describe("superlatives stay inside a category", () => {
  const beginner = (over: Partial<PerformanceRecord>) =>
    player({ division: "beginner", ...over });
  const advanced = (over: Partial<PerformanceRecord>) =>
    player({ division: "advanced", ...over });

  it("does not measure a beginner against the advanced field", () => {
    /*
     * The wording says "in the beginner category", so the comparison has to be the
     * beginner category. Measured across the whole event, a beginner's 300 was called the
     * highest in their category because the advanced players were counted as theirs.
     */
    const field = [
      advanced({ playerId: "adv", rank: 1, highestGame: 520, spread: 400 }),
      beginner({ playerId: "beg", rank: 1, highestGame: 300, spread: 40 }),
    ];

    const note = personalNotes(field).get("beg")!;
    expect(note.text).toContain("beginner category");
    // True within the beginner category, where they are the only player.
    expect(note.text).toContain("highest single game");
  });

  it("gives each category its own highest game", () => {
    const field = [
      beginner({ playerId: "b1", rank: 1, highestGame: 310 }),
      beginner({ playerId: "b2", rank: 2, highestGame: 240 }),
      advanced({ playerId: "a1", rank: 1, highestGame: 505 }),
      advanced({ playerId: "a2", rank: 2, highestGame: 470 }),
    ];
    const notes = personalNotes(field);

    for (const id of ["b1", "a1"]) {
      expect(notes.get(id)!.text).toContain("highest single game");
    }
    for (const id of ["b2", "a2"]) {
      expect(notes.get(id)!.text).not.toContain("highest single game");
    }
  });

  it("gives each category its own best margin", () => {
    const field = [
      beginner({ playerId: "b1", rank: 1, spread: 120, highestGame: 0 }),
      beginner({ playerId: "b2", rank: 2, spread: 30, highestGame: 0 }),
      advanced({ playerId: "a1", rank: 1, spread: 900, highestGame: 0 }),
      advanced({ playerId: "a2", rank: 2, spread: 400, highestGame: 0 }),
    ];
    const notes = personalNotes(field);
    const holders = field
      .filter((p) => notes.get(p.playerId)!.text.includes("points margin"))
      .map((p) => p.playerId);

    // One per category, not one for the whole event.
    expect(holders.sort()).toEqual(["a1", "b1"]);
  });
});
