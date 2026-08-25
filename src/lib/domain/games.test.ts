import { describe, expect, it } from "vitest";

import { canAdvanceRound } from "../engine/roundTimer";
import type { DivisionId } from "./types";
import {
  fullRoundProgress,
  latestRound,
  pairingsFromGames,
  roundComplete,
  roundProgress,
  validateBoardPlan,
  type BoardPlan,
  type GameRow,
} from "./games";

function game(over: Partial<GameRow> = {}): GameRow {
  return {
    id: "g-1",
    round: 1,
    board: 1,
    division: "recreational",
    playerA: "a",
    playerB: "b",
    scoreA: null,
    scoreB: null,
    status: "scheduled",
    verifiedBy: null,
    verifiedAt: null,
    note: null,
    ...over,
  };
}

describe("pairingsFromGames", () => {
  it("carries board, round and players through", () => {
    const [p] = pairingsFromGames([game({ round: 2, board: 3 })], "t-1");

    expect(p).toMatchObject({
      id: "g-1",
      tournamentId: "t-1",
      round: 2,
      board: 3,
      playerAId: "a",
      playerBId: "b",
    });
  });

  it("leaves scores undefined for an unplayed game", () => {
    const [p] = pairingsFromGames([game()], "t-1");

    /*
     * The distinction matters: 0 would tell the standings engine the game ended
     * in a draw at zero, which counts as a played game.
     */
    expect(p!.scoreA).toBeUndefined();
    expect(p!.scoreB).toBeUndefined();
  });

  it("carries scores through once played", () => {
    const [p] = pairingsFromGames(
      [game({ scoreA: 412, scoreB: 388, status: "verified" })],
      "t-1",
    );

    expect(p!.scoreA).toBe(412);
    expect(p!.scoreB).toBe(388);
    expect(p!.status).toBe("verified");
  });

  it("keeps a zero score, which is a real result", () => {
    const [p] = pairingsFromGames(
      [game({ scoreA: 0, scoreB: 0, status: "verified" })],
      "t-1",
    );

    // A forfeited game is 0–0 and must not be mistaken for an unplayed one.
    expect(p!.scoreA).toBe(0);
    expect(p!.scoreB).toBe(0);
  });

  it("represents a bye as a null opponent", () => {
    const [p] = pairingsFromGames([game({ playerB: null })], "t-1");
    expect(p!.playerBId).toBeNull();
  });

  it("sorts by round then board", () => {
    const rows = [
      game({ id: "r2b1", round: 2, board: 1 }),
      game({ id: "r1b2", round: 1, board: 2 }),
      game({ id: "r1b1", round: 1, board: 1 }),
    ];

    expect(pairingsFromGames(rows, "t-1").map((p) => p.id)).toEqual([
      "r1b1",
      "r1b2",
      "r2b1",
    ]);
  });

  it("maps a disputed game to awaiting verification rather than dropping it", () => {
    const [p] = pairingsFromGames([game({ status: "disputed" })], "t-1");
    expect(p!.status).toBe("awaiting-verification");
  });

  it("falls back to scheduled for a status it does not know", () => {
    const [p] = pairingsFromGames([game({ status: "nonsense" })], "t-1");
    expect(p!.status).toBe("scheduled");
  });

  it("keeps an unknown division on the board instead of discarding the game", () => {
    const [p] = pairingsFromGames([game({ division: "invented" })], "t-1");
    expect(p!.division).toBe("recreational");
  });
});

describe("roundProgress", () => {
  it("counts played boards against the round's total", () => {
    const rows = [
      game({ id: "1", board: 1, scoreA: 400, scoreB: 350 }),
      game({ id: "2", board: 2 }),
      game({ id: "3", board: 3, scoreA: 380, scoreB: 300 }),
      game({ id: "4", round: 2, board: 1, scoreA: 1, scoreB: 2 }),
    ];

    // Precondition: round 2 has a result, so we know it is being excluded.
    expect(rows.some((r) => r.round === 2 && r.scoreA !== null)).toBe(true);

    expect(roundProgress(rows, 1)).toEqual({
      totalBoards: 3,
      verified: 2,
      outstanding: 1,
      percentComplete: 67,
    });
  });

  it("reports nothing rather than complete for a round with no boards", () => {
    expect(roundProgress([], 1)).toEqual({
      totalBoards: 0,
      verified: 0,
      outstanding: 0,
      percentComplete: 0,
    });
  });

  /*
   * `staff_publish_round` writes a bye with `scoreA: null` — there is no game to score. A
   * round with an odd-sized division has one every round, which is most rounds of most
   * events. Before this counted a missing opponent as resolved, the round could never reach
   * 100%, however many real games were actually verified.
   */
  it("counts a bye as resolved even though it carries no score", () => {
    const rows = [
      game({ id: "1", board: 1, scoreA: 400, scoreB: 350 }),
      game({ id: "2", board: 0, playerB: null, scoreA: null }),
    ];
    // Precondition: the bye genuinely has no score, matching what publish actually writes.
    expect(rows[1].scoreA).toBeNull();

    expect(roundProgress(rows, 1)).toEqual({
      totalBoards: 2,
      verified: 2,
      outstanding: 0,
      percentComplete: 100,
    });
  });
});

describe("latestRound", () => {
  it("is zero before anything is paired", () => {
    expect(latestRound([])).toBe(0);
  });

  it("is the highest round with boards", () => {
    expect(latestRound([game({ round: 1 }), game({ round: 3 }), game({ round: 2 })])).toBe(3);
  });
});

describe("roundComplete", () => {
  it("is false for a round nobody has paired", () => {
    // An empty round is not a finished one.
    expect(roundComplete([], 1)).toBe(false);
  });

  it("is false while a board is outstanding", () => {
    const rows = [
      game({ id: "1", board: 1, scoreA: 400, scoreB: 300 }),
      game({ id: "2", board: 2 }),
    ];
    expect(roundComplete(rows, 1)).toBe(false);
  });

  it("is true once every board has a result", () => {
    const rows = [
      game({ id: "1", board: 1, scoreA: 400, scoreB: 300 }),
      game({ id: "2", board: 2, playerB: null, scoreA: 0 }),
    ];
    expect(roundComplete(rows, 1)).toBe(true);
  });

  /*
   * The test above gives the bye `scoreA: 0`, which is not what publishing actually writes —
   * a bye is stored with `scoreA: null`, same as an unplayed game, and nothing ever fills it
   * in. That gap let this exact bug through once: the fixture looked like it proved a round
   * with a bye could complete, while the real data shape it was never tested against could
   * not.
   */
  it("is true once every board has a result, with a bye stored the way publish actually writes it", () => {
    const rows = [
      game({ id: "1", board: 1, scoreA: 400, scoreB: 300 }),
      game({ id: "2", board: 0, playerB: null, scoreA: null, status: "scheduled" }),
    ];
    expect(roundComplete(rows, 1)).toBe(true);
  });
});

describe("validateBoardPlan", () => {
  const plan = (over: Partial<BoardPlan>[] = []): BoardPlan[] =>
    over.map((o, i) => ({
      board: i + 1,
      division: "recreational",
      playerA: `a${i}`,
      playerB: `b${i}`,
      ...o,
    }));

  it("accepts a clean round", () => {
    expect(validateBoardPlan(plan([{}, {}])).ok).toBe(true);
  });

  it("refuses an empty round", () => {
    const result = validateBoardPlan([]);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("no boards");
  });

  it("catches a duplicated board number", () => {
    const result = validateBoardPlan(plan([{ board: 1 }, { board: 1 }]));
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("twice"))).toBe(true);
  });

  it("catches a player seated at two boards", () => {
    const result = validateBoardPlan([
      { board: 1, division: "recreational", playerA: "x", playerB: "y" },
      { board: 2, division: "recreational", playerA: "x", playerB: "z" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("board 1") && p.includes("board 2"))).toBe(true);
  });

  it("catches a player paired with themselves", () => {
    const result = validateBoardPlan([
      { board: 1, division: "recreational", playerA: "x", playerB: "x" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes("themselves"))).toBe(true);
  });

  it("allows several byes, which are not a double booking", () => {
    const result = validateBoardPlan([
      { board: 1, division: "beginner", playerA: "x", playerB: null },
      { board: 2, division: "advanced", playerA: "y", playerB: null },
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("fullRoundProgress", () => {
  it("counts disputes, which is what blocks the round from closing", () => {
    const rows = [
      game({ id: "1", board: 1, status: "verified", scoreA: 400, scoreB: 350 }),
      game({ id: "2", board: 2, status: "disputed", scoreA: 380, scoreB: 380 }),
      game({ id: "3", board: 3, status: "awaiting-verification", scoreA: 410, scoreB: 300 }),
      game({ id: "4", board: 4, status: "scheduled" }),
    ];

    const p = fullRoundProgress(rows, 1);
    expect(p.totalBoards).toBe(4);
    expect(p.verified).toBe(1);
    expect(p.conflicts).toBe(1);
    expect(p.awaitingConfirmation).toBe(1);
    /* Three boards have a score; only one of them is settled. */
    expect(p.submitted).toBe(3);
    expect(p.outstanding).toBe(1);
    expect(p.complete).toBe(false);
  });

  it("refuses to advance while a board is disputed", () => {
    const rows = [
      game({ id: "1", board: 1, status: "verified", scoreA: 400, scoreB: 350 }),
      game({ id: "2", board: 2, status: "disputed", scoreA: 380, scoreB: 380 }),
    ];

    const p = fullRoundProgress(rows, 1);
    // The precondition the old browser-storage read could never see.
    expect(p.conflicts).toBe(1);
    expect(canAdvanceRound(p).ready).toBe(false);
    expect(canAdvanceRound(p).reason).toMatch(/conflict/i);
  });

  it("is complete, and advanceable, once every board is verified", () => {
    const rows = [
      game({ id: "1", board: 1, status: "verified", scoreA: 400, scoreB: 350 }),
      game({ id: "2", board: 2, status: "verified", scoreA: 300, scoreB: 290 }),
    ];

    const p = fullRoundProgress(rows, 1);
    expect(p.complete).toBe(true);
    expect(p.percentComplete).toBe(100);
    expect(canAdvanceRound(p).ready).toBe(true);
  });

  it("counts only the round asked for", () => {
    const rows = [
      game({ id: "1", round: 1, status: "verified", scoreA: 1, scoreB: 2 }),
      game({ id: "2", round: 2, status: "disputed", scoreA: 3, scoreB: 3 }),
    ];

    expect(fullRoundProgress(rows, 1).conflicts).toBe(0);
    expect(fullRoundProgress(rows, 2).conflicts).toBe(1);
  });

  /*
   * Found by testing Phase 2 against a real scratch event: a division with an odd number of
   * players produces a bye, published with status 'scheduled' and `scoreA: null` — nothing
   * ever moves it to 'verified', since there is no opponent to confirm a result with. Wiring
   * `canAdvanceRound` to an actual disabled button (this phase) would have permanently
   * blocked "Prepare round N+1" on every round with a bye — confirmed against the real,
   * concluded 23 August event's own bye row before this fix, which carries exactly this
   * shape (round 1, board 36, status 'scheduled', both scores null).
   */
  it("treats a bye as settled, so a round is advanceable once every real game is verified", () => {
    const rows = [
      game({ id: "1", board: 1, status: "verified", scoreA: 400, scoreB: 350 }),
      game({ id: "2", board: 2, status: "verified", scoreA: 390, scoreB: 200 }),
      game({ id: "3", board: 0, playerB: null, status: "scheduled", scoreA: null, scoreB: null }),
    ];

    const p = fullRoundProgress(rows, 1);
    expect(p.outstanding).toBe(0);
    expect(p.complete).toBe(true);
    expect(canAdvanceRound(p).ready).toBe(true);
  });

  it("reports no progress, and not completion, for a round with no boards", () => {
    const p = fullRoundProgress([], 1);
    expect(p.totalBoards).toBe(0);
    expect(p.percentComplete).toBe(0);
    expect(p.complete).toBe(false);
  });
});

describe("byes do not occupy a board", () => {
  /**
   * A bye is generated with board 0 — "nowhere" — because the player has no opponent and no
   * table. Counting those as real board numbers made any round with two byes invalid, which
   * is most rounds: it happens whenever two divisions have an odd number of players.
   */
  const bye = (playerA: string): BoardPlan =>
    ({ board: 0, division: "beginner" as DivisionId, playerA, playerB: null });

  it("accepts a round with several byes", () => {
    const plan: BoardPlan[] = [
      { board: 1, division: "beginner" as DivisionId, playerA: "a", playerB: "b" },
      { board: 2, division: "advanced" as DivisionId, playerA: "c", playerB: "d" },
      bye("e"),
      bye("f"),
      bye("g"),
    ];
    /* The precondition: they really do share a board number. */
    expect(plan.filter((p) => p.board === 0)).toHaveLength(3);

    const check = validateBoardPlan(plan);
    expect(check.problems).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it("still refuses two real games at one table", () => {
    const check = validateBoardPlan([
      { board: 4, division: "beginner" as DivisionId, playerA: "a", playerB: "b" },
      { board: 4, division: "beginner" as DivisionId, playerA: "c", playerB: "d" },
    ]);
    expect(check.ok).toBe(false);
    expect(check.problems[0]).toContain("Board 4 appears twice");
  });

  it("still catches a player who is on a board and also has a bye", () => {
    const check = validateBoardPlan([
      { board: 1, division: "beginner" as DivisionId, playerA: "a", playerB: "b" },
      bye("a"),
    ]);
    expect(check.ok).toBe(false);
    expect(check.problems.join(" ")).toContain("A player is on both");
  });
});
