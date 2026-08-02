import { describe, expect, it } from "vitest";
import {
  Expense,
  expenseTotals,
  FeeRecord,
  feeTotals,
  financePosition,
  money,
  OtherIncome,
  perPlayer,
} from "./finance";

const reg = (over: Partial<FeeRecord> = {}): FeeRecord => ({
  amountDue: 1000,
  discountAmount: 0,
  paymentStatus: "verified",
  status: "approved",
  ...over,
});

const exp = (over: Partial<Expense> = {}): Expense => ({
  id: "e1",
  eventId: "ev",
  category: "venue",
  description: "Hall",
  amount: 5000,
  status: "paid",
  at: "2026-08-01T00:00:00.000Z",
  ...over,
});

describe("feeTotals", () => {
  it("counts only verified payments as collected", () => {
    const t = feeTotals([
      reg({ paymentStatus: "verified" }),
      reg({ paymentStatus: "receipt-uploaded" }),
      reg({ paymentStatus: "not-submitted" }),
    ]);
    expect(t.collected).toBe(1000);
    expect(t.pendingVerification).toBe(1000);
    expect(t.outstanding).toBe(1000);
  });

  it("does not treat an uploaded receipt as money in hand", () => {
    const t = feeTotals([reg({ paymentStatus: "receipt-uploaded" })]);
    expect(t.collected).toBe(0);
  });

  it("treats review-required the same as an uploaded receipt", () => {
    const t = feeTotals([reg({ paymentStatus: "review-required" })]);
    expect(t.pendingVerification).toBe(1000);
    expect(t.collected).toBe(0);
  });

  it("excludes rejected registrations from what is owed", () => {
    const t = feeTotals([reg({ status: "rejected", paymentStatus: "not-submitted" })]);
    expect(t.outstanding).toBe(0);
    expect(t.expected).toBe(0);
  });

  it("counts complimentary entries as heads, not as debt", () => {
    const t = feeTotals([reg({ paymentStatus: "complimentary", amountDue: 0 })]);
    expect(t.complimentaryCount).toBe(1);
    expect(t.outstanding).toBe(0);
    expect(t.collected).toBe(0);
  });

  it("sums discounts given even on comps", () => {
    const t = feeTotals([
      reg({ discountAmount: 200 }),
      reg({ paymentStatus: "complimentary", amountDue: 0, discountAmount: 1000 }),
    ]);
    expect(t.discountGiven).toBe(1200);
  });

  it("expected equals collected plus pending plus outstanding", () => {
    const t = feeTotals([
      reg({ paymentStatus: "verified", amountDue: 500 }),
      reg({ paymentStatus: "review-required", amountDue: 700 }),
      reg({ paymentStatus: "not-submitted", amountDue: 900 }),
    ]);
    expect(t.expected).toBe(t.collected + t.pendingVerification + t.outstanding);
    expect(t.expected).toBe(2100);
  });

  it("returns zeroes for no registrations", () => {
    const t = feeTotals([]);
    expect(t.expected).toBe(0);
    expect(t.discountGiven).toBe(0);
  });
});

describe("expenseTotals", () => {
  it("separates paid, committed and planned", () => {
    const t = expenseTotals([
      exp({ status: "paid", amount: 100 }),
      exp({ status: "committed", amount: 200 }),
      exp({ status: "planned", amount: 400 }),
    ]);
    expect(t.paid).toBe(100);
    expect(t.committed).toBe(200);
    expect(t.planned).toBe(400);
  });

  it("counts only paid and committed as liability", () => {
    const t = expenseTotals([
      exp({ status: "paid", amount: 100 }),
      exp({ status: "committed", amount: 200 }),
      exp({ status: "planned", amount: 999 }),
    ]);
    expect(t.liability).toBe(300);
    expect(t.budgeted).toBe(1299);
  });

  it("groups by category, largest first, with shares", () => {
    const t = expenseTotals([
      exp({ category: "venue", amount: 6000 }),
      exp({ category: "prizes", amount: 3000 }),
      exp({ category: "prizes", amount: 1000 }),
    ]);
    expect(t.byCategory[0].category).toBe("venue");
    expect(t.byCategory[1].amount).toBe(4000);
    expect(t.byCategory[0].share).toBe(60);
  });

  it("ignores negative amounts rather than crediting them", () => {
    const t = expenseTotals([exp({ amount: -500 })]);
    expect(t.paid).toBe(0);
  });

  it("gives zero shares when nothing is budgeted", () => {
    const t = expenseTotals([]);
    expect(t.byCategory).toEqual([]);
    expect(t.budgeted).toBe(0);
  });
});

describe("financePosition", () => {
  const income: OtherIncome[] = [
    { id: "i1", eventId: "ev", source: "sponsorship", description: "Bank", amount: 20000, received: true, at: "x" },
    { id: "i2", eventId: "ev", source: "sponsorship", description: "Pledged", amount: 10000, received: false, at: "x" },
  ];

  it("excludes pledged income from cash in hand", () => {
    const p = financePosition(
      feeTotals([reg({ amountDue: 1000 })]),
      expenseTotals([]),
      income,
    );
    expect(p.cashIn).toBe(21000);
    expect(p.projectedIncome).toBe(31000);
  });

  it("cash in hand nets out only money actually paid", () => {
    const p = financePosition(
      feeTotals([reg({ amountDue: 5000 })]),
      expenseTotals([exp({ status: "paid", amount: 2000 }), exp({ status: "committed", amount: 9000 })]),
    );
    expect(p.cashInHand).toBe(3000);
  });

  it("worst case honours commitments without further collection", () => {
    const p = financePosition(
      feeTotals([reg({ amountDue: 5000 }), reg({ amountDue: 5000, paymentStatus: "not-submitted" })]),
      expenseTotals([exp({ status: "paid", amount: 2000 }), exp({ status: "committed", amount: 4000 })]),
    );
    // 5000 collected − 6000 liability
    expect(p.worstCaseProfit).toBe(-1000);
    expect(p.breakEvenShortfall).toBe(1000);
  });

  it("reports no shortfall once liabilities are covered", () => {
    const p = financePosition(
      feeTotals([reg({ amountDue: 10000 })]),
      expenseTotals([exp({ status: "committed", amount: 4000 })]),
    );
    expect(p.breakEvenShortfall).toBe(0);
  });

  it("projects profit across every expected flow", () => {
    const p = financePosition(
      feeTotals([reg({ amountDue: 1000 }), reg({ amountDue: 1000, paymentStatus: "not-submitted" })]),
      expenseTotals([exp({ status: "planned", amount: 500 })]),
    );
    expect(p.projectedIncome).toBe(2000);
    expect(p.projectedCost).toBe(500);
    expect(p.projectedProfit).toBe(1500);
    expect(p.margin).toBe(75);
  });

  it("does not divide by zero when there is no income", () => {
    const p = financePosition(feeTotals([]), expenseTotals([exp({ amount: 100 })]));
    expect(p.margin).toBe(0);
    expect(p.projectedProfit).toBe(-100);
  });
});

describe("perPlayer", () => {
  it("spreads cost over every head but income over paying heads", () => {
    const p = financePosition(
      feeTotals([reg({ amountDue: 1000 }), reg({ amountDue: 1000 })]),
      expenseTotals([exp({ amount: 1200 })]),
    );
    const per = perPlayer(p, 2, 4);
    expect(per.revenuePerPlayer).toBe(1000);
    expect(per.costPerPlayer).toBe(300);
  });

  it("returns zero rather than NaN with no players", () => {
    const p = financePosition(feeTotals([]), expenseTotals([]));
    expect(perPlayer(p, 0, 0)).toEqual({
      revenuePerPlayer: 0,
      costPerPlayer: 0,
      profitPerPlayer: 0,
    });
  });
});

describe("money", () => {
  it("groups thousands", () => {
    expect(money(1250000)).toBe("PKR 1,250,000");
  });

  it("marks a loss without a stray minus inside the number", () => {
    expect(money(-4500)).toBe("−PKR 4,500");
  });

  it("accepts another currency", () => {
    expect(money(100, "USD")).toBe("USD 100");
  });
});
