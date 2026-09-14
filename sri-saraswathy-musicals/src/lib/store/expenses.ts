"use client";
import { create } from "zustand";

export type PaymentMode = "CASH" | "UPI" | "CARD" | "BANK" | "OTHER";
export const PAYMENT_MODES: PaymentMode[] = ["CASH", "UPI", "CARD", "BANK", "OTHER"];

/** Preset expense categories; custom ones can be typed in on the fly. */
export const EXPENSE_CATEGORIES = [
  "Stock Purchase",
  "Rent",
  "Salaries",
  "Utilities",
  "Electricity",
  "Transport",
  "Marketing",
  "Repairs & Maintenance",
  "Taxes & Fees",
  "Miscellaneous",
];

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  paymentMode: PaymentMode;
  notes?: string | null;
  expenseDate: string; // yyyy-mm-dd
  createdAt: string; // ISO
  branch: string;
}

interface ExpenseState {
  expenses: Expense[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addExpense: (e: Expense) => Promise<boolean>;
  deleteExpense: (id: string) => Promise<void>;
}

export const useExpenses = create<ExpenseState>()((set, get) => ({
  expenses: [],
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/expenses", { cache: "no-store" });
      set({ expenses: res.ok ? ((await res.json()) as Expense[]) : [], hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  addExpense: async (e) => {
    // Optimistic: show immediately, roll back on failure.
    set((s) => ({ expenses: [e, ...s.expenses] }));
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e),
      });
      if (!res.ok) throw new Error("save failed");
      // Adopt the server copy (branch may have been forced for branch users).
      const saved = (await res.json()) as Expense;
      set((s) => ({ expenses: s.expenses.map((x) => (x.id === e.id ? saved : x)) }));
      return true;
    } catch {
      set((s) => ({ expenses: s.expenses.filter((x) => x.id !== e.id) }));
      return false;
    }
  },
  deleteExpense: async (id) => {
    const prev = get().expenses;
    set((s) => ({ expenses: s.expenses.filter((x) => x.id !== id) }));
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      set({ expenses: prev });
      alert("Couldn't delete the expense. Reverting.");
    }
  },
}));
