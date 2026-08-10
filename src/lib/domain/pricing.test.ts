import { describe, expect, it } from "vitest";
import {
  cheaperRateHint,
  describeRate,
  priceRegistration,
  Rate,
  RateContext,
  rateAvailability,
  PriceContext,
  PriceRules,
  resolvePrice,
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

/* -------------------------------------------------------------------------- */
/* Priority pricing — the 23 August rules                                      */
/* -------------------------------------------------------------------------- */

/** Exactly as the organizer stated them. */
const AUGUST_23: PriceRules = {
  regular: 1250,
  regularLabel: "Regular registration",
  member: { price: 950, label: "PSA Member" },
  coupons: [
    {
      code: "EARLYBIRD",
      label: "Early Bird",
      price: 800,
      availableUntil: "2026-08-07T23:59:59+05:00",
    },
    { code: "HHS", label: "HHS Promotional Rate", price: 1000 },
  ],
  currency: "PKR",
};

const ctx2 = (over: Partial<PriceContext> = {}): PriceContext => ({
  isMember: false,
  at: "2026-08-07T12:00:00+05:00",
  ...over,
});

describe("resolvePrice", () => {
  it("charges the regular fee with no membership and no code", () => {
    const r = resolvePrice(AUGUST_23, ctx2());
    expect(r.final).toBe(1250);
    expect(r.appliedKind).toBe("regular");
    expect(r.saving).toBe(0);
  });

  it("charges 950 to a PSA member", () => {
    const r = resolvePrice(AUGUST_23, ctx2({ isMember: true }));
    expect(r.final).toBe(950);
    expect(r.appliedLabel).toBe("PSA Member");
    expect(r.saving).toBe(300);
  });

  it("charges 800 with the Early Bird code", () => {
    const r = resolvePrice(AUGUST_23, ctx2({ code: "EARLYBIRD" }));
    expect(r.final).toBe(800);
    expect(r.appliedLabel).toBe("Early Bird");
    expect(r.saving).toBe(450);
  });

  it("charges 1000 with the HHS code", () => {
    const r = resolvePrice(AUGUST_23, ctx2({ code: "HHS" }));
    expect(r.final).toBe(1000);
    expect(r.appliedLabel).toBe("HHS Promotional Rate");
  });

  it("accepts a code in any case, with stray spaces", () => {
    expect(resolvePrice(AUGUST_23, ctx2({ code: "  hhs " })).final).toBe(1000);
  });

  /**
   * The rule that protects the takings. Three reductions on a PKR 1,250 entry
   * could take it near nothing, and the organizer would find out while counting
   * the money.
   */
  describe("never stacks", () => {
    it("gives a PSA member with the Early Bird code one price, not both", () => {
      const r = resolvePrice(AUGUST_23, ctx2({ isMember: true, code: "EARLYBIRD" }));
      expect(r.final).toBe(800);
      // Not 800 - 300, and not 950 - 450.
      expect(r.final).not.toBeLessThan(800);
    });

    it("gives a PSA member with HHS the coupon price, by the stated priority", () => {
      const r = resolvePrice(AUGUST_23, ctx2({ isMember: true, code: "HHS" }));
      expect(r.final).toBe(1000);
      expect(r.appliedKind).toBe("coupon");
    });

    it("never charges less than the cheapest single offer", () => {
      const cheapest = 800;
      for (const isMember of [true, false]) {
        for (const code of [undefined, "EARLYBIRD", "HHS", "nonsense"]) {
          const r = resolvePrice(AUGUST_23, ctx2({ isMember, code }));
          expect(r.final).toBeGreaterThanOrEqual(cheapest);
          expect(r.final).toBeLessThanOrEqual(1250);
        }
      }
    });
  });

  describe("coupon expiry", () => {
    it("accepts Early Bird in the last minute of its day", () => {
      const r = resolvePrice(AUGUST_23, ctx2({ code: "EARLYBIRD", at: "2026-08-07T23:59:00+05:00" }));
      expect(r.final).toBe(800);
    });

    /** An expired code must not quietly become the regular fee with no reason. */
    it("refuses Early Bird the next day and says it has closed", () => {
      const r = resolvePrice(AUGUST_23, ctx2({ code: "EARLYBIRD", at: "2026-08-08T00:01:00+05:00" }));
      expect(r.final).toBe(1250);
      expect(r.coupon.status).toBe("expired");
    });

    it("keeps HHS available with no closing date", () => {
      const r = resolvePrice(AUGUST_23, ctx2({ code: "HHS", at: "2026-08-22T10:00:00+05:00" }));
      expect(r.final).toBe(1000);
    });

    /** Sending someone hunting for a typo that is not there wastes their time. */
    it("distinguishes an expired code from an unrecognised one", () => {
      const expired = resolvePrice(AUGUST_23, ctx2({ code: "EARLYBIRD", at: "2026-08-20T10:00:00+05:00" }));
      const unknown = resolvePrice(AUGUST_23, ctx2({ code: "WRONG" }));
      expect(expired.coupon.status).toBe("expired");
      expect(unknown.coupon.status).toBe("unknown");
    });

    it("falls back to membership when the code is refused", () => {
      const r = resolvePrice(AUGUST_23, ctx2({ isMember: true, code: "WRONG" }));
      expect(r.final).toBe(950);
      expect(r.coupon.status).toBe("unknown");
    });

    it("treats an empty code as no code rather than a bad one", () => {
      expect(resolvePrice(AUGUST_23, ctx2({ code: "   " })).coupon.status).toBe("none");
    });
  });

  it("reports the regular price alongside the final one, for the breakdown", () => {
    const r = resolvePrice(AUGUST_23, ctx2({ isMember: true }));
    expect(r.regular).toBe(1250);
    expect(r.final).toBe(950);
    expect(r.currency).toBe("PKR");
  });
});

/**
 * The figures a registration is stored with.
 *
 * A record has three numbers — fee, reduction, amount owed — and they have to add
 * up. One real registration was stored owing PKR 1,000 with PKR 125 off a PKR 1,250
 * fee, because the amount came from this resolver and the reduction came from an
 * older percentage calculation elsewhere. The money charged was right; the record of
 * why was not, and a reconciliation would never have balanced.
 */
describe("the stored figures reconcile", () => {
  const rules: PriceRules = {
    regular: 1250,
    regularLabel: "Regular registration",
    member: { price: 950, label: "PSA Member" },
    coupons: [{ code: "HHS", label: "HHS Promotional Rate", price: 1000 }],
    currency: "PKR",
  };

  it("balances for the HHS code", () => {
    const priced = resolvePrice(rules, { code: "HHS", isMember: false, at: "2026-08-15T10:00:00+05:00" });

    expect(priced.final).toBe(1000);
    expect(priced.regular).toBe(1250);
    // The number that was wrong: 1250 − 1000 = 250, not 125.
    expect(priced.saving).toBe(250);
    expect(priced.regular - priced.saving).toBe(priced.final);
  });

  it("balances for the member rate", () => {
    const priced = resolvePrice(rules, { isMember: true, at: "2026-08-15T10:00:00+05:00" });

    expect(priced.final).toBe(950);
    expect(priced.saving).toBe(300);
    expect(priced.regular - priced.saving).toBe(priced.final);
  });

  it("records no reduction at the regular price", () => {
    const priced = resolvePrice(rules, { isMember: false, at: "2026-08-15T10:00:00+05:00" });

    expect(priced.final).toBe(1250);
    expect(priced.saving).toBe(0);
    expect(priced.regular - priced.saving).toBe(priced.final);
  });
});
