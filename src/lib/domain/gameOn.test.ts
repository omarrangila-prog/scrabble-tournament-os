import { describe, expect, it } from "vitest";
import { ParticipationTrack } from "../firebase/schema";
import {
  AFK_DISCOUNT_PERCENT,
  arrivalInstruction,
  countTracks,
  GAME_ON_FEE,
  GameOnRegistration,
  memberFee,
  modulesFor,
  quoteFee,
  validateRegistration,
} from "./gameOn";

describe("fee", () => {
  it("matches the poster", () => {
    expect(GAME_ON_FEE).toBe(1200);
    expect(AFK_DISCOUNT_PERCENT).toBe(10);
  });

  it("computes the verified member fee the poster implies", () => {
    expect(memberFee()).toBe(1080);
  });

  it("charges the full fee to a non-member", () => {
    const q = quoteFee("not-claimed");
    expect(q.payable).toBe(1200);
    expect(q.totalOff).toBe(0);
    expect(q.lines).toHaveLength(1);
  });

  /**
   * The participant must see the price they will pay while deciding, so the
   * discount shows immediately — but marked provisional, because a claimed
   * membership is not a verified one.
   */
  it("shows a claimed discount immediately but marks it provisional", () => {
    const q = quoteFee("discount-requested");
    expect(q.payable).toBe(1080);
    expect(q.awaitingVerification).toBe(true);
    expect(q.lines.find((l) => l.kind === "member")?.provisional).toBe(true);
  });

  it("settles the discount once membership is verified", () => {
    const q = quoteFee("verified");
    expect(q.payable).toBe(1080);
    expect(q.awaitingVerification).toBe(false);
    expect(q.lines.find((l) => l.kind === "member")?.provisional).toBe(false);
  });

  it("charges full price when membership proof is rejected", () => {
    const q = quoteFee("proof-rejected");
    expect(q.payable).toBe(1200);
    expect(q.lines.some((l) => l.kind === "member")).toBe(false);
  });

  it("still needs review while a membership sits in the queue", () => {
    expect(quoteFee("review-required").awaitingVerification).toBe(true);
  });

  it("applies a campaign code alongside the member discount", () => {
    const q = quoteFee("verified", {
      code: "BAITHAK200",
      label: "Baithak regulars",
      percentOff: 0,
      amountOff: 200,
    });
    expect(q.totalOff).toBe(320);
    expect(q.payable).toBe(880);
  });

  /** Compounding would give away less than the organizer intended to offer. */
  it("takes both reductions from the base fee rather than compounding", () => {
    const q = quoteFee("verified", {
      code: "HALF",
      label: "Half price",
      percentOff: 50,
      amountOff: 0,
    });
    expect(q.totalOff).toBe(120 + 600);
    expect(q.payable).toBe(480);
  });

  it("never makes the payable amount negative", () => {
    const q = quoteFee("verified", {
      code: "BIG",
      label: "Oversized",
      percentOff: 0,
      amountOff: 99_999,
    });
    expect(q.payable).toBe(0);
    expect(q.totalOff).toBe(GAME_ON_FEE);
  });

  it("always opens with the registration fee", () => {
    expect(quoteFee("verified").lines[0]).toMatchObject({ kind: "fee", amount: 1200 });
  });
});

describe("modulesFor", () => {
  /** An empty chair at a board stalls a round. */
  it("keeps a board-game attendee out of Scrabble operations", () => {
    const m = modulesFor("board_games");
    expect(m.scrabbleOperations).toBe(false);
    expect(m.boardGameFloor).toBe(true);
  });

  it("keeps a Scrabble entrant out of the board-game floor count", () => {
    const m = modulesFor("speed_scrabble");
    expect(m.scrabbleOperations).toBe(true);
    expect(m.boardGameFloor).toBe(false);
  });

  it("puts someone doing both into both", () => {
    const m = modulesFor("both");
    expect(m.scrabbleOperations).toBe(true);
    expect(m.boardGameFloor).toBe(true);
  });

  it("counts everyone for attendance", () => {
    for (const t of ["board_games", "speed_scrabble", "both"] as ParticipationTrack[]) {
      expect(modulesFor(t).attendance).toBe(true);
    }
  });
});

describe("arrivalInstruction", () => {
  it("sends a board-game attendee to the welcome desk", () => {
    expect(arrivalInstruction("board_games")).toContain("welcome desk");
  });

  it("tells a Scrabble entrant to wait for pairings", () => {
    expect(arrivalInstruction("speed_scrabble")).toContain("pairing");
  });

  /** Pairings are time-bound; the board-game floor is not. */
  it("leads with the instruction that has a deadline for someone doing both", () => {
    expect(arrivalInstruction("both")).toContain("pairing");
  });
});

describe("countTracks", () => {
  const field: ParticipationTrack[] = [
    "board_games",
    "board_games",
    "board_games",
    "speed_scrabble",
    "speed_scrabble",
    "both",
    "both",
  ];

  it("reports the exclusive splits", () => {
    const c = countTracks(field);
    expect(c.boardGamesOnly).toBe(3);
    expect(c.scrabbleOnly).toBe(2);
    expect(c.both).toBe(2);
    expect(c.total).toBe(7);
  });

  /**
   * The operational totals are what a director sets tables out from. Reporting
   * only the exclusive counts would understate the floor by everyone doing both.
   */
  it("counts people doing both into each operational total", () => {
    const c = countTracks(field);
    expect(c.boardGameFloor).toBe(5);
    expect(c.scrabblePool).toBe(4);
  });

  it("handles an event with no registrations", () => {
    expect(countTracks([])).toMatchObject({
      total: 0,
      boardGameFloor: 0,
      scrabblePool: 0,
    });
  });
});

describe("validateRegistration", () => {
  const base: Partial<GameOnRegistration> = {
    track: "board_games",
    fullName: "Hunain Ahmed",
    email: "hunain@example.com",
    mobile: "03001234567",
    city: "Karachi",
    membershipStatus: "not-claimed",
    communicationConsent: true,
  };

  it("accepts a complete board-game registration", () => {
    expect(validateRegistration(base)).toEqual([]);
  });

  it("requires the essentials", () => {
    const problems = validateRegistration({});
    const fields = problems.map((p) => p.field);
    expect(fields).toContain("track");
    expect(fields).toContain("fullName");
    expect(fields).toContain("email");
  });

  /** Nobody should be blocked by a question they were never shown. */
  it("does not demand a Scrabble level from a board-game attendee", () => {
    expect(validateRegistration(base).some((p) => p.field === "requestedLevel")).toBe(false);
  });

  it("requires a Scrabble level from a Scrabble entrant", () => {
    const problems = validateRegistration({ ...base, track: "speed_scrabble" });
    expect(problems.some((p) => p.field === "requestedLevel")).toBe(true);
  });

  it("requires a level from someone doing both", () => {
    const problems = validateRegistration({ ...base, track: "both" });
    expect(problems.some((p) => p.field === "requestedLevel")).toBe(true);
  });

  it("requires a membership number when a discount is claimed", () => {
    const problems = validateRegistration({
      ...base,
      membershipStatus: "discount-requested",
    });
    expect(problems.some((p) => p.field === "membershipNumber")).toBe(true);
  });

  it("does not ask for a membership number from a non-member", () => {
    expect(validateRegistration(base).some((p) => p.field === "membershipNumber")).toBe(false);
  });

  it("explains every problem in the participant's terms", () => {
    for (const p of validateRegistration({})) {
      expect(p.message.length).toBeGreaterThan(0);
      expect(p.message).toMatch(/[.!]$/);
    }
  });
});
