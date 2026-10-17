import { describe, expect, it } from "vitest";

import { ISSUE, canApply, payloadOf, planRound, sameCategory, type ExistingGame } from "./plan";
import type { RosterPlayer } from "./match";
import { parseSource } from "./parse";

const categories = [
  { id: "beginner", name: "Beginner" },
  { id: "advanced", name: "Masters / Advanced" },
];

const roster: RosterPlayer[] = [
  { id: "a1", name: "Ahmed Khan", number: "101", division: "advanced", checkedIn: true },
  { id: "a2", name: "Hammad Ali", number: "102", division: "advanced", checkedIn: true },
  { id: "a3", name: "Sara Khan", number: "103", division: "advanced", checkedIn: true },
  { id: "a4", name: "Bilal Raza", number: "104", division: "advanced", checkedIn: true },
  { id: "b1", name: "Zoya Ali", number: "105", division: "beginner", checkedIn: true },
  { id: "b2", name: "Omar Sheikh", number: "106", division: "beginner", checkedIn: false },
];

const everyone = new Map(
  roster.flatMap((p) => [[p.name.toLowerCase(), p.id] as const]),
);

/** Parses a CSV and resolves every name by exact match, as the screen would. */
function plan(csv: string, over: Partial<Parameters<typeof planRound>[0]> = {}, round = 1) {
  const parsed = parseSource(csv, { defaultRound: round });
  return planRound({
    round,
    matches: parsed.matches,
    resolved: everyone,
    roster,
    categories,
    existing: [],
    ...over,
  });
}

const PAIRINGS = [
  "Table,Division,Player,Opponent",
  "1,Advanced,Ahmed Khan,Hammad Ali",
  "2,Advanced,Sara Khan,Bilal Raza",
].join("\n");

describe("a clean round", () => {
  it("plans every board, with the venue's ids and categories", () => {
    const p = plan(PAIRINGS);
    expect(p.issues.filter((i) => i.blocking)).toEqual([]);
    expect(p.boards).toHaveLength(2);
    expect(p.boards[0]).toMatchObject({ board: 1, division: "advanced", playerA: "a1", playerB: "a2" });
    expect(canApply(p)).toBe(true);
  });

  it("counts what the preview shows", () => {
    expect(plan(PAIRINGS).counts).toMatchObject({ pairings: 2, players: 4, results: 0, pending: 2, tables: 2 });
  });

  it("builds the database payload", () => {
    expect(payloadOf(plan(PAIRINGS))[0]).toEqual({
      board: 1,
      division: "advanced",
      playerA: "a1",
      playerB: "a2",
      aPlaysFirst: null,
      scoreA: null,
      scoreB: null,
    });
  });
});

describe("players the desk has not checked in", () => {
  const csv = "Table,Player,Opponent\n1,Zoya Ali,Omar Sheikh";

  it("block the import, because the venue's desk decides who is here", () => {
    const p = plan(csv);
    expect(p.issues.some((i) => i.code === ISSUE.notCheckedIn && i.blocking && i.overridable)).toBe(true);
    expect(canApply(p)).toBe(false);
  });

  it("may be allowed by an authorised override, and are still reported", () => {
    const p = plan(csv, { options: { allowNotCheckedIn: true } });
    expect(canApply(p)).toBe(true);
    expect(p.issues.some((i) => i.code === ISSUE.notCheckedIn && i.level === "warn")).toBe(true);
  });
});

describe("a player nobody can place", () => {
  it("blocks the import until a person decides", () => {
    const p = plan("Table,Player,Opponent\n1,Ahmed Khan,Mystery Person");
    expect(p.issues.some((i) => i.code === ISSUE.notFound && i.blocking)).toBe(true);
    expect(canApply(p)).toBe(false);
  });

  it("can be left out, which drops only their board", () => {
    const csv = PAIRINGS + "\n3,Advanced,Mystery Person,Hammad Ali";
    const p = plan(csv, { skipped: new Set(["mystery person"]) });
    expect(p.boards).toHaveLength(2);
    expect(p.issues.some((i) => i.code === ISSUE.leftOut)).toBe(true);
    /* Hammad is on table 1 as well, but the left-out board never counted, so he is not twice. */
    expect(p.issues.some((i) => i.code === ISSUE.duplicatePlayer)).toBe(false);
  });
});

describe("a player on two boards", () => {
  it("is a duplicate, named", () => {
    const p = plan(PAIRINGS + "\n3,Advanced,Ahmed Khan,Zoya Ali");
    const dup = p.issues.find((i) => i.code === ISSUE.duplicatePlayer);
    expect(dup?.blocking).toBe(true);
    expect(dup?.message).toContain("Ahmed Khan");
  });
});

describe("categories", () => {
  it("reports a difference but uses the venue's category", () => {
    const p = plan("Table,Division,Player,Opponent\n1,Beginner,Ahmed Khan,Hammad Ali");
    const diff = p.issues.find((i) => i.code === ISSUE.categoryDifference);
    expect(diff).toMatchObject({ level: "warn", blocking: false });
    expect(p.boards[0].division).toBe("advanced");
    expect(canApply(p)).toBe(true);
  });

  it("does not report a difference when the source writes the category differently but means it", () => {
    expect(sameCategory("Advanced", "advanced", categories)).toBe(true);
    expect(sameCategory("masters", "advanced", categories)).toBe(true);
    expect(sameCategory("Beginner", "advanced", categories)).toBe(false);
    expect(sameCategory("", "advanced", categories)).toBe(true);
  });

  it("refuses to seat two players the venue keeps in different categories together", () => {
    const p = plan("Table,Player,Opponent\n1,Ahmed Khan,Zoya Ali");
    expect(p.issues.some((i) => i.code === ISSUE.crossCategory && i.blocking)).toBe(true);
  });
});

describe("tables", () => {
  it("numbers boards in order when the source gives none, and says so", () => {
    const p = plan("Player,Opponent\nAhmed Khan,Hammad Ali\nSara Khan,Bilal Raza");
    expect(p.boards.map((b) => b.board)).toEqual([1, 2]);
    expect(p.issues.some((i) => i.code === ISSUE.tablesNumbered)).toBe(true);
    expect(canApply(p)).toBe(true);
  });

  it("does not hand an automatic number to a table the source already used", () => {
    const p = plan("Table,Player,Opponent\n1,Ahmed Khan,Hammad Ali\n,Sara Khan,Bilal Raza");
    expect(p.boards.map((b) => b.board)).toEqual([1, 2]);
  });

  it("blocks a table given to two boards", () => {
    const p = plan("Table,Player,Opponent\n1,Ahmed Khan,Hammad Ali\n1,Sara Khan,Bilal Raza");
    expect(p.issues.some((i) => i.code === ISSUE.duplicateTable && i.blocking)).toBe(true);
  });
});

describe("results", () => {
  const withScores = [
    "Table,Player,Score,Opponent,Opponent Score",
    "1,Ahmed Khan,421,Hammad Ali,388",
    "2,Sara Khan,300,Bilal Raza,",
  ].join("\n");

  it("carries both scores, and records none for a half-finished board", () => {
    const p = plan(withScores);
    expect(p.boards[0]).toMatchObject({ scoreA: 421, scoreB: 388 });
    expect(p.boards[1]).toMatchObject({ scoreA: null, scoreB: null });
    expect(p.issues.some((i) => i.code === ISSUE.incompleteResult)).toBe(true);
    expect(p.counts).toMatchObject({ results: 1, pending: 1 });
  });

  it("refuses a score below zero", () => {
    const p = plan("Table,Player,Score,Opponent,Opponent Score\n1,Ahmed Khan,-5,Hammad Ali,300");
    expect(p.issues.some((i) => i.code === ISSUE.badScore && i.blocking)).toBe(true);
  });
});

describe("the round before", () => {
  const game = (over: Partial<ExistingGame>): ExistingGame => ({
    round: 1,
    board: 1,
    division: "advanced",
    playerA: "a1",
    playerB: "a2",
    scoreA: 400,
    scoreB: 300,
    status: "verified",
    ...over,
  });

  it("blocks a round whose predecessor has an unverified board", () => {
    const p = plan(PAIRINGS, { existing: [game({ status: "scheduled", scoreA: null, scoreB: null })] }, 2);
    expect(p.issues.some((i) => i.code === ISSUE.previousRound && i.blocking)).toBe(true);
  });

  it("allows it when everything before is verified", () => {
    const p = plan(PAIRINGS, { existing: [game({})] }, 2);
    expect(p.issues.some((i) => i.code === ISSUE.previousRound)).toBe(false);
  });

  it("does not count a bye as an unfinished board", () => {
    const p = plan(PAIRINGS, { existing: [game({ playerB: null, status: "scheduled", scoreA: null })] }, 2);
    expect(p.issues.some((i) => i.code === ISSUE.previousRound)).toBe(false);
  });
});

describe("a round that already exists", () => {
  const published: ExistingGame[] = [
    { round: 1, board: 1, division: "advanced", playerA: "a1", playerB: "a2", scoreA: 421, scoreB: 388, status: "verified" },
    { round: 1, board: 2, division: "advanced", playerA: "a3", playerB: "a4", scoreA: null, scoreB: null, status: "scheduled" },
  ];

  it("accepts the same pairings and a new result for the open board", () => {
    const p = plan(
      "Table,Player,Score,Opponent,Opponent Score\n1,Ahmed Khan,421,Hammad Ali,388\n2,Sara Khan,350,Bilal Raza,300",
      { existing: published },
    );
    expect(p.roundExists).toBe(true);
    expect(p.issues.filter((i) => i.blocking)).toEqual([]);
    expect(p.changes).toEqual([]);
  });

  it("shows a changed official score, old and new, and does not block", () => {
    const p = plan(
      "Table,Player,Score,Opponent,Opponent Score\n1,Ahmed Khan,411,Hammad Ali,398\n2,Sara Khan,,Bilal Raza,",
      { existing: published },
    );
    expect(p.changes).toEqual([
      { board: 1, nameA: "Ahmed Khan", nameB: "Hammad Ali", old: [421, 388], next: [411, 398] },
    ]);
    expect(p.issues.some((i) => i.code === ISSUE.resultChanged)).toBe(true);
    expect(canApply(p)).toBe(true);
  });

  it("reads a change correctly when the source seats the two players the other way round", () => {
    const p = plan("Table,Player,Score,Opponent,Opponent Score\n1,Hammad Ali,398,Ahmed Khan,411", { existing: published });
    expect(p.changes[0]).toMatchObject({ old: [421, 388], next: [411, 398] });
  });

  it("accepts a source that lists only some of the boards, as a results page does", () => {
    const p = plan("Table,Player,Score,Opponent,Opponent Score\n2,Sara Khan,350,Bilal Raza,300", { existing: published });
    expect(p.issues.filter((i) => i.blocking)).toEqual([]);
    expect(p.counts.results).toBe(1);
  });

  it("refuses to re-pair a published round", () => {
    const p = plan("Table,Player,Opponent\n1,Ahmed Khan,Sara Khan\n2,Hammad Ali,Bilal Raza", { existing: published });
    expect(p.issues.some((i) => i.code === ISSUE.roundMismatch && i.blocking)).toBe(true);
  });
});

describe("an empty import", () => {
  it("has nothing to apply", () => {
    const p = plan("Table,Player,Opponent\n1,A,B", { matches: [] });
    expect(canApply(p)).toBe(false);
    expect(p.issues[0].code).toBe(ISSUE.nothing);
  });

  it("says so when every board was left out", () => {
    const p = plan("Table,Player,Opponent\n1,Ahmed Khan,Hammad Ali", { skipped: new Set(["ahmed khan"]) });
    expect(p.issues.find((i) => i.code === ISSUE.nothing)?.message).toBe("Every board was left out.");
  });
});
