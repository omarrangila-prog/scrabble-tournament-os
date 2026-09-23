import { describe, expect, it } from "vitest";

import { priceActivity, activityRateAvailability } from "./pricing";
import {
  activityOptionsFrom,
  type ActivityOption,
  type ActivityRate,
} from "./registrationParticipants";

/**
 * The tournament's brackets.
 *
 * Regular, a member price, an early bird, and the price at the door. The last of those is the
 * one worth being careful about: it belongs on the list — it is what makes registering now
 * look cheaper than turning up — and this form must never charge it.
 */

const SCRABBLE: ActivityOption = {
  key: "scrabble",
  label: "Scrabble Tournament",
  rateLabel: "Scrabble",
  price: 1250,
  rates: [
    { id: "regular", label: "Register now & pay cash on site", amount: 1250 },
    { id: "online", label: "Pay online", amount: 1000 },
    { id: "member", label: "PSA member", amount: 950 },
    { id: "early-bird", label: "Early bird", amount: 800, availableUntil: "2026-10-08T23:59:59+05:00" },
    { id: "walk-in", label: "Walk-in, at the door", amount: 1400 },
  ],
};

const BEFORE = "2026-10-01T12:00:00+05:00";
const AFTER = "2026-10-12T12:00:00+05:00";

describe("activityRateAvailability", () => {
  it("never lets this form charge the walk-in price", () => {
    const walkIn = SCRABBLE.rates!.find((r) => r.id === "walk-in")!;
    expect(walkIn.amount).toBe(1400);
    const check = activityRateAvailability(walkIn, { isMember: true, at: BEFORE, payment: "online" });
    expect(check.available).toBe(false);
    expect(check.reason).toMatch(/at the door/i);
  });

  it("holds the member price back until it is claimed", () => {
    const member = SCRABBLE.rates!.find((r) => r.id === "member")!;
    expect(activityRateAvailability(member, { isMember: false, at: BEFORE }).available).toBe(false);
    expect(activityRateAvailability(member, { isMember: true, at: BEFORE }).available).toBe(true);
  });

  it("refuses an early bird with no closing date", () => {
    /* An early bird that never ends is a permanent discount with the wrong name. */
    const undated: ActivityRate = { id: "early-bird", label: "Early bird", amount: 800 };
    expect(undated.availableUntil).toBeUndefined();
    expect(activityRateAvailability(undated, { isMember: false, at: BEFORE }).available).toBe(false);
  });

  it("closes the early bird after its date", () => {
    const early = SCRABBLE.rates!.find((r) => r.id === "early-bird")!;
    expect(activityRateAvailability(early, { isMember: false, at: BEFORE }).available).toBe(true);
    const shut = activityRateAvailability(early, { isMember: false, at: AFTER });
    expect(shut.available).toBe(false);
    expect(shut.reason).toMatch(/closed/i);
  });
});

describe("priceActivity", () => {
  it("charges the full price to somebody paying cash who qualifies for nothing else", () => {
    const priced = priceActivity(SCRABBLE, { isMember: false, at: AFTER, payment: "cash" });
    expect(priced.amount).toBe(1250);
    expect(priced.id).toBe("regular");
    expect(priced.needsCheck).toBe(false);
  });

  it("takes 250 off for paying online now", () => {
    const priced = priceActivity(SCRABBLE, { isMember: false, at: AFTER, payment: "online" });
    expect(priced.amount).toBe(1000);
    expect(priced.id).toBe("online");
  });

  it("does not give the online price to somebody who only promised cash", () => {
    const cash = priceActivity(SCRABBLE, { isMember: false, at: AFTER, payment: "cash" });
    expect(cash.tiers.find((t) => t.rate.id === "online")?.available).toBe(false);
    expect(cash.amount).toBe(1250);
  });

  it("prices at the full rate until the payment question is answered", () => {
    /* Null is not a discount. Somebody who has chosen nothing has earned nothing. */
    const undecided = priceActivity(SCRABBLE, { isMember: false, at: AFTER, payment: null });
    expect(undecided.amount).toBe(1250);
    expect(undecided.id).toBe("regular");
  });

  it("charges a member less, and marks it for the desk to check", () => {
    const priced = priceActivity(SCRABBLE, { isMember: true, at: AFTER, payment: "cash" });
    expect(priced.amount).toBe(950);
    expect(priced.label).toBe("PSA member");
    expect(priced.needsCheck).toBe(true);
  });

  it("gives a member the member price even when paying cash on site", () => {
    const priced = priceActivity(SCRABBLE, { isMember: true, at: AFTER, payment: "cash" });
    expect(priced.amount).toBe(950);
    /* Cheaper than the 1,000 online price, so membership beats paying now. */
    expect(priced.amount).toBeLessThan(1000);
  });

  it("gives the cheapest of the brackets earned, never a stack", () => {
    /* Early, a member, and paying online: qualifies for 1000, 950 and 800 — and pays 800. */
    const priced = priceActivity(SCRABBLE, { isMember: true, at: BEFORE, payment: "online" });
    expect(priced.amount).toBe(800);
    expect(priced.id).toBe("early-bird");
    expect(priced.tiers.filter((t) => t.available).map((t) => t.rate.id).sort()).toEqual([
      "early-bird",
      "member",
      "online",
      "regular",
    ]);
  });

  it("closes the early bird after the 8th and falls back to the next cheapest", () => {
    const early = priceActivity(SCRABBLE, { isMember: true, at: BEFORE, payment: "online" });
    expect(early.amount).toBe(800);
    const late = priceActivity(SCRABBLE, { isMember: true, at: AFTER, payment: "online" });
    expect(late.amount).toBe(950);
  });

  it("never returns the walk-in price, even when it would be the only one left", () => {
    const doorOnly: ActivityOption = {
      ...SCRABBLE,
      price: 1250,
      rates: [{ id: "walk-in", label: "Walk-in", amount: 1400 }],
    };
    const priced = priceActivity(doorOnly, { isMember: true, at: BEFORE, payment: "online" });
    expect(priced.amount).toBe(1250);
    expect(priced.id).toBe("regular");
  });

  it("prices an activity with no brackets at its own price", () => {
    const painting: ActivityOption = {
      key: "painting",
      label: "Painting",
      rateLabel: "Paint",
      price: 1000,
    };
    expect(painting.rates).toBeUndefined();
    const priced = priceActivity(painting, { isMember: true, at: BEFORE, payment: "online" });
    expect(priced.amount).toBe(1000);
    expect(priced.tiers).toHaveLength(1);
  });

  it("reports every bracket, marking the one charged", () => {
    const priced = priceActivity(SCRABBLE, { isMember: true, at: AFTER, payment: "cash" });
    expect(priced.tiers.map((t) => t.rate.id)).toEqual([
      "regular",
      "online",
      "member",
      "early-bird",
      "walk-in",
    ]);
    expect(priced.tiers.filter((t) => t.applied).map((t) => t.rate.id)).toEqual(["member"]);
    /* The walk-in line is present and unavailable — that is the point of it. */
    expect(priced.tiers.find((t) => t.rate.id === "walk-in")?.available).toBe(false);
  });
});

describe("reading the brackets off an event", () => {
  it("keeps the regular price the activity's own, so a card cannot contradict it", () => {
    const [option] = activityOptionsFrom([
      {
        key: "scrabble",
        label: "Scrabble",
        price: 1200,
        rates: [
          { id: "regular", amount: 9999 },
          { id: "member", amount: 950 },
        ],
      },
    ]);
    expect(option.rates?.find((r) => r.id === "regular")?.amount).toBe(1200);
  });

  it("adds the regular bracket when the card forgot it", () => {
    const [option] = activityOptionsFrom([
      { key: "scrabble", label: "Scrabble", price: 1200, rates: [{ id: "member", amount: 950 }] },
    ]);
    expect(option.rates?.map((r) => r.id)).toEqual(["regular", "member"]);
  });

  it("drops a bracket it does not recognise", () => {
    const [option] = activityOptionsFrom([
      {
        key: "scrabble",
        label: "Scrabble",
        price: 1200,
        rates: [{ id: "student", amount: 500 }, { id: "member", amount: 950 }],
      },
    ]);
    expect(option.rates?.map((r) => r.id)).toEqual(["regular", "member"]);
  });

  it("names a bracket the organiser left unlabelled", () => {
    const [option] = activityOptionsFrom([
      { key: "scrabble", label: "Scrabble", price: 1200, rates: [{ id: "walk-in", amount: 1400 }] },
    ]);
    expect(option.rates?.find((r) => r.id === "walk-in")?.label).toBe("Walk-in, at the door");
  });
});
