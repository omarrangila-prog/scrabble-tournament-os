import { describe, expect, it } from "vitest";

import {
  assignTables,
  formatTableSpec,
  overlappingTables,
  parseTableSpec,
} from "./tables";

const pair = (division: string, board: number, playerB: string | null = "b") => ({
  division,
  board,
  playerA: "a",
  playerB,
});

describe("parseTableSpec", () => {
  it("reads a range", () => {
    expect(parseTableSpec("1-5")).toEqual([1, 2, 3, 4, 5]);
  });

  it("reads a list of tables that are not consecutive", () => {
    // The reason this exists: venues have pillars, doors, and one table that wobbles.
    expect(parseTableSpec("1, 2, 3, 5, 7, 8")).toEqual([1, 2, 3, 5, 7, 8]);
  });

  it("reads ranges and singles mixed together", () => {
    expect(parseTableSpec("1-3, 7, 9-11")).toEqual([1, 2, 3, 7, 9, 10, 11]);
  });

  it("drops duplicates, because two boards cannot share a table", () => {
    expect(parseTableSpec("1-3, 2, 3, 4")).toEqual([1, 2, 3, 4]);
  });

  it("reads a reversed range as a range", () => {
    expect(parseTableSpec("12-6")).toEqual([6, 7, 8, 9, 10, 11, 12]);
  });

  it("ignores anything that is not a table number", () => {
    /*
     * "-4" is dropped rather than read as table 4. It is either a typo or half a range, and
     * guessing would seat people at a table the organizer never listed — the one outcome
     * this whole module exists to prevent.
     */
    expect(parseTableSpec("1, two, -4, 0, 5")).toEqual([1, 5]);
  });

  it("refuses an absurd range rather than building it", () => {
    // "1-9999" is a typo, and expanding it would hang the settings screen.
    expect(parseTableSpec("1-9999")).toEqual([]);
  });

  it("is empty for empty input", () => {
    expect(parseTableSpec("")).toEqual([]);
    expect(parseTableSpec("   ")).toEqual([]);
  });
});

describe("formatTableSpec", () => {
  it("collapses runs back into ranges", () => {
    expect(formatTableSpec([1, 2, 3, 4, 5])).toBe("1-5");
  });

  it("keeps gaps visible", () => {
    expect(formatTableSpec([1, 2, 3, 7, 9, 10, 11])).toBe("1-3, 7, 9-11");
  });

  it("round-trips whatever the organizer typed", () => {
    const typed = "9-11, 1-3, 7";
    expect(formatTableSpec(parseTableSpec(typed))).toBe("1-3, 7, 9-11");
  });

  it("writes a lone table as itself", () => {
    expect(formatTableSpec([4])).toBe("4");
  });
});

describe("overlappingTables", () => {
  it("finds a table two divisions both claim", () => {
    /*
     * The failure this exists to catch: invisible in the settings, four people at one table
     * in the room.
     */
    const clashes = overlappingTables([
      { division: "beginner", tables: [1, 2, 3, 4, 5, 6] },
      { division: "recreational", tables: [6, 7, 8] },
    ]);
    expect(clashes).toEqual([6]);
  });

  it("is empty when the divisions do not overlap", () => {
    expect(
      overlappingTables([
        { division: "beginner", tables: [1, 2, 3] },
        { division: "recreational", tables: [4, 5] },
      ]),
    ).toEqual([]);
  });
});

describe("assignTables", () => {
  const plan = [
    { division: "beginner", tables: [1, 2, 3, 4, 5] },
    { division: "recreational", tables: [6, 7, 8] },
  ];

  it("seats each division at its own tables", () => {
    const { seated, problems } = assignTables(
      [pair("beginner", 1), pair("beginner", 2), pair("recreational", 3)],
      plan,
    );

    expect(problems).toEqual([]);
    expect(seated.filter((s) => s.division === "beginner").map((s) => s.board)).toEqual([1, 2]);
    // The third pairing was board 3 and belongs at table 6, which is the whole point.
    expect(seated.filter((s) => s.division === "recreational").map((s) => s.board)).toEqual([6]);
  });

  it("gives a bye no table", () => {
    const { seated } = assignTables([pair("beginner", 1), pair("beginner", 2, null)], plan);
    const bye = seated.find((s) => s.playerB === null)!;
    // Untouched: sending somebody with no opponent to a seat is how they end up confused.
    expect(bye.board).toBe(2);
    expect(seated.filter((s) => s.playerB !== null).map((s) => s.board)).toEqual([1]);
  });

  it("reports a division with more pairs than tables instead of inventing one", () => {
    const { problems } = assignTables(
      [pair("recreational", 1), pair("recreational", 2), pair("recreational", 3), pair("recreational", 4)],
      plan,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ division: "recreational", needed: 4, available: 3 });
    expect(problems[0].message).toMatch(/needs 4 tables and has 3/);
  });

  it("says so when a division has no tables at all", () => {
    const { problems } = assignTables([pair("advanced", 1)], plan);
    expect(problems[0].message).toMatch(/No tables are set aside for the advanced division/);
  });

  it("never seats two boards at the same table", () => {
    const { seated } = assignTables(
      [pair("beginner", 1), pair("beginner", 2), pair("recreational", 3), pair("recreational", 4)],
      plan,
    );
    const tables = seated.filter((s) => s.playerB !== null).map((s) => s.board);
    expect(new Set(tables).size).toBe(tables.length);
  });
});
