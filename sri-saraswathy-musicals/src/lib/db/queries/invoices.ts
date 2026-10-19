import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices, branches, counters } from "@/lib/db/schema";
import type { Invoice } from "@/types";
import { HttpError } from "@/lib/api/errors";
import { isBranch } from "@/lib/stock";
import { cleanPayments, paymentLabel, statusFor } from "@/lib/paymentSplit";
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

/** The letters used in a branch's references ("V", "P"…): its stored invoice code, else its initial. */
export async function branchCode(branch: string): Promise<string> {
  const [b] = await db.select({ code: branches.code, name: branches.name }).from(branches).where(eq(branches.id, branch)).limit(1);
  const code = (b?.code ?? "").trim().toUpperCase();
  return code || (b?.name ?? branch).trim().charAt(0).toUpperCase() || "X";
}

/**
 * Next customer-facing reference for a branch, e.g. `INV-2026-P0001`. Each
 * (branch code, year) has its own counter, bumped atomically in one upsert so
 * concurrent sales never share a number. This is separate from the GST tax-invoice
 * number (`SSM/2026-27/0021`), which runs across all branches.
 */
export async function nextBranchReference(branch: string, dateIso: string): Promise<string> {
  const code = await branchCode(branch);
  const d = new Date(dateIso);
  const year = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const [r] = await db
    .insert(counters)
    .values({ key: `invref:${code}:${year}`, value: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  return `INV-${year}-${code}${String(r?.value ?? 1).padStart(4, "0")}`;
}

export async function createInvoice(inv: Invoice): Promise<Invoice> {
  const withRef = { ...inv, reference: inv.reference || (await nextBranchReference(inv.branch, inv.date)) };
  const [r] = await db.insert(invoices).values(withRef).returning();
  return row<Invoice>(r);
}

const EDITABLE = [
  "number", "date", "customer", "branch", "items", "subtotal", "cgst", "sgst", "igst", "total",
  "paymentMode", "payments", "status", "source", "customerGstin", "customerPhone", "delivery", "discount",
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
  // Payment lines decide the payment text and paid/pending status, so the three never disagree.
  if (clean.payments !== undefined) {
    const current = await getInvoice(id);
    if (!current) return undefined;
    const total = clean.total ?? current.total;
    const pay = cleanPayments(clean.payments, total);
    if (!pay.ok) throw bad(pay.error);
    clean.payments = pay.lines;
    // No lines (an older invoice, or none entered) leaves the payment text and status as they are.
    if (pay.lines.length > 0) {
      clean.paymentMode = paymentLabel(pay.lines);
      if ((clean.status ?? current.status) !== "cancelled") clean.status = statusFor(total, pay.lines);
    }
  }
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

/**
 * Cancel an invoice. It is kept, marked "cancelled", never erased: GST invoice numbers must run without gaps, so a
 * cancelled one stays on record under its number. If it came from a counter sale, the sale is undone as well —
 * the stock goes back and the sale leaves revenue — exactly as when the bill itself is deleted.
 */
export async function cancelInvoice(id: string): Promise<Invoice | undefined> {
  const current = await getInvoice(id);
  if (!current) return undefined;
  if (current.status === "cancelled") return current;
  if (current.refId) {
    const { deleteBill } = await import("./pos"); // false when the reference isn't a counter bill (web order, repair, manual)
    await deleteBill(current.refId);
  }
  const [r] = await db.update(invoices).set({ status: "cancelled" }).where(eq(invoices.id, id)).returning();
  return row<Invoice>(r);
}
