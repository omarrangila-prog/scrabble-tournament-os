import { describe, expect, it } from "vitest";

import { bucketFor, bucketTotals, collectedRevenue } from "./paymentBuckets";

/**
 * These figures come from the real 23 August entry list, because that is the case the
 * separation exists for: PKR 14,600 is recorded across the event and only PKR 7,550 of it has
 * arrived. A single total would overstate money in hand by nearly double.
 */
const ENTRY_LIST = [
  // Nine online, PKR 7,550.
  ...Array.from({ length: 7 }, () => ({ paymentStatus: "verified", amountDue: 800 })),
  { paymentStatus: "verified", amountDue: 950 },
  { paymentStatus: "verified", amountDue: 1000 },
  // Four paying cash at the door, PKR 2,850.
  { paymentStatus: "cash-at-venue", amountDue: 800 },
  { paymentStatus: "cash-at-venue", amountDue: 800 },
  { paymentStatus: "cash-at-venue", amountDue: 625 },
  { paymentStatus: "cash-at-venue", amountDue: 625 },
  // Five recorded but unconfirmed, PKR 4,200.
  ...Array.from({ length: 4 }, () => ({ paymentStatus: "review-required", amountDue: 800 })),
  { paymentStatus: "review-required", amountDue: 1000 },
  // Two on the promotion.
  { paymentStatus: "complimentary", amountDue: 0 },
  { paymentStatus: "complimentary", amountDue: 0 },
  // One with no amount established at all.
  { paymentStatus: "review-required", amountDue: null },
];

describe("bucketFor", () => {
  it("files each payment state where the organizer expects it", () => {
    expect(bucketFor({ paymentStatus: "verified", amountDue: 800 })).toBe("paid");
    expect(bucketFor({ paymentStatus: "cash-at-venue", amountDue: 800 })).toBe("cash");
    expect(bucketFor({ paymentStatus: "review-required", amountDue: 800 })).toBe("review");
    expect(bucketFor({ paymentStatus: "complimentary", amountDue: 0 })).toBe("promo");
  });

  it("separates an unestablished amount from a reviewed one", () => {
    // The precondition: same status, and only the amount differs.
    expect(bucketFor({ paymentStatus: "review-required", amountDue: 800 })).toBe("review");
    expect(bucketFor({ paymentStatus: "review-required", amountDue: null })).toBe("unknown");
  });

  it("keeps a complimentary registration out of unknown", () => {
    /*
     * A promotion has no amount either. Testing for a missing amount before the explicit
     * states would file a decision somebody made as a question nobody has answered.
     */
    expect(bucketFor({ paymentStatus: "complimentary", amountDue: null })).toBe("promo");
  });

  it("treats an unrecognised state with an amount as needing review, not as paid", () => {
    // Failing safe matters here: the wrong way round would invent revenue.
    expect(bucketFor({ paymentStatus: "something-new", amountDue: 500 })).toBe("review");
  });
});

describe("bucketTotals", () => {
  it("reproduces the 23 August entry list", () => {
    const totals = bucketTotals(ENTRY_LIST);
    const by = (b: string) => totals.find((t) => t.bucket === b)!;

    expect(by("paid")).toMatchObject({ people: 9, amount: 7550 });
    expect(by("cash")).toMatchObject({ people: 4, amount: 2850 });
    expect(by("review")).toMatchObject({ people: 5, amount: 4200 });
    expect(by("promo")).toMatchObject({ people: 2, amount: 0 });
    expect(by("unknown")).toMatchObject({ people: 1, amount: 0 });
  });

  it("accounts for every person exactly once", () => {
    const totals = bucketTotals(ENTRY_LIST);
    expect(totals.reduce((n, t) => n + t.people, 0)).toBe(ENTRY_LIST.length);
  });

  it("adds up to the recorded total across the buckets", () => {
    const totals = bucketTotals(ENTRY_LIST);
    expect(totals.reduce((n, t) => n + t.amount, 0)).toBe(14600);
  });

  it("keeps empty buckets, so a missing tile never reads as a zero", () => {
    const totals = bucketTotals([{ paymentStatus: "verified", amountDue: 800 }]);
    expect(totals).toHaveLength(5);
    expect(totals.find((t) => t.bucket === "cash")).toMatchObject({ people: 0, amount: 0 });
  });
});

describe("collectedRevenue", () => {
  it("counts only what has arrived", () => {
    /*
     * The number this whole module exists to protect. PKR 14,600 is recorded; 7,550 is in
     * hand. Reporting the first as revenue would overstate it by 93%.
     */
    expect(collectedRevenue(ENTRY_LIST)).toBe(7550);
  });

  it("excludes cash promised at the venue until somebody takes it", () => {
    expect(collectedRevenue([{ paymentStatus: "cash-at-venue", amountDue: 800 }])).toBe(0);
  });

  it("is zero for an entry list where nothing has been confirmed", () => {
    expect(
      collectedRevenue([
        { paymentStatus: "review-required", amountDue: 800 },
        { paymentStatus: "review-required", amountDue: null },
      ]),
    ).toBe(0);
  });
});
