import { describe, expect, it } from "vitest";

import { runbookFor, type RunbookInput } from "./runbook";

/**
 * A quiet morning: registration closed, nobody here yet, nothing paired.
 * Every test moves one thing from this, so what is being asserted is the thing that moved.
 */
const base: RunbookInput = {
  state: "check-in-open",
  round: 0,
  totalRounds: 5,
  registered: 38,
  checkedIn: 0,
  rosterLocked: false,
  boardsPublished: 0,
  resultsRecorded: 0,
  resultsOutstanding: 0,
  disputes: 0,
  playersWithoutCategory: 0,
};

const at = (over: Partial<RunbookInput> = {}) => runbookFor({ ...base, ...over });

describe("there is always exactly one next thing to do", () => {
  it("gives seven steps, numbered, in the same order every time", () => {
    const book = at();
    expect(book.steps).toHaveLength(7);
    expect(book.steps.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(book.steps.map((s) => s.id)).toEqual([
      "check-in",
      "lock-roster",
      "pair",
      "publish",
      "play",
      "scores",
      "finalize",
    ]);
  });

  it("marks exactly one step as the current one, whatever the state", () => {
    const cases: Partial<RunbookInput>[] = [
      {},
      { checkedIn: 30 },
      { checkedIn: 30, rosterLocked: true },
      { state: "round-published", round: 1, boardsPublished: 12, resultsOutstanding: 12 },
      { state: "result-entry", round: 1, boardsPublished: 12, resultsOutstanding: 4, resultsRecorded: 8 },
      { state: "result-entry", round: 1, boardsPublished: 12, resultsRecorded: 12 },
      { state: "final-review", round: 5, totalRounds: 5 },
      { state: "completed", round: 5, totalRounds: 5 },
    ];

    for (const over of cases) {
      const book = at(over);
      const live = book.steps.filter((s) => s.status === "now" || s.status === "blocked");
      expect(live).toHaveLength(1);
      expect(book.current.id).toBe(live[0].id);
    }
  });

  it("puts the action on the current step and nowhere else", () => {
    const book = at({ checkedIn: 30 });
    const withAction = book.steps.filter((s) => s.action);
    expect(withAction).toHaveLength(1);
    expect(withAction[0].id).toBe(book.current.id);
  });

  it("leaves earlier steps done and later steps quiet", () => {
    const book = at({ state: "result-entry", round: 2, boardsPublished: 12, resultsOutstanding: 3, resultsRecorded: 9 });
    expect(book.current.id).toBe("scores");
    expect(book.steps.slice(0, 5).every((s) => s.status === "done")).toBe(true);
    expect(book.steps[6].status).toBe("later");
  });
});

describe("the morning", () => {
  it("sends an empty room to the check-in desk", () => {
    const book = at();
    expect(book.current.id).toBe("check-in");
    expect(book.status).toBe("Players are arriving.");
    expect(book.current.detail).toBe("0 of 38 arrived · 38 not here yet");
    expect(book.current.action).toEqual({
      kind: "navigate",
      to: "check-in",
      label: "Open the check-in desk",
    });
  });

  it("offers the roster lock once two people are in", () => {
    const book = at({ checkedIn: 2 });
    expect(book.current.id).toBe("lock-roster");
    expect(book.current.action).toEqual({ kind: "lock-roster", label: "Lock 2 players in" });
  });

  it("will not lock a roster of one, and says why", () => {
    /* Reached by state rather than by count, so the step is current and blocked. */
    const book = runbookFor({ ...base, state: "check-in-closed", checkedIn: 1 });
    expect(book.current.id).toBe("lock-roster");
    expect(book.current.status).toBe("blocked");
    expect(book.blocker).toBe("At least two players have to be checked in.");
    /* The action is still useful: go and check somebody in. */
    expect(book.current.action?.kind).toBe("navigate");
  });

  it("counts the people still to arrive, and stops mentioning them once everybody is in", () => {
    expect(at({ checkedIn: 30 }).steps[0].detail).toBe("30 of 38 arrived · 8 not here yet");
    expect(at({ checkedIn: 38 }).steps[0].detail).toBe("38 of 38 arrived");
  });
});

describe("pairing", () => {
  const locked = { checkedIn: 30, rosterLocked: true, state: "check-in-closed" as const };

  it("asks for the pairings once the roster is locked", () => {
    const book = at(locked);
    expect(book.current.id).toBe("pair");
    expect(book.current.action).toEqual({ kind: "pair", label: "Make round 1 pairings" });
    expect(book.status).toBe("Round 1 has not been paired.");
  });

  it("BLOCKS pairing when somebody has no category, and names how many", () => {
    /*
     * The acceptance test's own requirement. A player with no category cannot be placed by
     * any engine, and a round generated in that state leaves them out without saying so.
     */
    const one = at({ ...locked, playersWithoutCategory: 1 });
    expect(one.current.status).toBe("blocked");
    expect(one.blocker).toBe("1 player has no category. Pairing cannot place them.");
    expect(one.current.action?.label).toBe("Assign the missing categories");

    const three = at({ ...locked, playersWithoutCategory: 3 });
    expect(three.blocker).toBe("3 players have no category. Pairing cannot place them.");
  });

  it("moves to publish while the draw is open for review", () => {
    const book = at({ ...locked, pairingPreviewOpen: true });
    expect(book.current.id).toBe("publish");
    expect(book.status).toContain("draw window");
    expect(book.current.detail).toContain("publish from that window");
    /* The preview modal is the action — a runbook button would regenerate the draw. */
    expect(book.current.action).toBeUndefined();
    expect(book.steps.find((s) => s.id === "pair")?.status).toBe("done");
  });

  it("counts the round being prepared, not the one just played", () => {
    const book = at({ ...locked, round: 2 });
    expect(book.current.action?.label).toBe("Make round 3 pairings");
  });
});

describe("the round", () => {
  const published = {
    state: "round-published" as const,
    round: 1,
    boardsPublished: 12,
    resultsOutstanding: 12,
    rosterLocked: true,
    checkedIn: 24,
  };

  it("asks for the clock once the boards are on the wall", () => {
    const book = at(published);
    expect(book.current.id).toBe("play");
    expect(book.current.action).toEqual({ kind: "start-round", label: "Start round 1" });
    expect(book.status).toBe("Round 1 is on the wall. The clock has not started.");
  });

  it("moves to score entry once the round is running", () => {
    const book = at({ ...published, state: "round-active" });
    expect(book.current.id).toBe("scores");
    expect(book.current.action).toEqual({
      kind: "navigate",
      to: "score-entry",
      label: "Enter round 1 scores",
    });
  });

  it("counts the scores in and the scores left", () => {
    const book = at({ ...published, state: "result-entry", resultsRecorded: 9, resultsOutstanding: 3 });
    expect(book.current.detail).toBe("9 of 12 recorded · 3 to go");
    expect(book.status).toBe("Round 1 is being played.");
  });
});

describe("finishing a round", () => {
  const allIn = {
    state: "result-entry" as const,
    round: 1,
    boardsPublished: 12,
    resultsRecorded: 12,
    resultsOutstanding: 0,
    rosterLocked: true,
    checkedIn: 24,
  };

  it("offers the next round once every score is in", () => {
    const book = at(allIn);
    expect(book.current.id).toBe("finalize");
    expect(book.current.status).toBe("now");
    expect(book.current.action).toEqual({
      kind: "next-round",
      label: "Finish round 1 and pair the next",
    });
  });

  it("blocks on missing scores and says how many", () => {
    const book = at({ ...allIn, resultsRecorded: 10, resultsOutstanding: 2 });
    /* Two boards outstanding puts the room back on score entry, not on finalising. */
    expect(book.current.id).toBe("scores");
    expect(book.current.detail).toBe("10 of 12 recorded · 2 to go");
  });

  it("blocks finalising on a disputed result", () => {
    const book = at({ ...allIn, disputes: 1 });
    expect(book.current.id).toBe("finalize");
    expect(book.current.status).toBe("blocked");
    expect(book.blocker).toBe("1 result is disputed and needs a ruling.");
  });

  it("uses the plural when more than one result is disputed", () => {
    const book = at({ ...allIn, disputes: 2 });
    expect(book.blocker).toBe("2 results are disputed and need a ruling.");
    expect(book.current.action?.kind).toBe("navigate");
  });

  it("offers to finish the tournament after the last round", () => {
    const book = at({ ...allIn, round: 5, totalRounds: 5 });
    expect(book.current.action).toEqual({
      kind: "finish-tournament",
      label: "Finish the tournament",
    });
    expect(book.current.detail).toBe("Round 5 of 5 — the last one");
  });
});

describe("after the last round", () => {
  it("says the rounds are played, in final review", () => {
    const book = at({ state: "final-review", round: 5, totalRounds: 5, boardsPublished: 12, resultsRecorded: 12 });
    expect(book.status).toBe("All rounds are played. The results are under final review.");
    expect(book.headline).toBe("Round 5 of 5");
  });

  it("says the tournament is finished", () => {
    const book = at({ state: "completed", round: 5, totalRounds: 5 });
    expect(book.headline).toBe("Tournament complete");
    expect(book.status).toBe("The tournament is finished.");
  });

  it("names the break for what it is", () => {
    const book = at({
      state: "break",
      round: 2,
      totalRounds: 5,
      boardsPublished: 12,
      resultsRecorded: 12,
      rosterLocked: true,
      checkedIn: 24,
    });
    expect(book.status).toBe("The room is on a break.");
  });
});

describe("the headline", () => {
  it("says where the day is before anything is paired", () => {
    expect(at().headline).toBe("Before the first round");
  });

  it("counts the round once one exists", () => {
    expect(at({ round: 3 }).headline).toBe("Round 3 of 5");
  });
});
