"use client";
import { create } from "zustand";
import { fetchJson, errMsg, readError } from "@/lib/client/api";

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
  loadError: string | null;
  hydrate: () => Promise<boolean>;
  addExpense: (e: Expense) => Promise<boolean>;
  deleteExpense: (id: string) => Promise<void>;
}

export const useExpenses = create<ExpenseState>()((set, get) => ({
  expenses: [],
  hydrated: false,
  loadError: null,
  hydrate: async () => {
    try {
      const expenses = await fetchJson<Expense[]>("/api/expenses", { cache: "no-store" });
      set({ expenses, hydrated: true, loadError: null });
      return true;
    } catch (e) {
      // Not "no expenses": keep what we had and say the load failed.
      set({ hydrated: true, loadError: errMsg(e, "Couldn't load expenses") });
      return false;
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
      if (!res.ok) throw new Error(await readError(res, "Save failed"));
      // Adopt the server copy (branch may have been forced for branch users).
      const saved = (await res.json()) as Expense;
      set((s) => ({ expenses: s.expenses.map((x) => (x.id === e.id ? saved : x)) }));
      return true;
    } catch (err) {
      set((s) => ({ expenses: s.expenses.filter((x) => x.id !== e.id) }));
      alert(`Couldn't save the expense: ${errMsg(err)}`);
      return false;
    }
  },
  deleteExpense: async (id) => {
    // Put back only the row we removed — restoring a whole pre-delete snapshot
    // would wipe out any expense added while this request was in flight.
    const removed = get().expenses.find((x) => x.id === id);
    set((s) => ({ expenses: s.expenses.filter((x) => x.id !== id) }));
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Delete failed"));
    } catch (err) {
      if (removed) set((s) => ({ expenses: s.expenses.some((x) => x.id === id) ? s.expenses : [removed, ...s.expenses] }));
      alert(`Couldn't delete the expense: ${errMsg(err)}. It has been put back.`);
    }
  },
}));
