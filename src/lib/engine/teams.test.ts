import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEAM_RULES,
  pointsPerGame,
  Team,
  TeamGame,
  teamMatches,
  teamStandings,
  validateTeams,
} from "./teams";

const teams: Team[] = [
  { id: "t1", eventId: "ev", name: "Alpha School", shortName: "ALP", memberIds: ["p1", "p2"] },
  { id: "t2", eventId: "ev", name: "Beta School", shortName: "BET", memberIds: ["p3", "p4"] },
];

/** Builds the two mirrored rows a board produces in the official record. */
function board(
  round: number,
  boardNo: number,
  a: string,
  b: string,
  aScore: number,
  bScore: number,
  verified = true,
): TeamGame[] {
  return [
    { round, board: boardNo, playerId: a, opponentId: b, playerScore: aScore, opponentScore: bScore, verified },
    { round, board: boardNo, playerId: b, opponentId: a, playerScore: bScore, opponentScore: aScore, verified },
  ];
}

describe("teamStandings", () => {
  it("derives wins and points from verified games", () => {
    const games = [...board(1, 1, "p1", "p3", 400, 350), ...board(1, 2, "p2", "p4", 300, 380)];
    const s = teamStandings(teams, games);
    const alpha = s.find((x) => x.teamId === "t1")!;
    const beta = s.find((x) => x.teamId === "t2")!;

    expect(alpha.wins).toBe(1);
    expect(alpha.losses).toBe(1);
    expect(alpha.points).toBe(1);
    expect(beta.points).toBe(1);
    expect(alpha.spread).toBe(50 - 80);
  });

  it("ignores unverified games but reports them", () => {
    const games = [...board(1, 1, "p1", "p3", 500, 100, false)];
    const s = teamStandings(teams, games);
    const alpha = s.find((x) => x.teamId === "t1")!;
    expect(alpha.played).toBe(0);
    expect(alpha.spread).toBe(0);
    expect(alpha.unverifiedGames).toBe(1);
  });

  it("excludes games between two members of the same team", () => {
    const games = board(1, 1, "p1", "p2", 400, 300);
    const s = teamStandings(teams, games);
    expect(s.find((x) => x.teamId === "t1")!.played).toBe(0);
  });

  it("awards draw points to both sides", () => {
    const games = board(1, 1, "p1", "p3", 400, 400);
    const s = teamStandings(teams, games);
    expect(s.find((x) => x.teamId === "t1")!.points).toBe(0.5);
    expect(s.find((x) => x.teamId === "t2")!.points).toBe(0.5);
    expect(s.find((x) => x.teamId === "t1")!.draws).toBe(1);
  });

  it("caps how much one blowout adds to spread", () => {
    const games = board(1, 1, "p1", "p3", 700, 100);
    const s = teamStandings(teams, games, { ...DEFAULT_TEAM_RULES, spreadCapPerGame: 200 });
    expect(s.find((x) => x.teamId === "t1")!.spread).toBe(200);
    expect(s.find((x) => x.teamId === "t2")!.spread).toBe(-200);
  });

  it("leaves spread uncapped when the cap is zero", () => {
    const games = board(1, 1, "p1", "p3", 700, 100);
    const s = teamStandings(teams, games);
    expect(s.find((x) => x.teamId === "t1")!.spread).toBe(600);
  });

  /**
   * Alpha and Beta both finish on 2 points, so the tie-break decides.
   * Alpha won the head-to-head; Beta has by far the better spread.
   *
   *   R1 b1  Alpha p1 400–390 Beta p3    Alpha +10   (head-to-head)
   *   R2 b1  Beta  p3 500–100 Gamma p5   Beta  +400
   *   R2 b2  Alpha p1 410–400 Gamma p6   Alpha +10
   *   R3 b1  Beta  p4 420–410 Gamma p5   Beta  +10
   *
   *   Alpha: 2 points, spread +20
   *   Beta:  2 points, spread +400
   */
  const tieBreakTeams: Team[] = [
    ...teams,
    { id: "t3", eventId: "ev", name: "Gamma", shortName: "GAM", memberIds: ["p5", "p6"] },
  ];
  const tieBreakGames = [
    ...board(1, 1, "p1", "p3", 400, 390),
    ...board(2, 1, "p3", "p5", 500, 100),
    ...board(2, 2, "p1", "p6", 410, 400),
    ...board(3, 1, "p4", "p5", 420, 410),
  ];

  it("breaks a points tie on head-to-head before spread by default", () => {
    const s = teamStandings(tieBreakTeams, tieBreakGames);
    const alpha = s.find((x) => x.teamId === "t1")!;
    const beta = s.find((x) => x.teamId === "t2")!;

    // The tie is real, and Beta holds the better spread.
    expect(alpha.points).toBe(beta.points);
    expect(beta.spread).toBeGreaterThan(alpha.spread);

    // Alpha still leads, on the head-to-head result.
    expect(s[0].teamId).toBe("t1");
  });

  it("can be configured to break ties on spread first", () => {
    const s = teamStandings(tieBreakTeams, tieBreakGames, {
      ...DEFAULT_TEAM_RULES,
      spreadBeforeHeadToHead: true,
    });
    expect(s[0].teamId).toBe("t2");
  });

  it("gives identical records the same rank and skips the next", () => {
    const three: Team[] = [
      ...teams,
      { id: "t3", eventId: "ev", name: "Gamma", shortName: "GAM", memberIds: ["p5"] },
    ];
    const s = teamStandings(three, []);
    expect(s.map((x) => x.rank)).toEqual([1, 1, 1]);
  });

  it("ignores games by players on no team", () => {
    const games = board(1, 1, "unknown-a", "unknown-b", 400, 300);
    const s = teamStandings(teams, games);
    expect(s.every((x) => x.played === 0)).toBe(true);
  });

  it("returns a row for every team even with no games", () => {
    expect(teamStandings(teams, [])).toHaveLength(2);
  });
});

describe("teamMatches", () => {
  it("builds one match per pair of teams, with each board once", () => {
    const games = [...board(1, 1, "p1", "p3", 400, 350), ...board(1, 2, "p2", "p4", 300, 380)];
    const m = teamMatches(teams, games, 1);
    expect(m).toHaveLength(1);
    expect(m[0].boards).toHaveLength(2);
  });

  it("reports pending while any board is unverified", () => {
    const games = [
      ...board(1, 1, "p1", "p3", 400, 350),
      ...board(1, 2, "p2", "p4", 500, 100, false),
    ];
    const m = teamMatches(teams, games, 1);
    expect(m[0].settled).toBe(false);
    expect(m[0].result).toBe("pending");
  });

  it("names the winner once every board is verified", () => {
    const games = [...board(1, 1, "p1", "p3", 400, 350), ...board(1, 2, "p2", "p4", 410, 400)];
    const m = teamMatches(teams, games, 1);
    expect(m[0].settled).toBe(true);
    expect(m[0].result).toBe(m[0].homeId === "t1" ? "home" : "away");
  });

  it("breaks a tied match on spread", () => {
    const games = [...board(1, 1, "p1", "p3", 500, 300), ...board(1, 2, "p2", "p4", 350, 360)];
    const m = teamMatches(teams, games, 1);
    // Alpha 1 point, Beta 1 point; Alpha spread +190.
    expect(m[0].result).toBe(m[0].homeId === "t1" ? "home" : "away");
  });

  it("calls a match with equal points and zero spread a draw", () => {
    const games = [...board(1, 1, "p1", "p3", 400, 300), ...board(1, 2, "p2", "p4", 300, 400)];
    const m = teamMatches(teams, games, 1);
    expect(m[0].result).toBe("draw");
  });

  it("only includes the requested round", () => {
    const games = [...board(1, 1, "p1", "p3", 400, 350), ...board(2, 1, "p1", "p3", 400, 350)];
    expect(teamMatches(teams, games, 2)[0].boards).toHaveLength(1);
  });

  it("ignores intra-team boards", () => {
    expect(teamMatches(teams, board(1, 1, "p1", "p2", 400, 300), 1)).toEqual([]);
  });
});

describe("validateTeams", () => {
  const ids = ["p1", "p2", "p3", "p4"];

  it("accepts a clean setup", () => {
    expect(validateTeams(teams, ids)).toEqual([]);
  });

  it("errors when a player is on two teams", () => {
    const bad: Team[] = [
      teams[0],
      { ...teams[1], memberIds: ["p1", "p4"] },
    ];
    const issues = validateTeams(bad, ids);
    expect(issues.some((i) => i.severity === "error" && i.message.includes("more than one team"))).toBe(true);
  });

  it("errors on an empty team", () => {
    const issues = validateTeams([{ ...teams[0], memberIds: [] }], ids);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("no players");
  });

  it("warns rather than errors on uneven squads", () => {
    const uneven: Team[] = [teams[0], { ...teams[1], memberIds: ["p3"] }];
    const issues = validateTeams(uneven, ids);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].message).toContain("squad sizes");
  });

  it("warns about a member who is not registered", () => {
    const issues = validateTeams([{ ...teams[0], memberIds: ["p1", "ghost"] }], ids);
    expect(issues.some((i) => i.message.includes("not registered"))).toBe(true);
  });
});

describe("pointsPerGame", () => {
  it("normalises for squad size", () => {
    const s = teamStandings(teams, [
      ...board(1, 1, "p1", "p3", 400, 300),
      ...board(1, 2, "p2", "p4", 400, 300),
    ]);
    expect(pointsPerGame(s.find((x) => x.teamId === "t1")!)).toBe(1);
    expect(pointsPerGame(s.find((x) => x.teamId === "t2")!)).toBe(0);
  });

  it("is zero rather than NaN with no games", () => {
    expect(pointsPerGame(teamStandings(teams, [])[0])).toBe(0);
  });
});
