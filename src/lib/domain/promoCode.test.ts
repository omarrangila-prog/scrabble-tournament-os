import { describe, expect, it } from "vitest";

import { applyPromo, priceActivity, promoCodesFrom, resolvePromo } from "./pricing";
import type { ActivityOption } from "./registrationParticipants";

/**
 * Promo codes.
 *
 * A code decides money from a box anybody can type into, so the tests that matter are the
 * ones about refusing: an unknown code, an expired one, and a percentage that would pay
 * somebody to enter.
 */

const CODES = promoCodesFrom([
  { code: "KSA18", percentOff: 30 },
  { code: "CLOSED", percentOff: 50, availableUntil: "2026-09-01T23:59:59+05:00" },
]);

const NOW = "2026-10-01T12:00:00+05:00";

const SCRABBLE: ActivityOption = {
  key: "scrabble",
  label: "Scrabble Tournament",
  rateLabel: "Scrabble",
  price: 1250,
  rates: [
    { id: "regular", label: "Register now & pay cash on site", amount: 1250 },
    { id: "online", label: "Pay online now", amount: 1000 },
    { id: "member", label: "PSA member", amount: 950 },
    { id: "early-bird", label: "Early bird", amount: 800, availableUntil: "2026-10-18T23:59:59+05:00" },
    { id: "walk-in", label: "Walk-in, at the door", amount: 1400 },
  ],
};

describe("reading codes off an event", () => {
  it("takes a well-formed code and names it when the organiser did not", () => {
    expect(CODES[0]).toMatchObject({ code: "KSA18", percentOff: 30 });
    expect(CODES[0].label).toBe("KSA18 — 30% off");
  });

  it("refuses a percentage that is not a discount", () => {
    /* Nought takes nothing off; over a hundred would pay somebody to enter. */
    expect(promoCodesFrom([{ code: "A", percentOff: 0 }])).toEqual([]);
    expect(promoCodesFrom([{ code: "A", percentOff: 101 }])).toEqual([]);
    expect(promoCodesFrom([{ code: "A", percentOff: -10 }])).toEqual([]);
    expect(promoCodesFrom([{ code: "A", percentOff: "thirty" }])).toEqual([]);
  });

  it("refuses a code with no code", () => {
    expect(promoCodesFrom([{ code: "  ", percentOff: 30 }])).toEqual([]);
  });

  it("is empty for an event running no promotion", () => {
    expect(promoCodesFrom(undefined)).toEqual([]);
    expect(promoCodesFrom([])).toEqual([]);
  });
});

describe("resolving what was typed", () => {
  it("accepts the code however it was capitalised or spaced", () => {
    for (const typed of ["KSA18", "ksa18", " Ksa18 "])
      expect(resolvePromo(CODES, typed, NOW).status).toBe("accepted");
  });

  it("says nothing at all when the box is empty", () => {
    expect(resolvePromo(CODES, "", NOW)).toEqual({ status: "none" });
    expect(resolvePromo(CODES, "   ", NOW)).toEqual({ status: "none" });
  });

  it("tells an unknown code apart from one that merely closed", () => {
    const unknown = resolvePromo(CODES, "NOPE", NOW);
    expect(unknown.status).toBe("unknown");

    const expired = resolvePromo(CODES, "CLOSED", NOW);
    expect(expired.status).toBe("expired");
    /* Hunting for a typo in a code that simply ended is wasted time. */
    if (expired.status === "expired") expect(expired.message).toMatch(/closed/i);
  });

  it("honours a code right up to its last moment", () => {
    expect(resolvePromo(CODES, "CLOSED", "2026-09-01T23:00:00+05:00").status).toBe("accepted");
    expect(resolvePromo(CODES, "CLOSED", "2026-09-02T00:30:00+05:00").status).toBe("expired");
  });
});

describe("applying it", () => {
  it("takes the percentage off, to the nearest rupee", () => {
    expect(applyPromo(800, CODES[0])).toBe(560);
    expect(applyPromo(950, CODES[0])).toBe(665);
    expect(applyPromo(1250, CODES[0])).toBe(875);
  });

  it("changes nothing when there is no code", () => {
    expect(applyPromo(800, null)).toBe(800);
  });

  it("never goes below nothing", () => {
    const everything = promoCodesFrom([{ code: "FREE", percentOff: 100 }])[0];
    expect(applyPromo(800, everything)).toBe(0);
  });
});

describe("the code against the ladder", () => {
  const ctx = { isMember: false, at: NOW, payment: "online" as const };

  it("comes off the bracket they had already earned, not off the regular price", () => {
    /*
     * The early bird is live, so they were paying 800. Thirty per cent of that is 560. Taken
     * off the 1,250 regular price it would be 875 — more than they were already paying, and
     * a code that makes the price go up is a code nobody would type twice.
     */
    const priced = priceActivity(SCRABBLE, { ...ctx, promo: CODES[0] });
    expect(priced.beforePromo).toBe(800);
    expect(priced.amount).toBe(560);
    expect(priced.promo?.code).toBe("KSA18");
  });

  it("applies to whichever bracket is current once the early bird closes", () => {
    const later = { isMember: true, at: "2026-10-19T10:00:00+05:00", payment: "online" as const };
    const priced = priceActivity(SCRABBLE, { ...later, promo: CODES[0] });
    expect(priced.beforePromo).toBe(950);
    expect(priced.amount).toBe(665);
  });

  it("leaves the price alone when no code was given", () => {
    const priced = priceActivity(SCRABBLE, ctx);
    expect(priced.amount).toBe(800);
    expect(priced.promo).toBeNull();
    expect(priced.beforePromo).toBe(800);
  });

  it("still never charges the walk-in price, code or no code", () => {
    const priced = priceActivity(SCRABBLE, { ...ctx, promo: CODES[0] });
    expect(priced.tiers.find((t) => t.rate.id === "walk-in")?.available).toBe(false);
    expect(priced.amount).toBeLessThan(1400);
  });

  it("works on an activity with a single price", () => {
    const painting: ActivityOption = {
      key: "painting",
      label: "Painting",
      rateLabel: "Painting",
      price: 1000,
    };
    expect(priceActivity(painting, { ...ctx, promo: CODES[0] }).amount).toBe(700);
  });
});
