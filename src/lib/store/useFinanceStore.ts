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

  /** Retained as a no-op: nothing is seeded, so the ledger starts empty. */
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

      /*
       * No demo ledger. Expenses and income used to be seeded with ten
       * invented costs and four sponsors, which appeared in the profit figure
       * and on financial reports as though the money were real.
       */
      seedDemo: () => set({ seeded: true }),

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
