import { describe, expect, it } from "vitest";

import {
  summarise,
  validateRoundPlan,
  validateRosterForPairing,
  type ValidatorBoard,
  type ValidatorPlayer,
  type ValidatorRules,
} from "./pairingValidator";

const RULES: ValidatorRules = {
  divisions: ["beginner", "recreational", "advanced"],
  repeatPolicy: "avoid-repeat",
  maxByesPerPlayer: 1,
  crossDivisionPairing: false,
  firstSecondEnabled: false,
};

/** `beginner:4` becomes four active beginners. */
function roster(spec: Record<string, number>): ValidatorPlayer[] {
  const out: ValidatorPlayer[] = [];
  for (const [division, count] of Object.entries(spec)) {
    for (let i = 1; i <= count; i += 1) {
      out.push({ id: `${division}-${i}`, division, active: true });
    }
  }
  return out;
}

/** Pairs a division's players in listed order, seating them from `firstTable`. */
function pairUp(
  players: ValidatorPlayer[],
  division: string,
  firstTable: number,
): ValidatorBoard[] {
  const pool = players.filter((p) => p.division === division && p.active && !p.withdrawn);
  const boards: ValidatorBoard[] = [];
  let table = firstTable;

  for (let i = 0; i + 1 < pool.length; i += 2) {
    boards.push({
      board: table,
      division,
      playerA: pool[i].id,
      playerB: pool[i + 1].id,
    });
    table += 1;
  }

  if (pool.length % 2 === 1) {
    boards.push({ board: 0, division, playerA: pool[pool.length - 1].id, playerB: null });
  }

  return boards;
}

/** A whole valid round across every division, tables numbered without collision. */
function wholeRound(players: ValidatorPlayer[], rules = RULES): ValidatorBoard[] {
  const boards: ValidatorBoard[] = [];
  for (const division of rules.divisions) {
    const next = boards.filter((b) => b.playerB !== null).length + 1;
    boards.push(...pairUp(players, division, next));
  }
  return boards;
}

const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

describe("validateRosterForPairing", () => {
  it("passes a roster where everybody has a category the event runs", () => {
    const out = validateRosterForPairing(roster({ beginner: 4, advanced: 4 }), RULES);
    expect(out.ok).toBe(true);
    expect(out.blocking).toEqual([]);
  });

  it("blocks pairing when a player has no category, and names how many", () => {
    const players = roster({ beginner: 4 });
    players.push({ id: "nobody-1", division: "", active: true });
    players.push({ id: "nobody-2", division: "  ", active: true });

    const out = validateRosterForPairing(players, RULES);
    expect(out.ok).toBe(false);
    expect(codes(out.blocking)).toContain("player-without-division");
    expect(out.blocking[0].message).toContain("2 active players");
    expect(out.blocking[0].playerIds).toEqual(["nobody-1", "nobody-2"]);
  });

  it("ignores a missing category on somebody who is not playing", () => {
    const players = roster({ beginner: 4 });
    players.push({ id: "withdrawn", division: "", active: false, withdrawn: true });

    expect(validateRosterForPairing(players, RULES).ok).toBe(true);
  });

  it("blocks a player filed under a category the event does not run", () => {
    const players = roster({ beginner: 4 });
    players.push({ id: "stray", division: "masters", active: true });

    const out = validateRosterForPairing(players, RULES);
    expect(out.ok).toBe(false);
    expect(codes(out.blocking)).toContain("player-in-unknown-division");
    /* The one failure that is otherwise silent: they appear in no round at all. */
    expect(out.blocking.find((f) => f.code === "player-in-unknown-division")!.message)
      .toContain("left out of every round");
  });

  it("warns rather than blocks when a division holds one player", () => {
    const out = validateRosterForPairing(roster({ beginner: 4, advanced: 1 }), RULES);
    expect(out.ok).toBe(true);
    expect(codes(out.advisory)).toContain("division-of-one");
  });

  it("blocks a roster that holds the same player twice", () => {
    const players = roster({ beginner: 4 });
    players.push({ ...players[0] });

    expect(codes(validateRosterForPairing(players, RULES).blocking))
      .toContain("duplicate-roster-entry");
  });
});

describe("validateRoundPlan — the round the acceptance test asked about", () => {
  it("passes a correctly separated three-division round", () => {
    const players = roster({ beginner: 6, recreational: 4, advanced: 8 });
    const out = validateRoundPlan(wholeRound(players), players, RULES);

    expect(out.ok).toBe(true);
    expect(out.counts.matches).toBe(9);
    expect(out.counts.byes).toBe(0);
    expect(out.counts.accountedFor).toBe(18);
  });

  it("BLOCKS a board that pairs a beginner against an advanced player", () => {
    const players = roster({ beginner: 2, advanced: 2 });
    const boards: ValidatorBoard[] = [
      { board: 1, division: "beginner", playerA: "beginner-1", playerB: "advanced-1" },
      { board: 2, division: "advanced", playerA: "advanced-2", playerB: "beginner-2" },
    ];

    const out = validateRoundPlan(boards, players, RULES);
    expect(out.ok).toBe(false);
    expect(codes(out.blocking).filter((c) => c === "cross-division-pairing")).toHaveLength(2);
    expect(out.blocking[0].message).toContain("Categories play separately");
  });

  it("allows a cross-division board only when the event says so", () => {
    const players = roster({ beginner: 2, advanced: 2 });
    const boards: ValidatorBoard[] = [
      { board: 1, division: "beginner", playerA: "beginner-1", playerB: "advanced-1" },
      { board: 2, division: "advanced", playerA: "advanced-2", playerB: "beginner-2" },
    ];

    const out = validateRoundPlan(boards, players, {
      ...RULES,
      crossDivisionPairing: true,
    });
    expect(codes(out.blocking)).not.toContain("cross-division-pairing");
  });

  it("blocks two correctly paired players filed under the wrong category", () => {
    const players = roster({ beginner: 2, advanced: 2 });
    const boards: ValidatorBoard[] = [
      /* Both beginners, labelled advanced — the table plan would seat them wrongly. */
      { board: 1, division: "advanced", playerA: "beginner-1", playerB: "beginner-2" },
      { board: 2, division: "advanced", playerA: "advanced-1", playerB: "advanced-2" },
    ];

    const out = validateRoundPlan(boards, players, RULES);
    expect(codes(out.blocking)).toContain("board-division-mismatch");
  });

  it("blocks a board filed under a category the event does not run", () => {
    const players = roster({ beginner: 2 });
    const boards: ValidatorBoard[] = [
      { board: 1, division: "beginner", playerA: "beginner-1", playerB: "beginner-2" },
      { board: 2, division: "masters", playerA: "beginner-1", playerB: "beginner-2" },
    ];

    expect(codes(validateRoundPlan(boards, players, RULES).blocking))
      .toContain("board-in-unknown-division");
  });
});

describe("validateRoundPlan — who is on the round", () => {
  it("blocks a player who appears on two boards", () => {
    const players = roster({ beginner: 4 });
    const boards: ValidatorBoard[] = [
      { board: 1, division: "beginner", playerA: "beginner-1", playerB: "beginner-2" },
      { board: 2, division: "beginner", playerA: "beginner-1", playerB: "beginner-3" },
    ];

    const out = validateRoundPlan(boards, players, RULES);
    expect(codes(out.blocking)).toContain("player-twice-in-round");
    expect(out.blocking.find((f) => f.code === "player-twice-in-round")!.boards).toEqual([1, 2]);
  });

  it("blocks a round that leaves a checked-in player out", () => {
    const players = roster({ beginner: 4 });
    const boards: ValidatorBoard[] = [
      { board: 1, division: "beginner", playerA: "beginner-1", playerB: "beginner-2" },
    ];

    const out = validateRoundPlan(boards, players, RULES);
    expect(codes(out.blocking)).toContain("active-player-missing");
    expect(out.counts.accountedFor).toBe(2);
    expect(out.counts.activePlayers).toBe(4);
  });

  it("blocks a player paired against themselves", () => {
    const players = roster({ beginner: 2 });
    const boards: ValidatorBoard[] = [
      { board: 1, division: "beginner", playerA: "beginner-1", playerB: "beginner-1" },
      { board: 2, division: "beginner", playerA: "beginner-2", playerB: null },
    ];

    expect(codes(validateRoundPlan(boards, players, RULES).blocking)).toContain("self-pairing");
  });

  it("blocks a withdrawn player who is still on a board", () => {
    const players = roster({ beginner: 4 });
    players[3] = { ...players[3], active: false, withdrawn: true };
    const boards: ValidatorBoard[] = [
      { board: 1, division: "beginner", playerA: "beginner-1", playerB: "beginner-2" },
      { board: 2, division: "beginner", playerA: "beginner-3", playerB: "beginner-4" },
    ];

    expect(codes(validateRoundPlan(boards, players, RULES).blocking))
      .toContain("withdrawn-player-paired");
  });

  it("blocks somebody on a board who is not on the roster at all", () => {
    const players = roster({ beginner: 2 });
    const boards: ValidatorBoard[] = [
      { board: 1, division: "beginner", playerA: "beginner-1", playerB: "ghost" },
      { board: 2, division: "beginner", playerA: "beginner-2", playerB: null },
    ];

    expect(codes(validateRoundPlan(boards, players, RULES).blocking)).toContain("unknown-player");
  });

  it("refuses an empty round", () => {
    expect(codes(validateRoundPlan([], roster({ beginner: 2 }), RULES).blocking))
      .toContain("empty-round");
  });
});

describe("validateRoundPlan — byes", () => {
  it("accepts one bye in an odd division", () => {
    const players = roster({ beginner: 5 });
    const out = validateRoundPlan(pairUp(players, "beginner", 1), players, RULES);
    expect(out.ok).toBe(true);
    expect(out.counts.byes).toBe(1);
  });

  it("accepts a bye in each of three odd divisions at once", () => {
    /*
     * The shape that used to refuse to publish at all: three odd divisions produce three
     * byes, every one of them carrying board 0, and counting those as tables made the round
     * invalid for a collision that does not exist.
     */
    const players = roster({ beginner: 5, recreational: 7, advanced: 3 });
    const out = validateRoundPlan(wholeRound(players), players, RULES);
    expect(out.ok).toBe(true);
    expect(out.counts.byes).toBe(3);
  });

  it("blocks a bye in an even division", () => {
    const players = roster({ beginner: 4 });
    const boards: ValidatorBoard[] = [
      { board: 1, division: "beginner", playerA: "beginner-1", playerB: "beginner-2" },
      { board: 0, division: "beginner", playerA: "beginner-3", playerB: null },
      { board: 0, division: "beginner", playerA: "beginner-4", playerB: null },
    ];

    const out = validateRoundPlan(boards, players, RULES);
    expect(codes(out.blocking)).toContain("wrong-bye-count");
    expect(out.blocking.find((f) => f.code === "wrong-bye-count")!.message)
      .toContain("It needs 0");
  });

  it("blocks a bye given to somebody who has sat out more than a category-mate", () => {
    /* Four of the five have never had one. Handing it to the fifth again is a selection fault. */
    const players = roster({ beginner: 5 });
    const out = validateRoundPlan(pairUp(players, "beginner", 1), players, RULES, {
      opponents: {},
      byes: { "beginner-5": 1 },
    });

    expect(codes(out.blocking)).toContain("unfair-bye");
    expect(out.blocking.find((f) => f.code === "unfair-bye")!.message)
      .toContain("somebody in the same category has had 0");
  });

  it("reports an unavoidable second bye without blocking the round", () => {
    /*
     * Three players, and all three have already had one. Somebody has to sit out again:
     * there is no fair choice left, only a choice. Refusing to publish here would tell a
     * director their small division is invalid, which is not true.
     */
    const players = roster({ beginner: 3 });
    const out = validateRoundPlan(pairUp(players, "beginner", 1), players, RULES, {
      opponents: {},
      byes: { "beginner-1": 1, "beginner-2": 1, "beginner-3": 1 },
    });

    expect(out.ok).toBe(true);
    expect(codes(out.advisory)).toContain("unavoidable-bye");
    expect(out.advisory.find((f) => f.code === "unavoidable-bye")!.message)
      .toContain("nobody left to give it to");
  });

  it("says an odd division must still seat a bye when the event allows none", () => {
    const players = roster({ beginner: 5 });
    const out = validateRoundPlan(pairUp(players, "beginner", 1), players, {
      ...RULES,
      maxByesPerPlayer: 0,
    });

    expect(out.ok).toBe(true);
    expect(out.advisory.find((f) => f.code === "unavoidable-bye")!.message)
      .toContain("odd number of players");
  });
});

describe("validateRoundPlan — tables", () => {
  it("blocks two games at one table", () => {
    const players = roster({ beginner: 2, advanced: 2 });
    const boards: ValidatorBoard[] = [
      { board: 1, division: "beginner", playerA: "beginner-1", playerB: "beginner-2" },
      { board: 1, division: "advanced", playerA: "advanced-1", playerB: "advanced-2" },
    ];

    const out = validateRoundPlan(boards, players, RULES);
    expect(codes(out.blocking)).toContain("duplicate-table");
    expect(out.blocking.find((f) => f.code === "duplicate-table")!.message)
      .toContain("table 1");
  });

  it("blocks a played board with no usable table number", () => {
    const players = roster({ beginner: 2 });
    const boards: ValidatorBoard[] = [
      { board: 0, division: "beginner", playerA: "beginner-1", playerB: "beginner-2" },
    ];

    expect(codes(validateRoundPlan(boards, players, RULES).blocking)).toContain("invalid-table");
  });
});

describe("validateRoundPlan — repeats and first/second", () => {
  const players = roster({ beginner: 4 });
  const boards: ValidatorBoard[] = [
    { board: 1, division: "beginner", playerA: "beginner-1", playerB: "beginner-2" },
    { board: 2, division: "beginner", playerA: "beginner-3", playerB: "beginner-4" },
  ];
  const met = { opponents: { "beginner-1": ["beginner-2"], "beginner-2": ["beginner-1"] }, byes: {} };

  it("reports a repeat as advisory under avoid-repeat, and still publishes", () => {
    const out = validateRoundPlan(boards, players, RULES, met);
    expect(out.ok).toBe(true);
    expect(codes(out.advisory)).toContain("repeat-opponent");
    expect(out.advisory[0].message).toContain("already played once");
  });

  it("blocks a repeat under strict-no-repeat", () => {
    const out = validateRoundPlan(boards, players, { ...RULES, repeatPolicy: "strict-no-repeat" }, met);
    expect(out.ok).toBe(false);
    expect(codes(out.blocking)).toContain("repeat-opponent");
  });

  it("says nothing about a repeat when the policy is unlimited", () => {
    const out = validateRoundPlan(boards, players, { ...RULES, repeatPolicy: "unlimited" }, met);
    expect(codes(out.advisory)).toContain("repeat-opponent");
    expect(out.ok).toBe(true);
  });

  it("tolerates one repeat but reports the second as over the limit", () => {
    const twice = {
      opponents: {
        "beginner-1": ["beginner-2", "beginner-2"],
        "beginner-2": ["beginner-1", "beginner-1"],
      },
      byes: {},
    };
    const out = validateRoundPlan(boards, players, { ...RULES, repeatPolicy: "allow-one-repeat" }, twice);
    expect(out.findings.find((f) => f.code === "repeat-opponent")!.message)
      .toContain("over this event's limit");
  });

  it("blocks a board with no first/second decision when the event tracks it", () => {
    const out = validateRoundPlan(boards, players, { ...RULES, firstSecondEnabled: true });
    expect(codes(out.blocking)).toContain("first-second-unset");
  });

  it("accepts the same round once first/second is set", () => {
    const decided = boards.map((b) => ({ ...b, aPlaysFirst: true }));
    const out = validateRoundPlan(decided, players, { ...RULES, firstSecondEnabled: true });
    expect(out.ok).toBe(true);
  });
});

describe("summarise", () => {
  it("reads as the preview header the acceptance test asked for", () => {
    const players = roster({ advanced: 18 });
    const out = validateRoundPlan(pairUp(players, "advanced", 1), players, RULES);
    expect(summarise(out)).toBe("18 / 18 players accounted for · 9 matches · 0 blocking problems");
  });

  it("counts the byes and the problems when there are some", () => {
    const players = roster({ beginner: 5 });
    const out = validateRoundPlan(
      [{ board: 1, division: "beginner", playerA: "beginner-1", playerB: "beginner-2" }],
      players,
      RULES,
    );
    expect(summarise(out)).toContain("2 / 5 players accounted for");
    expect(summarise(out)).toContain("blocking problem");
  });
});
