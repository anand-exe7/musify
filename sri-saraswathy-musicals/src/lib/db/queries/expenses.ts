import { desc, eq } from "drizzle-orm";
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

export async function deleteExpense(id: string): Promise<boolean> {
  const r = await db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
  return r.length > 0;
}
