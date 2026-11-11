import { desc, eq } from "drizzle-orm";
import { definedOnly } from "./_util";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import type { Expense } from "@/lib/store/expenses";
import { row, rows } from "./_util";

export async function getExpenses(): Promise<Expense[]> {
  return rows<Expense>(await db.select().from(expenses).orderBy(desc(expenses.expenseDate)));
}

export async function getExpense(id: string): Promise<Expense | undefined> {
  const [r] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  return r ? row<Expense>(r) : undefined;
}

export async function createExpense(e: Expense): Promise<Expense> {
  const [r] = await db.insert(expenses).values(e).returning();
  return row<Expense>(r);
}

/** EXP-03 / EXP-01: edit an expense (title, amount, category, mode, date, notes, link to analytics). */
export async function updateExpense(id: string, patch: Partial<Expense>): Promise<Expense | undefined> {
  const set = definedOnly(patch) as Partial<typeof expenses.$inferInsert>;
  delete (set as { id?: string }).id;
  delete (set as { createdAt?: string }).createdAt;
  if (Object.keys(set).length === 0) return getExpense(id);
  const [r] = await db.update(expenses).set(set).where(eq(expenses.id, id)).returning();
  return r ? row<Expense>(r) : undefined;
}

/** EXP-04: rename a category on every expense that uses it. Returns how many expenses changed. */
export async function renameExpenseCategory(from: string, to: string): Promise<number> {
  const r = await db.update(expenses).set({ category: to }).where(eq(expenses.category, from)).returning({ id: expenses.id });
  return r.length;
}

export async function deleteExpense(id: string): Promise<boolean> {
  const r = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
  return r.length > 0;
}
