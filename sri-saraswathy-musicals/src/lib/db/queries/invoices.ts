import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import type { Invoice } from "@/types";
import { row, rows, definedOnly } from "./_util";

export async function getInvoices(): Promise<Invoice[]> {
  return rows<Invoice>(await db.select().from(invoices).orderBy(desc(invoices.date)));
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  const [r] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return r ? row<Invoice>(r) : undefined;
}

/** Look up the ledger invoice recorded for a given order/bill id (see `refId`). */
export async function getInvoiceByRefId(refId: string): Promise<Invoice | undefined> {
  const [r] = await db.select().from(invoices).where(eq(invoices.refId, refId)).limit(1);
  return r ? row<Invoice>(r) : undefined;
}

export async function createInvoice(inv: Invoice): Promise<Invoice> {
  const [r] = await db.insert(invoices).values(inv).returning();
  return row<Invoice>(r);
}

export async function updateInvoice(
  id: string,
  patch: Partial<Invoice>,
): Promise<Invoice | undefined> {
  const set = definedOnly(patch) as Partial<typeof invoices.$inferInsert>;
  if (Object.keys(set).length === 0) return getInvoice(id);
  const [r] = await db.update(invoices).set(set).where(eq(invoices.id, id)).returning();
  return r ? row<Invoice>(r) : undefined;
}

export async function deleteInvoice(id: string): Promise<boolean> {
  const r = await db.delete(invoices).where(eq(invoices.id, id)).returning({ id: invoices.id });
  return r.length > 0;
}
