import { describe, expect, it } from "vitest";

import { rateCardFrom, rateFor, type RateCard } from "./rateCard";

/** The Cafe Leap event's own advertised rates. */
const CARD: RateCard = {
  regular: 1000,
  psaMember: 800,
  group: 750,
  groupMinimum: 3,
  earlyBird: 700,
  earlyBirdUntil: "2026-09-07",
  currency: "PKR",
};

describe("what one entrant pays", () => {
  it("charges the regular rate when nothing else applies", () => {
    const out = rateFor(CARD, { psaMember: false }, "2026-09-20");
    expect(out.amount).toBe(1000);
    expect(out.label).toBe("Regular");
  });

  it("charges the member rate to a member", () => {
    const out = rateFor(CARD, { psaMember: true }, "2026-09-20");
    expect(out.amount).toBe(800);
    expect(out.label).toBe("PSA member");
  });

  it("charges the group rate from the minimum group size up", () => {
    expect(rateFor(CARD, { psaMember: false, groupSize: 2 }, "2026-09-20").amount).toBe(1000);
    expect(rateFor(CARD, { psaMember: false, groupSize: 3 }, "2026-09-20").amount).toBe(750);
    expect(rateFor(CARD, { psaMember: false, groupSize: 9 }, "2026-09-20").amount).toBe(750);
  });

  /*
   * Somebody can be a member, in a group, and early. Charging them the highest rate they
   * happen to match would be indefensible — nobody advertises four prices meaning that.
   */
  it("charges the cheapest rate when several apply", () => {
    const out = rateFor(CARD, { psaMember: true, groupSize: 4 }, "2026-09-01");
    expect(out.amount).toBe(700);
    expect(out.label).toBe("Early bird");
    expect(out.applicable.map((a) => a.amount)).toEqual([700, 750, 800, 1000]);
  });

  /* "Until the 7th" means the whole of the 7th. A deadline that expires at midnight catches
     out everybody registering that evening. */
  it("includes the whole of the closing day, and nothing after it", () => {
    expect(rateFor(CARD, { psaMember: false }, "2026-09-06").amount).toBe(700);
    expect(rateFor(CARD, { psaMember: false }, "2026-09-07").amount).toBe(700);
    expect(rateFor(CARD, { psaMember: false }, "2026-09-08").amount).toBe(1000);
  });

  it("ignores an early-bird rate with no closing date", () => {
    const noDate: RateCard = { ...CARD, earlyBirdUntil: undefined };
    expect(rateFor(noDate, { psaMember: false }, "2026-09-01").amount).toBe(1000);
  });

  it("offers only the rates the organiser actually set", () => {
    const plain: RateCard = { regular: 1200 };
    const out = rateFor(plain, { psaMember: true, groupSize: 10 }, "2026-01-01");
    expect(out.amount).toBe(1200);
    expect(out.applicable).toHaveLength(1);
  });

  it("never returns a negative fee", () => {
    expect(rateFor({ regular: -50 }, { psaMember: false }, "2026-01-01").amount).toBe(0);
  });
});

describe("reading a rate card off an event", () => {
  it("takes the rates the organiser stored", () => {
    const card = rateCardFrom(
      { rates: { regular: 1000, psaMember: 800, group: 750, earlyBird: 700, earlyBirdUntil: "2026-09-07" }, currency: "PKR" },
      999,
    );
    expect(card.regular).toBe(1000);
    expect(card.psaMember).toBe(800);
    expect(card.earlyBirdUntil).toBe("2026-09-07");
  });

  it("falls back to the event fee when no rate card is set", () => {
    expect(rateCardFrom(undefined, 1250).regular).toBe(1250);
    expect(rateCardFrom({}, 1250).regular).toBe(1250);
  });

  /*
   * A malformed closing date must not become an early-bird rate that never closes, or one
   * that closes at a moment nobody can predict.
   */
  it("ignores a closing date that is not a plain calendar day", () => {
    expect(rateCardFrom({ rates: { earlyBird: 700, earlyBirdUntil: "7th Sep" } }, 1000).earlyBirdUntil)
      .toBeUndefined();
    expect(rateCardFrom({ rates: { earlyBird: 700, earlyBirdUntil: 20260907 } }, 1000).earlyBirdUntil)
      .toBeUndefined();
  });

  it("ignores a rate that is not a usable number", () => {
    const card = rateCardFrom({ rates: { regular: 1000, psaMember: "eight hundred", group: -5 } }, 1000);
    expect(card.psaMember).toBeUndefined();
    expect(card.group).toBeUndefined();
  });
});
