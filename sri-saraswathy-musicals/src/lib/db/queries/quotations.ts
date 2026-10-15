import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { quotations, counters } from "@/lib/db/schema";
import type { Quotation, QuotationLine } from "@/types";
import { HttpError } from "@/lib/api/errors";
import { genDocId } from "@/lib/ids";
import { isBranch } from "@/lib/stock";
import { addDays, computeQuote, QUOTE_VALID_DAYS } from "@/lib/quotation";
import { branchCode } from "./invoices";
import { row, rows } from "./_util";

const bad = (m: string) => new HttpError(400, m);

export async function getQuotations(): Promise<Quotation[]> {
  return rows<Quotation>(await db.select().from(quotations).orderBy(desc(quotations.date)));
}

export async function getQuotation(id: string): Promise<Quotation | undefined> {
  const [r] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
  return r ? row<Quotation>(r) : undefined;
}

/** Next number for a branch, e.g. `QT-2026-P0001` — its own counter per (branch code, year). */
export async function nextQuoteNumber(branch: string, dateIso: string): Promise<string> {
  const code = await branchCode(branch);
  const d = new Date(dateIso);
  const year = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const [r] = await db
    .insert(counters)
    .values({ key: `quote:${code}:${year}`, value: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  return `QT-${year}-${code}${String(r?.value ?? 1).padStart(4, "0")}`;
}

export interface QuotationInput {
  date?: string;
  validUntil?: string;
  customer?: string;
  customerPhone?: string | null;
  customerGstin?: string | null;
  branch?: string;
  items?: Partial<QuotationLine>[];
  discount?: number;
  advance?: number;
  status?: string;
  notes?: string;
}

const paise = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Validate a client payload. Line amounts and totals are always recomputed here, never trusted. */
function clean(input: QuotationInput, partial: boolean) {
  const out: Record<string, unknown> = {};
  if (input.customer !== undefined || !partial) {
    const c = (input.customer ?? "").trim();
    if (!c) throw bad("Customer name is required.");
    out.customer = c;
  }
  if (input.branch !== undefined || !partial) {
    if (!isBranch(input.branch)) throw bad("Unknown branch.");
    out.branch = input.branch;
  }
  for (const k of ["date", "validUntil"] as const) {
    if (input[k] !== undefined) {
      if (typeof input[k] !== "string" || Number.isNaN(Date.parse(input[k] as string))) throw bad(`Invalid ${k}.`);
      out[k] = input[k];
    }
  }
  for (const k of ["customerPhone", "customerGstin"] as const) {
    if (input[k] !== undefined) out[k] = (input[k] ?? "").toString().trim() || null;
  }
  if (input.notes !== undefined) out.notes = String(input.notes).trim();
  if (input.status !== undefined) {
    if (!["open", "accepted", "declined"].includes(input.status)) throw bad("Invalid status.");
    out.status = input.status;
  }
  if (input.advance !== undefined) {
    if (!paise(input.advance)) throw bad("Advance must be a whole number of paise ≥ 0.");
    out.advance = input.advance;
  }
  if (input.discount !== undefined && !paise(input.discount)) throw bad("Discount must be a whole number of paise ≥ 0.");

  if (input.items !== undefined || !partial) {
    const items = input.items ?? [];
    if (items.length === 0) throw bad("Add at least one line.");
    const lines = items.map((l) => {
      if (!l || typeof l.name !== "string" || !l.name.trim()) throw bad("Every line needs an item name.");
      if (!Number.isInteger(l.qty) || (l.qty as number) < 1) throw bad("Line quantity must be a whole number ≥ 1.");
      if (!paise(l.rate)) throw bad("Line rate must be a whole number of paise ≥ 0.");
      const gst = l.gst ?? 0;
      if (typeof gst !== "number" || !(gst >= 0 && gst <= 100)) throw bad("Line GST % must be between 0 and 100.");
      return {
        name: l.name.trim(),
        hsn: (l.hsn ?? "").toString().trim() || "-",
        qty: l.qty as number,
        rate: l.rate as number,
        gst,
        note: l.note?.toString().trim() || undefined,
      };
    });
    const discount = input.discount ?? 0;
    const { amounts, totals } = computeQuote(lines, discount);
    out.discount = discount;
    out.items = lines.map((l, i) => ({ ...l, amount: amounts[i] }));
    Object.assign(out, totals);
  } else if (input.discount !== undefined) {
    throw bad("Send the lines along with a changed discount.");
  }
  return out;
}

export async function createQuotation(input: QuotationInput): Promise<Quotation> {
  const base = clean(input, false) as Record<string, unknown> & { branch: string };
  const date = (base.date as string | undefined) ?? new Date().toISOString();
  const [r] = await db
    .insert(quotations)
    .values({
      ...base,
      id: genDocId("QUO"),
      number: await nextQuoteNumber(base.branch, date),
      date,
      validUntil: (base.validUntil as string | undefined) ?? addDays(date, QUOTE_VALID_DAYS),
    } as typeof quotations.$inferInsert)
    .returning();
  return row<Quotation>(r);
}

export async function updateQuotation(id: string, input: QuotationInput): Promise<Quotation | undefined> {
  const patch = clean(input, true);
  if (Object.keys(patch).length === 0) return getQuotation(id);
  const [r] = await db.update(quotations).set(patch as Partial<typeof quotations.$inferInsert>).where(eq(quotations.id, id)).returning();
  return r ? row<Quotation>(r) : undefined;
}

export async function deleteQuotation(id: string): Promise<boolean> {
  const r = await db.delete(quotations).where(eq(quotations.id, id)).returning({ id: quotations.id });
  return r.length > 0;
}
