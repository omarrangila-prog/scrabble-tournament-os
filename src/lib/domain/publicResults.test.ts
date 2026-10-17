import { describe, expect, it } from "vitest";

import {
  boardsOf,
  isFinished,
  latestRound,
  outcomeOf,
  pointsLabel,
  recordLabel,
  roundStatus,
  roundsOf,
  signedSpread,
  standingsThrough,
  type PublicGame,
} from "./publicResults";

const game = (over: Partial<PublicGame>): PublicGame => ({
  round: 1,
  board: 1,
  division: "advanced",
  playerA: "Ahmed",
  playerB: "Hammad",
  scoreA: 421,
  scoreB: 388,
  status: "verified",
  aFirst: null,
  ...over,
});

describe("a finished game", () => {
  it("needs a verified status and both scores", () => {
    expect(isFinished(game({}))).toBe(true);
    expect(isFinished(game({ status: "scheduled" }))).toBe(false);
    expect(isFinished(game({ scoreB: null }))).toBe(false);
    expect(isFinished(game({ scoreA: null, scoreB: null }))).toBe(false);
  });

  it("does not wait for a second score on a bye", () => {
    expect(isFinished(game({ playerB: null, scoreB: null, scoreA: 0 }))).toBe(true);
  });
});

describe("standings", () => {
  const games = [
    game({ board: 1, playerA: "Ahmed", playerB: "Hammad", scoreA: 421, scoreB: 388 }),
    game({ board: 2, playerA: "Sara", playerB: "Bilal", scoreA: 350, scoreB: 350 }),
    game({ round: 2, board: 1, playerA: "Ahmed", playerB: "Sara", scoreA: 400, scoreB: 300 }),
    game({ round: 2, board: 2, playerA: "Hammad", playerB: "Bilal", scoreA: 380, scoreB: 410 }),
  ];

  it("ranks by points, then spread", () => {
    const rows = standingsThrough(games, 2, "advanced");
    expect(rows.map((r) => r.name)).toEqual(["Ahmed", "Bilal", "Sara", "Hammad"]);
    expect(rows[0]).toMatchObject({ rank: 1, wins: 2, losses: 0, spread: 133, points: 2 });
  });

  it("counts a draw as half a point", () => {
    const sara = standingsThrough(games, 1, "advanced").find((r) => r.name === "Sara")!;
    expect(sara).toMatchObject({ draws: 1, points: 0.5, spread: 0 });
  });

  it("is worked out through the round asked for, so history is still there", () => {
    const afterOne = standingsThrough(games, 1, "advanced");
    expect(afterOne.find((r) => r.name === "Ahmed")).toMatchObject({ played: 1, spread: 33 });
    expect(standingsThrough(games, 2, "advanced").find((r) => r.name === "Ahmed")?.played).toBe(2);
  });

  it("recalculates from a corrected score", () => {
    const corrected = games.map((g) =>
      g.round === 1 && g.board === 1 ? { ...g, scoreA: 411, scoreB: 398 } : g,
    );
    expect(standingsThrough(corrected, 1, "advanced").find((r) => r.name === "Ahmed")?.spread).toBe(13);
  });

  it("gives two players level on points and spread the same rank", () => {
    const level = [
      game({ board: 1, playerA: "A", playerB: "B", scoreA: 300, scoreB: 300 }),
      game({ board: 2, playerA: "C", playerB: "D", scoreA: 200, scoreB: 100 }),
    ];
    const rows = standingsThrough(level, 1, "advanced");
    const ranks = Object.fromEntries(rows.map((r) => [r.name, r.rank]));
    /* The precondition: A and B really are level on everything the ranking looks at. */
    const [a, b] = [rows.find((r) => r.name === "A")!, rows.find((r) => r.name === "B")!];
    expect([a.points, a.spread]).toEqual([b.points, b.spread]);
    expect(ranks).toMatchObject({ C: 1, A: 2, B: 2, D: 4 });
  });

  it("ignores a board that is not finished", () => {
    const rows = standingsThrough(
      [game({ status: "scheduled", scoreA: null, scoreB: null })],
      1,
      "advanced",
    );
    expect(rows).toEqual([]);
  });

  it("leaves a bye out of the record, as the database does", () => {
    const rows = standingsThrough(
      [game({ playerB: null, scoreB: null, scoreA: 0, playerA: "Lone" })],
      1,
      "advanced",
    );
    expect(rows).toEqual([]);
  });

  it("keeps each category to itself", () => {
    const mixed = [
      game({ division: "advanced", playerA: "A1", playerB: "A2" }),
      game({ division: "beginner", board: 9, playerA: "B1", playerB: "B2" }),
    ];
    expect(standingsThrough(mixed, 1, "beginner").map((r) => r.name).sort()).toEqual(["B1", "B2"]);
    expect(standingsThrough(mixed, 1).map((r) => r.division)).toContain("advanced");
  });
});

describe("rounds", () => {
  const games = [game({ round: 1 }), game({ round: 2, board: 1 }), game({ round: 2, board: 2, status: "scheduled", scoreA: null, scoreB: null })];

  it("lists only rounds that exist, and the latest is current", () => {
    expect(roundsOf(games)).toEqual([1, 2]);
    expect(latestRound(games)).toBe(2);
    expect(latestRound([])).toBe(0);
  });

  it("says how many boards are still waiting", () => {
    expect(roundStatus(games, 2)).toMatchObject({ boards: 2, finished: 1, pending: 1, complete: false });
    expect(roundStatus(games, 1).complete).toBe(true);
  });

  it("does not count a bye as a result somebody is waiting for", () => {
    const withBye = [game({}), game({ board: 2, playerB: null, scoreB: null, scoreA: null, status: "scheduled" })];
    expect(roundStatus(withBye, 1)).toMatchObject({ boards: 1, complete: true });
  });

  it("orders the boards by table", () => {
    const shuffled = [game({ board: 5 }), game({ board: 2 }), game({ board: 9 })];
    expect(boardsOf(shuffled, 1).map((g) => g.board)).toEqual([2, 5, 9]);
  });
});

describe("outcomes", () => {
  it("names the winner and the margin", () => {
    expect(outcomeOf(game({}))).toEqual({ winner: "a", winnerName: "Ahmed", spread: 33 });
    expect(outcomeOf(game({ scoreA: 100, scoreB: 150 }))).toMatchObject({ winner: "b", winnerName: "Hammad", spread: 50 });
  });

  it("calls a tie a draw with no spread", () => {
    expect(outcomeOf(game({ scoreA: 300, scoreB: 300 }))).toEqual({ winner: "draw", winnerName: null, spread: 0 });
  });

  it("has no winner until there is a result", () => {
    expect(outcomeOf(game({ status: "scheduled", scoreA: null, scoreB: null })).winner).toBeNull();
  });
});

describe("labels", () => {
  it("signs the spread", () => {
    expect(signedSpread(214)).toBe("+214");
    expect(signedSpread(-12)).toBe("−12");
    expect(signedSpread(0)).toBe("0");
  });

  it("writes a record with draws only when there are some", () => {
    expect(recordLabel({ wins: 3, losses: 1, draws: 0 })).toBe("3-1");
    expect(recordLabel({ wins: 2, losses: 1, draws: 1 })).toBe("2-1-1");
  });

  it("writes half points plainly", () => {
    expect(pointsLabel(3)).toBe("3");
    expect(pointsLabel(2.5)).toBe("2.5");
  });
});
