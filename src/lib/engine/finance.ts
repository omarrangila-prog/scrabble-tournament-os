/**
 * Event finance: what came in, what went out, and what is still owed.
 *
 * Two rules run through everything here:
 *
 * 1. Only a *verified* payment counts as money received. A receipt that has
 *    been uploaded but not checked is a claim, not cash, and mixing the two
 *    produces a profit figure a director cannot defend.
 * 2. Every derived figure is computed from the registration and expense
 *    records themselves. Nothing is cached on the event, so a corrected
 *    payment immediately corrects the profit.
 */

export type ExpenseCategory =
  | "venue"
  | "prizes"
  | "equipment"
  | "refreshments"
  | "printing"
  | "staff"
  | "transport"
  | "marketing"
  | "other";

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  venue: "Venue",
  prizes: "Prizes",
  equipment: "Equipment",
  refreshments: "Refreshments",
  printing: "Printing",
  staff: "Staff",
  transport: "Transport",
  marketing: "Marketing",
  other: "Other",
};

export type ExpenseStatus = "planned" | "committed" | "paid";

export interface Expense {
  id: string;
  eventId: string;
  category: ExpenseCategory;
  description: string;
  /** Whole currency units. */
  amount: number;
  status: ExpenseStatus;
  /** Who authorised it — an expense with no owner is a hole in the books. */
  paidBy?: string;
  reference?: string;
  at: string;
}

/** Revenue that did not come from entry fees. */
export type IncomeSource = "sponsorship" | "merchandise" | "donation" | "canteen" | "other";

export const INCOME_SOURCE_LABEL: Record<IncomeSource, string> = {
  sponsorship: "Sponsorship",
  merchandise: "Merchandise",
  donation: "Donation",
  canteen: "Canteen",
  other: "Other",
};

export interface OtherIncome {
  id: string;
  eventId: string;
  source: IncomeSource;
  description: string;
  amount: number;
  /** Pledged money is not received money, and is excluded from cash in hand. */
  received: boolean;
  at: string;
}

/* -------------------------------------------------------------------------- */
/* Registration input                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The finance-relevant slice of a registration.
 *
 * Deliberately structural rather than importing the store type: the engine is
 * pure and testable without a store, and the dashboard passes real records in.
 */
export interface FeeRecord {
  amountDue: number;
  discountAmount: number;
  paymentStatus: string;
  status: string;
}

/** Registrations that will never pay, and so are not counted as owing. */
const NON_PAYING_STATUS = new Set(["rejected"]);
const NON_PAYING_PAYMENT = new Set(["complimentary", "rejected"]);

export interface FeeTotals {
  /** Verified entry-fee payments. Money actually in hand. */
  collected: number;
  /** Owed by registrations that are still live and unpaid. */
  outstanding: number;
  /** Fees uploaded but not yet verified — a claim, not cash. */
  pendingVerification: number;
  /** Total value given away through discount codes and free entries. */
  discountGiven: number;
  /** Entries admitted at no charge. */
  complimentaryCount: number;
  /** collected + outstanding + pendingVerification. */
  expected: number;
}

export function feeTotals(registrations: FeeRecord[]): FeeTotals {
  let collected = 0;
  let outstanding = 0;
  let pending = 0;
  let discountGiven = 0;
  let complimentaryCount = 0;

  for (const r of registrations) {
    discountGiven += Math.max(0, r.discountAmount);

    if (r.paymentStatus === "complimentary") {
      complimentaryCount += 1;
      continue;
    }
    if (NON_PAYING_STATUS.has(r.status) || NON_PAYING_PAYMENT.has(r.paymentStatus)) continue;

    if (r.paymentStatus === "verified") collected += r.amountDue;
    else if (r.paymentStatus === "receipt-uploaded" || r.paymentStatus === "under-review")
      pending += r.amountDue;
    else outstanding += r.amountDue;
  }

  return {
    collected,
    outstanding,
    pendingVerification: pending,
    discountGiven,
    complimentaryCount,
    expected: collected + outstanding + pending,
  };
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                    */
/* -------------------------------------------------------------------------- */

export interface ExpenseTotals {
  /** Money that has left the account. */
  paid: number;
  /** Agreed but not yet paid — a real liability. */
  committed: number;
  /** Budgeted only; can still be cancelled. */
  planned: number;
  /** paid + committed. What the event is contractually on the hook for. */
  liability: number;
  /** paid + committed + planned. The full budget. */
  budgeted: number;
  byCategory: { category: ExpenseCategory; amount: number; share: number }[];
}

export function expenseTotals(expenses: Expense[]): ExpenseTotals {
  let paid = 0;
  let committed = 0;
  let planned = 0;

  const cats = new Map<ExpenseCategory, number>();
  for (const e of expenses) {
    const amount = Math.max(0, e.amount);
    if (e.status === "paid") paid += amount;
    else if (e.status === "committed") committed += amount;
    else planned += amount;
    cats.set(e.category, (cats.get(e.category) ?? 0) + amount);
  }

  const budgeted = paid + committed + planned;
  const byCategory = [...cats.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      share: budgeted > 0 ? Math.round((amount / budgeted) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { paid, committed, planned, liability: paid + committed, budgeted, byCategory };
}

/* -------------------------------------------------------------------------- */
/* Position                                                                    */
/* -------------------------------------------------------------------------- */

export interface FinancePosition {
  /** Verified fees plus received other income. */
  cashIn: number;
  /** Expenses actually paid out. */
  cashOut: number;
  /** cashIn − cashOut. What is in the account right now. */
  cashInHand: number;

  /** Everything expected to arrive, including unverified and unpaid fees. */
  projectedIncome: number;
  /** Everything expected to go out, including planned spend. */
  projectedCost: number;
  /** projectedIncome − projectedCost. The figure to plan against. */
  projectedProfit: number;

  /** Profit if nothing further is collected but all liabilities are settled. */
  worstCaseProfit: number;

  /** Percentage of projected income kept as profit. Zero when income is zero. */
  margin: number;
  /** Fees that must still be collected to cover committed liabilities. */
  breakEvenShortfall: number;
}

export function financePosition(
  fees: FeeTotals,
  expenses: ExpenseTotals,
  otherIncome: OtherIncome[] = [],
): FinancePosition {
  const otherReceived = otherIncome
    .filter((i) => i.received)
    .reduce((s, i) => s + Math.max(0, i.amount), 0);
  const otherExpected = otherIncome.reduce((s, i) => s + Math.max(0, i.amount), 0);

  const cashIn = fees.collected + otherReceived;
  const cashOut = expenses.paid;

  const projectedIncome = fees.expected + otherExpected;
  const projectedCost = expenses.budgeted;

  const margin =
    projectedIncome > 0
      ? Math.round(((projectedIncome - projectedCost) / projectedIncome) * 100)
      : 0;

  return {
    cashIn,
    cashOut,
    cashInHand: cashIn - cashOut,
    projectedIncome,
    projectedCost,
    projectedProfit: projectedIncome - projectedCost,
    // Nothing more collected, but every commitment honoured.
    worstCaseProfit: cashIn - expenses.liability,
    margin,
    breakEvenShortfall: Math.max(0, expenses.liability - cashIn),
  };
}

/** Formats a whole-unit amount for display, e.g. `PKR 12,500`. */
export function money(amount: number, currency = "PKR"): string {
  const sign = amount < 0 ? "−" : "";
  return `${sign}${currency} ${Math.abs(Math.round(amount)).toLocaleString("en-PK")}`;
}

/**
 * Per-head economics, which is how a director decides next year's fee.
 * Paying heads only — comps consume cost without contributing income.
 */
export function perPlayer(
  position: FinancePosition,
  payingPlayers: number,
  totalPlayers: number,
): { revenuePerPlayer: number; costPerPlayer: number; profitPerPlayer: number } {
  const heads = Math.max(0, totalPlayers);
  const paying = Math.max(0, payingPlayers);
  return {
    revenuePerPlayer: paying > 0 ? Math.round(position.projectedIncome / paying) : 0,
    costPerPlayer: heads > 0 ? Math.round(position.projectedCost / heads) : 0,
    profitPerPlayer: paying > 0 ? Math.round(position.projectedProfit / paying) : 0,
  };
}
