import { describe, expect, it } from "vitest";
import {
  buildHistory,
  DEFAULT_LOYALTY,
  LoyaltyPolicy,
  loyaltyReward,
  NO_HISTORY,
  NO_REWARD,
  ParticipantHistory,
  priceRegistration,
  summarise,
} from "./loyalty";

const policy = (over: Partial<LoyaltyPolicy> = {}): LoyaltyPolicy => ({
  ...DEFAULT_LOYALTY,
  ...over,
});

const history = (over: Partial<ParticipantHistory> = {}): ParticipantHistory => ({
  ...NO_HISTORY,
  eventsCompleted: 2,
  ...over,
});

describe("buildHistory", () => {
  it("counts only approved entries as participation", () => {
    const h = buildHistory([
      { status: "approved", eventName: "Championship", submittedAt: "2025-11-01" },
      { status: "rejected", eventName: "Spring Open", submittedAt: "2026-01-01" },
      { status: "submitted", eventName: "Summer Cup", submittedAt: "2026-05-01" },
    ]);
    expect(h.eventsCompleted).toBe(1);
  });

  it("names the most recent completed event", () => {
    const h = buildHistory([
      { status: "approved", eventName: "Championship", submittedAt: "2025-11-01" },
      { status: "approved", eventName: "Spring Open", submittedAt: "2026-04-01" },
    ]);
    expect(h.lastEventName).toBe("Spring Open");
  });

  it("reports no history for a first-time entrant", () => {
    expect(buildHistory([]).eventsCompleted).toBe(0);
  });

  it("never carries a negative free-game balance", () => {
    expect(buildHistory([], { freeGameBalance: -5 }).freeGameBalance).toBe(0);
  });
});

describe("loyaltyReward", () => {
  it("gives nothing to a first-time entrant", () => {
    expect(loyaltyReward(policy(), NO_HISTORY, 2000)).toEqual(NO_REWARD);
  });

  it("gives nothing below the minimum event count", () => {
    const p = policy({ minEvents: 3 });
    expect(loyaltyReward(p, history({ eventsCompleted: 2 }), 2000)).toEqual(NO_REWARD);
    expect(loyaltyReward(p, history({ eventsCompleted: 3 }), 2000).amountOff).toBeGreaterThan(0);
  });

  it("gives nothing when the policy is switched off", () => {
    expect(loyaltyReward(policy({ active: false }), history(), 2000)).toEqual(NO_REWARD);
    expect(loyaltyReward(policy({ kind: "none" }), history(), 2000)).toEqual(NO_REWARD);
  });

  it("applies a fixed amount", () => {
    const r = loyaltyReward(policy({ kind: "fixed", value: 300 }), history(), 2000);
    expect(r.amountOff).toBe(300);
  });

  it("applies a percentage of the fee", () => {
    const r = loyaltyReward(
      policy({ kind: "percentage", value: 25, maxPercentOfFee: 0 }),
      history(),
      2000,
    );
    expect(r.amountOff).toBe(500);
  });

  it("makes entry free when the policy says so", () => {
    const r = loyaltyReward(policy({ kind: "free-entry" }), history(), 2000);
    expect(r.amountOff).toBe(2000);
  });

  it("grants free games without touching the fee", () => {
    const r = loyaltyReward(policy({ kind: "free-games", value: 2 }), history(), 2000);
    expect(r.freeGames).toBe(2);
    expect(r.amountOff).toBe(0);
  });

  it("gives a membership discount only to members", () => {
    const p = policy({ kind: "membership", value: 500 });
    expect(loyaltyReward(p, history({ isMember: false }), 2000)).toEqual(NO_REWARD);
    expect(loyaltyReward(p, history({ isMember: true }), 2000).amountOff).toBe(500);
  });

  /** A misconfigured policy must not quietly make entry free. */
  it("caps a reduction at the configured share of the fee", () => {
    const r = loyaltyReward(
      policy({ kind: "fixed", value: 5000, maxPercentOfFee: 50 }),
      history(),
      2000,
    );
    expect(r.amountOff).toBe(1000);
  });

  it("exempts an explicit free entry from the cap", () => {
    const r = loyaltyReward(
      policy({ kind: "free-entry", maxPercentOfFee: 50 }),
      history(),
      2000,
    );
    expect(r.amountOff).toBe(2000);
  });

  it("never exceeds the fee itself", () => {
    const r = loyaltyReward(
      policy({ kind: "fixed", value: 99999, maxPercentOfFee: 0 }),
      history(),
      2000,
    );
    expect(r.amountOff).toBe(2000);
  });

  it("explains why the participant qualified", () => {
    const r = loyaltyReward(policy(), history({ eventsCompleted: 3 }), 2000);
    expect(r.explanation).toContain("3 events");
  });

  it("uses singular wording for a single previous event", () => {
    const r = loyaltyReward(policy(), history({ eventsCompleted: 1 }), 2000);
    expect(r.explanation).toContain("1 event");
    expect(r.explanation).not.toContain("1 events");
  });

  it("marks a reward that the organizer must confirm", () => {
    const r = loyaltyReward(policy({ requiresApproval: true }), history(), 2000);
    expect(r.needsApproval).toBe(true);
  });
});

describe("priceRegistration", () => {
  const loyal = { amountOff: 300, freeGames: 0, explanation: "Returning discount", needsApproval: false };

  it("shows the fee alone when nothing applies", () => {
    const b = priceRegistration(2000, "PKR");
    expect(b.payable).toBe(2000);
    expect(b.totalOff).toBe(0);
    expect(b.lines).toHaveLength(1);
  });

  it("itemises a loyalty reduction", () => {
    const b = priceRegistration(2000, "PKR", loyal);
    expect(b.payable).toBe(1700);
    expect(b.lines[1]).toMatchObject({ amount: -300, kind: "loyalty" });
  });

  it("itemises a campaign code", () => {
    const b = priceRegistration(2000, "PKR", NO_REWARD, {
      code: "BLUFFY1000",
      name: "Launch offer",
      percentOff: 0,
      amountOff: 1000,
    });
    expect(b.payable).toBe(1000);
    expect(b.lines[1].label).toContain("BLUFFY1000");
  });

  /**
   * Both reductions come off the base fee. Compounding would silently give the
   * organizer less discount than they offered, and the participant could not
   * check the arithmetic.
   */
  it("takes both reductions from the base fee rather than compounding", () => {
    const b = priceRegistration(
      2000,
      "PKR",
      { ...loyal, amountOff: 1000, explanation: "50% loyalty" },
      { code: "HALF", name: "Half price", percentOff: 50, amountOff: 0 },
    );
    expect(b.totalOff).toBe(2000);
    expect(b.payable).toBe(0);
  });

  it("never makes the payable amount negative", () => {
    const b = priceRegistration(
      1000,
      "PKR",
      { ...loyal, amountOff: 900 },
      { code: "BIG", name: "Big", percentOff: 0, amountOff: 5000 },
    );
    expect(b.payable).toBe(0);
    expect(b.totalOff).toBe(1000);
  });

  it("carries free games through without affecting the fee", () => {
    const b = priceRegistration(2000, "PKR", {
      amountOff: 0,
      freeGames: 3,
      explanation: "Free games",
      needsApproval: false,
    });
    expect(b.freeGames).toBe(3);
    expect(b.payable).toBe(2000);
  });

  it("flags a reward that is waiting on approval", () => {
    const b = priceRegistration(2000, "PKR", { ...loyal, needsApproval: true });
    expect(b.pendingApproval).toBe(true);
  });

  it("does not flag approval when nothing was reduced", () => {
    const b = priceRegistration(2000, "PKR", {
      amountOff: 0,
      freeGames: 0,
      explanation: "",
      needsApproval: true,
    });
    expect(b.pendingApproval).toBe(false);
  });

  it("always opens with the entry fee", () => {
    expect(priceRegistration(2000, "PKR", loyal).lines[0]).toMatchObject({
      kind: "fee",
      amount: 2000,
    });
  });
});

describe("summarise", () => {
  it("states the amount due when nothing was taken off", () => {
    expect(summarise(priceRegistration(2000, "PKR"))).toBe("PKR 2,000 due.");
  });

  it("states what was saved and what remains", () => {
    const b = priceRegistration(2000, "PKR", {
      amountOff: 300,
      freeGames: 0,
      explanation: "x",
      needsApproval: false,
    });
    expect(summarise(b)).toBe("PKR 300 off — PKR 1,700 due.");
  });
});
