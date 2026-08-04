import { describe, expect, it } from "vitest";
import {
  cheaperRateHint,
  describeRate,
  priceRegistration,
  Rate,
  RateContext,
  rateAvailability,
} from "./pricing";

/** The rates the August event actually offers. */
const RATES: Rate[] = [
  { id: "standard", label: "Standard entry", amount: 1250, basis: "Everyone" },
  { id: "member", label: "PSA member", amount: 950, basis: "Members of the Pakistan Scrabble Association" },
  {
    id: "family",
    label: "Family rate",
    amount: 850,
    basis: "Three or more registering together",
    minGroupSize: 3,
  },
  {
    id: "early-bird",
    label: "Early bird",
    amount: 800,
    basis: "Until 9 August",
    availableUntil: "2026-08-09T23:59:59+05:00",
  },
];

const ctx = (over: Partial<RateContext> = {}): RateContext => ({
  isMember: false,
  groupSize: 1,
  at: "2026-08-15T10:00:00+05:00",
  ...over,
});

describe("rateAvailability", () => {
  it("offers the standard rate to everyone", () => {
    expect(rateAvailability(RATES[0], ctx()).available).toBe(true);
  });

  it("withholds the member rate from non-members", () => {
    const r = rateAvailability(RATES[1], ctx({ isMember: false }));
    expect(r.available).toBe(false);
    expect(r.reason).toContain("members only");
  });

  it("offers the member rate to members", () => {
    expect(rateAvailability(RATES[1], ctx({ isMember: true })).available).toBe(true);
  });

  it("needs three people for the family rate", () => {
    expect(rateAvailability(RATES[2], ctx({ groupSize: 2 })).available).toBe(false);
    expect(rateAvailability(RATES[2], ctx({ groupSize: 3 })).available).toBe(true);
  });

  it("closes the early-bird rate after its date", () => {
    expect(
      rateAvailability(RATES[3], ctx({ at: "2026-08-10T00:00:00+05:00" })).available,
    ).toBe(false);
    expect(
      rateAvailability(RATES[3], ctx({ at: "2026-08-08T00:00:00+05:00" })).available,
    ).toBe(true);
  });

  it("always gives a reason", () => {
    for (const rate of RATES) {
      expect(rateAvailability(rate, ctx()).reason.length).toBeGreaterThan(0);
    }
  });
});

describe("priceRegistration", () => {
  it("charges the standard rate to a lone non-member after early bird", () => {
    const r = priceRegistration(RATES, ctx());
    expect(r.perPerson).toBe(1250);
    expect(r.applied.id).toBe("standard");
  });

  it("charges the member rate to a lone member", () => {
    const r = priceRegistration(RATES, ctx({ isMember: true }));
    expect(r.perPerson).toBe(950);
  });

  /**
   * The rule the whole module exists for. Three members registering together
   * qualify for standard, member and family — cumulative application would
   * bring PKR 1,250 down to almost nothing.
   */
  it("applies the cheapest qualifying rate, never several at once", () => {
    const r = priceRegistration(RATES, ctx({ isMember: true, groupSize: 3 }));
    expect(r.perPerson).toBe(850);
    expect(r.qualified.map((x) => x.id)).toEqual(["family", "member", "standard"]);
  });

  it("prefers early bird when it beats every other rate", () => {
    const r = priceRegistration(
      RATES,
      ctx({ isMember: true, groupSize: 3, at: "2026-08-01T00:00:00+05:00" }),
    );
    expect(r.perPerson).toBe(800);
    expect(r.applied.id).toBe("early-bird");
  });

  it("multiplies by the group size", () => {
    const r = priceRegistration(RATES, ctx({ groupSize: 3 }));
    expect(r.perPerson).toBe(850);
    expect(r.total).toBe(2550);
  });

  it("reports the saving against the standard rate", () => {
    expect(priceRegistration(RATES, ctx({ isMember: true })).savedPerPerson).toBe(300);
    expect(priceRegistration(RATES, ctx()).savedPerPerson).toBe(0);
  });

  it("explains why each rate was unavailable", () => {
    const r = priceRegistration(RATES, ctx());
    expect(r.unavailable).toHaveLength(3);
    for (const u of r.unavailable) expect(u.reason.length).toBeGreaterThan(0);
  });

  it("never charges more than the standard rate", () => {
    for (const isMember of [true, false]) {
      for (const groupSize of [1, 2, 3, 10]) {
        const r = priceRegistration(RATES, ctx({ isMember, groupSize }));
        expect(r.perPerson).toBeLessThanOrEqual(1250);
      }
    }
  });

  it("treats a zero group size as one person", () => {
    expect(priceRegistration(RATES, ctx({ groupSize: 0 })).total).toBe(1250);
  });
});

describe("describeRate", () => {
  it("names the rate and the saving", () => {
    const text = describeRate(priceRegistration(RATES, ctx({ isMember: true })));
    expect(text).toContain("PKR 950");
    expect(text).toContain("PSA member");
    expect(text).toContain("saving PKR 300");
  });

  it("omits a saving when paying standard", () => {
    expect(describeRate(priceRegistration(RATES, ctx()))).not.toContain("saving");
  });
});

describe("cheaperRateHint", () => {
  it("tells a lone person what a group would cost", () => {
    const hint = cheaperRateHint(priceRegistration(RATES, ctx()), ctx());
    expect(hint).toContain("3 or more");
    expect(hint).toContain("850");
  });

  /** A rate that has closed cannot be acted on; saying so is a complaint. */
  it("never suggests a rate that has already closed", () => {
    const context = ctx({ at: "2026-08-20T00:00:00+05:00" });
    const hint = cheaperRateHint(priceRegistration(RATES, context), context);
    expect(hint).not.toContain("Early bird");
  });

  it("says nothing when already on the cheapest rate", () => {
    const context = ctx({ isMember: true, groupSize: 3, at: "2026-08-01T00:00:00+05:00" });
    expect(cheaperRateHint(priceRegistration(RATES, context), context)).toBeNull();
  });

  it("mentions membership to a non-member", () => {
    const context = ctx({ groupSize: 3 });
    const hint = cheaperRateHint(priceRegistration(RATES, context), context);
    // Already on the family rate at 850, and member is dearer, so nothing to add.
    expect(hint).toBeNull();
  });
});
