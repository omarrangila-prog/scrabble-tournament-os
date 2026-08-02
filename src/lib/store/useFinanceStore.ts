"use client";

/**
 * Event finance ledger: expenses and non-fee income.
 *
 * Entry-fee money is *not* stored here — it is derived from the registration
 * records in `useEventStore`, so a payment corrected in the review queue
 * immediately corrects the profit figure. This store only holds the things
 * registrations cannot tell us: what the event spent, and what it took in
 * outside the entry fee.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  IncomeSource,
  OtherIncome,
} from "../engine/finance";

export const FINANCE_STORAGE_KEY = "bluffy-finance-v1";

interface FinanceState {
  hydrated: boolean;
  expenses: Expense[];
  income: OtherIncome[];
  seeded: boolean;
}

interface FinanceActions {
  addExpense: (draft: Omit<Expense, "id" | "at">) => void;
  updateExpense: (id: string, patch: Partial<Omit<Expense, "id" | "eventId">>) => void;
  setExpenseStatus: (id: string, status: ExpenseStatus) => void;
  removeExpense: (id: string) => void;

  addIncome: (draft: Omit<OtherIncome, "id" | "at">) => void;
  toggleIncomeReceived: (id: string) => void;
  removeIncome: (id: string) => void;

  expensesFor: (eventId: string) => Expense[];
  incomeFor: (eventId: string) => OtherIncome[];

  /** Populates a realistic demo ledger once, so the dashboard is not empty. */
  seedDemo: (eventId: string) => void;
  resetFinance: () => void;
}

export type FinanceStore = FinanceState & FinanceActions;

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

const fresh = (): FinanceState => ({
  hydrated: false,
  expenses: [],
  income: [],
  seeded: false,
});

/** A plausible one-day 128-player budget, in PKR. */
const DEMO_EXPENSES: Omit<Expense, "id" | "eventId" | "at">[] = [
  { category: "venue", description: "Main hall hire, full day", amount: 85000, status: "paid", paidBy: "Sir Hani", reference: "INV-2211" },
  { category: "venue", description: "Sound system and projector", amount: 18000, status: "paid", paidBy: "Sir Hani" },
  { category: "prizes", description: "Masters division prize fund", amount: 120000, status: "committed", paidBy: "Sir Hani" },
  { category: "prizes", description: "Trophies and medals, all divisions", amount: 46000, status: "paid", reference: "PO-118" },
  { category: "equipment", description: "Tournament boards and clocks, 64 sets", amount: 62000, status: "paid" },
  { category: "refreshments", description: "Lunch and tea, 150 covers", amount: 54000, status: "committed" },
  { category: "printing", description: "Certificates, scorecards, signage", amount: 21500, status: "paid" },
  { category: "staff", description: "Adjudicators and floor volunteers", amount: 40000, status: "committed" },
  { category: "transport", description: "Equipment transport, both ways", amount: 12000, status: "planned" },
  { category: "marketing", description: "Social media promotion", amount: 15000, status: "paid" },
];

const DEMO_INCOME: Omit<OtherIncome, "id" | "eventId" | "at">[] = [
  { source: "sponsorship", description: "Title sponsor", amount: 150000, received: true },
  { source: "sponsorship", description: "Refreshment partner", amount: 60000, received: false },
  { source: "merchandise", description: "Event t-shirts and mugs", amount: 24000, received: true },
  { source: "canteen", description: "Canteen share", amount: 11000, received: false },
];

export const useFinanceStore = create<FinanceStore>()(
  persist(
    (set, get) => ({
      ...fresh(),

      addExpense: (draft) =>
        set((s) => ({
          expenses: [...s.expenses, { ...draft, id: `exp-${uid()}`, at: now() }],
        })),

      updateExpense: (id, patch) =>
        set((s) => ({
          expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),

      setExpenseStatus: (id, status) =>
        set((s) => ({
          expenses: s.expenses.map((e) => (e.id === id ? { ...e, status } : e)),
        })),

      removeExpense: (id) => set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) })),

      addIncome: (draft) =>
        set((s) => ({ income: [...s.income, { ...draft, id: `inc-${uid()}`, at: now() }] })),

      toggleIncomeReceived: (id) =>
        set((s) => ({
          income: s.income.map((i) => (i.id === id ? { ...i, received: !i.received } : i)),
        })),

      removeIncome: (id) => set((s) => ({ income: s.income.filter((i) => i.id !== id) })),

      expensesFor: (eventId) => get().expenses.filter((e) => e.eventId === eventId),
      incomeFor: (eventId) => get().income.filter((i) => i.eventId === eventId),

      seedDemo: (eventId) =>
        set((s) => {
          if (s.seeded) return s;
          const at = now();
          return {
            seeded: true,
            expenses: DEMO_EXPENSES.map((e, i) => ({ ...e, id: `exp-seed-${i}`, eventId, at })),
            income: DEMO_INCOME.map((x, i) => ({ ...x, id: `inc-seed-${i}`, eventId, at })),
          };
        }),

      resetFinance: () => set({ ...fresh(), hydrated: true }),
    }),
    {
      name: FINANCE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { hydrated, ...rest } = s as FinanceStore;
        void hydrated;
        return rest as unknown as FinanceStore;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

export type { Expense, ExpenseCategory, ExpenseStatus, IncomeSource, OtherIncome };
