import { describe, expect, it } from "vitest";

import {
  EMPTY_ENTRY,
  MAX_TEAM_SIZE,
  MIN_TEAM_SIZE,
  PICTIONARY_FEE,
  entryReady,
  namedPlayers,
  pictionaryProblems,
  placesLeft,
  problemFor,
  teamLine,
  teamTotal,
  type PictionaryEntry,
} from "./pictionary";

const OPTIONS = { termsOffered: true };
const RECEIPT = new File(["x"], "receipt.png", { type: "image/png" });

/** A complete, valid team, so each test can break exactly one thing. */
const team = (over: Partial<PictionaryEntry> = {}): PictionaryEntry => ({
  ...EMPTY_ENTRY,
  teamName: "Chalk Dust",
  players: ["Ayesha Khan", "Sana Khan", "Hamza Khan", ""],
  captainPhone: "03001234567",
  payment: "online",
  proofFile: RECEIPT,
  termsAccepted: true,
  ...over,
});

describe("what a team costs", () => {
  it("is the fee for each named player", () => {
    expect(teamTotal(1, 1400)).toBe(1400);
    expect(teamTotal(3, 1400)).toBe(4200);
    expect(teamTotal(4, PICTIONARY_FEE)).toBe(5600);
  });

  it("is never negative", () => {
    expect(teamTotal(-2, 1400)).toBe(0);
  });

  it("counts only players who were actually named", () => {
    const players = ["  Ayesha   Khan ", "", "Sana", "   "];
    expect(namedPlayers({ players })).toEqual(["Ayesha Khan", "Sana"]);
  });
});

describe("a valid team", () => {
  it("passes with three of four places filled", () => {
    expect(pictionaryProblems(team(), OPTIONS)).toEqual([]);
    expect(entryReady(team(), OPTIONS)).toBe(true);
  });

  it("passes at the smallest and the largest size", () => {
    expect(entryReady(team({ players: ["A One", "B Two"] }), OPTIONS)).toBe(
      true,
    );
    expect(
      entryReady(
        team({ players: ["A One", "B Two", "C Three", "D Four"] }),
        OPTIONS,
      ),
    ).toBe(true);
    expect(MIN_TEAM_SIZE).toBe(2);
    expect(MAX_TEAM_SIZE).toBe(4);
  });

  it("does not need a receipt when paying cash", () => {
    expect(
      entryReady(team({ payment: "cash", proofFile: null }), OPTIONS),
    ).toBe(true);
  });
});

describe("what is missing", () => {
  it("needs a team name", () => {
    const p = pictionaryProblems(team({ teamName: " " }), OPTIONS);
    expect(problemFor(p, "teamName")).toMatch(/team a name/i);
  });

  it("needs the captain's name, which is the first row", () => {
    const p = pictionaryProblems(
      team({ players: ["", "Sana Khan", "Hamza Khan"] }),
      OPTIONS,
    );
    expect(problemFor(p, "captain")).toMatch(/captain/i);
  });

  it("needs at least two players", () => {
    const p = pictionaryProblems(
      team({ players: ["Ayesha Khan", "", "", ""] }),
      OPTIONS,
    );
    expect(problemFor(p, "players")).toMatch(/at least 2/);
  });

  it("refuses more than the event's team size", () => {
    const five = ["A One", "B Two", "C Three", "D Four", "E Five"];
    expect(
      problemFor(
        pictionaryProblems(team({ players: five }), OPTIONS),
        "players",
      ),
    ).toMatch(/at most 4/);
    /* An event that allows six takes the same five. */
    expect(
      entryReady(team({ players: five }), { ...OPTIONS, maxSize: 6 }),
    ).toBe(true);
  });

  it("refuses the same person twice, however it is typed", () => {
    const p = pictionaryProblems(
      team({ players: ["Ayesha Khan", "ayesha  khan"] }),
      OPTIONS,
    );
    expect(problemFor(p, "players")).toMatch(/own name/i);
  });

  it("needs a captain's mobile number", () => {
    expect(
      problemFor(
        pictionaryProblems(team({ captainPhone: "0300" }), OPTIONS),
        "phone",
      ),
    ).toBeTruthy();
    expect(entryReady(team({ captainPhone: "+92 300 1234567" }), OPTIONS)).toBe(
      true,
    );
  });

  it("needs a receipt when paying online, and only then", () => {
    const p = pictionaryProblems(team({ proofFile: null }), OPTIONS);
    expect(problemFor(p, "proof")).toMatch(/payment proof/i);
  });

  it("needs the terms ticked when there are terms to tick", () => {
    expect(
      problemFor(
        pictionaryProblems(team({ termsAccepted: false }), OPTIONS),
        "terms",
      ),
    ).toBeTruthy();
  });

  it("does not trap the form when the event has no terms", () => {
    const noTerms = { termsOffered: false };
    expect(entryReady(team({ termsAccepted: false }), noTerms)).toBe(true);
  });

  it("reports every problem at once", () => {
    const p = pictionaryProblems(EMPTY_ENTRY, OPTIONS);
    const fields = p.map((x) => x.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        "teamName",
        "captain",
        "players",
        "phone",
        "proof",
        "terms",
      ]),
    );
  });
});

describe("reading a team back", () => {
  it("makes one line for a list", () => {
    expect(
      teamLine({ teamName: "Chalk Dust", players: ["Ayesha", "Sana"] }),
    ).toBe("Chalk Dust — Ayesha, Sana (2 players)");
    expect(teamLine({ teamName: "Solo", players: ["Ayesha"] })).toBe(
      "Solo — Ayesha (1 player)",
    );
  });

  it("counts the places left", () => {
    expect(placesLeft(3, 8)).toBe(5);
    expect(placesLeft(8, 8)).toBe(0);
    expect(placesLeft(9, 8)).toBe(0);
    expect(placesLeft(null, 8)).toBeNull();
  });
});
