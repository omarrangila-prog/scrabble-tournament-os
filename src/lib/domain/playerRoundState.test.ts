import { describe, expect, it } from "vitest";

import { outcome, roundState, type PlayerRound } from "@/lib/supabase/playerHub";

/**
 * What a player is shown about one of their own boards.
 *
 * The distinction this pins is the one that broke in rehearsal: a submitted score sets the
 * board to `verified` immediately, so the standings can move while the round is still on, but
 * verified is not the same as agreed. Treating it as agreed took the Confirm and Dispute
 * buttons away from the opponent — the one thing they open their phone to do.
 */
const board = (over: Partial<PlayerRound> = {}): PlayerRound => ({
  round: 1,
  board: 5,
  seat: "A",
  opponent: "Someone Else",
  opponentNumber: "156",
  status: "scheduled",
  myScore: null,
  theirScore: null,
  iSubmitted: false,
  confirmed: false,
  isBye: false,
  ...over,
});

describe("what a player sees about their board", () => {
  it("asks for a result on the round being played", () => {
    expect(roundState(board({ round: 2 }), 2)).toBe("live");
  });

  it("locks a round that has not been reached", () => {
    expect(roundState(board({ round: 3 }), 1)).toBe("upcoming");
  });

  it("still asks the opponent to confirm a score the database calls verified", () => {
    /*
     * The precondition, or this passes for the wrong reason: the board really is verified and
     * really is unconfirmed, which is exactly the state a submission leaves it in.
     */
    const submitted = board({ status: "verified", myScore: 385, theirScore: 421, confirmed: false });
    expect(submitted.status).toBe("verified");
    expect(submitted.confirmed).toBe(false);

    expect(roundState(submitted, 1)).toBe("awaiting");
  });

  it("settles only once somebody has agreed", () => {
    expect(roundState(board({ status: "verified", myScore: 421, theirScore: 385, confirmed: true }), 1))
      .toBe("settled");
  });

  it("puts a dispute above everything except a bye", () => {
    const argued = board({ status: "disputed", myScore: 421, theirScore: 385, confirmed: true });
    expect(roundState(argued, 1)).toBe("disputed");
    expect(roundState({ ...argued, isBye: true }, 1)).toBe("bye");
  });

  it("reads the result from the player's own side of the board", () => {
    expect(outcome(board({ myScore: 421, theirScore: 385 }))).toBe("Won");
    expect(outcome(board({ myScore: 385, theirScore: 421 }))).toBe("Lost");
    expect(outcome(board({ myScore: 400, theirScore: 400 }))).toBe("Drew");
    expect(outcome(board())).toBeNull();
  });
});
