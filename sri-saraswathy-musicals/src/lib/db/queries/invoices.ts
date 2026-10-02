import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import type { Invoice } from "@/types";
import { HttpError } from "@/lib/api/errors";
import { isBranch } from "@/lib/stock";
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

const EDITABLE = [
  "number", "date", "customer", "branch", "items", "subtotal", "cgst", "sgst", "igst", "total",
  "paymentMode", "status", "source", "customerGstin", "customerPhone", "delivery", "discount",
] as const;
const MONEY = ["subtotal", "cgst", "sgst", "igst", "total", "delivery", "discount"] as const;
const bad = (m: string) => new HttpError(400, m);
const paise = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Pick the editable fields from a client patch and reject anything malformed.
 *  `id` and `refId` (the link to the source bill) are never taken from the client. */
function validateInvoicePatch(patch: Partial<Invoice>): Partial<Invoice> {
  const p = patch as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) if (p[k] !== undefined) out[k] = p[k];

  for (const k of ["number", "customer", "paymentMode"] as const) {
    if (k in out && (typeof out[k] !== "string" || !(out[k] as string).trim())) throw bad(`Invoice ${k} is required.`);
  }
  if ("date" in out && (typeof out.date !== "string" || isNaN(Date.parse(out.date)))) throw bad("Invalid invoice date.");
  if ("branch" in out && !isBranch(out.branch)) throw bad("Unknown branch.");
  if ("status" in out && !["paid", "pending", "cancelled"].includes(out.status as string)) throw bad("Invalid status.");
  if ("source" in out && !["web", "pos", "service", "manual"].includes(out.source as string)) throw bad("Invalid source.");
  for (const k of MONEY) if (k in out && !paise(out[k])) throw bad(`${k} must be a whole number of paise ≥ 0.`);
  if ("items" in out) {
    const items = out.items;
    if (!Array.isArray(items)) throw bad("Invalid line items.");
    for (const l of items as Record<string, unknown>[]) {
      if (!l || typeof l.name !== "string" || !l.name.trim()) throw bad("Every line needs an item name.");
      if (!Number.isInteger(l.qty) || (l.qty as number) < 1) throw bad("Line quantity must be a whole number ≥ 1.");
      for (const k of ["rate", "amount", "mrp", "discount"]) {
        if (l[k] !== undefined && !paise(l[k])) throw bad(`Line ${k} must be a whole number of paise ≥ 0.`);
      }
      // Older invoices may carry no GST rate on a line; only validate it when present.
      if (l.gst !== undefined && (typeof l.gst !== "number" || !(l.gst >= 0 && l.gst <= 100))) throw bad("Line GST % must be between 0 and 100.");
    }
  }
  return out as Partial<Invoice>;
}

export async function updateInvoice(
  id: string,
  patch: Partial<Invoice>,
): Promise<Invoice | undefined> {
  const clean = validateInvoicePatch(patch);
  const set = definedOnly(clean) as Partial<typeof invoices.$inferInsert>;
  if (Object.keys(set).length === 0) return getInvoice(id);
  if (set.number !== undefined) {
    const [dup] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.number, set.number), ne(invoices.id, id)))
      .limit(1);
    if (dup) throw bad(`Invoice number ${set.number} is already in use.`);
  }
  const [r] = await db.update(invoices).set(set).where(eq(invoices.id, id)).returning();
  return r ? row<Invoice>(r) : undefined;
}

export async function deleteInvoice(id: string): Promise<boolean> {
  const r = await db.delete(invoices).where(eq(invoices.id, id)).returning({ id: invoices.id });
  return r.length > 0;
}
