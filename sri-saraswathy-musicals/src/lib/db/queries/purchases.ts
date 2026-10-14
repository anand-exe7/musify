/**
 * Purchases — the header above `stock_inward` lines. A purchase is "one
 * receipt from a vendor": the vendor's invoice, its GST breakup, the amount
 * paid at the time, and a bag of line-items. Lines still live in
 * `stock_inward` (so stock-adjustment code paths are unchanged), but they
 * now link back to their parent via `purchase_id`.
 *
 * Writing a purchase is three steps:
 *   1. Insert the header (so the lines' FK resolves and the whole receipt
 *      has a single id to show the user).
 *   2. Insert each line via `createInward`, which bumps on-hand + cost.
 *      That function is idempotent by line-id, so a retried submission
 *      completes any missing lines without doubling stock.
 *   3. Recompute header money fields from the actual lines (cheap sanity
 *      check — the client's totals are authoritative but the subtotal
 *      from the lines must match them). We store what the client sent so
 *      a non-GST or discounted purchase can still carry a tax figure.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases, stockInward, vendorPayments, vendors } from "@/lib/db/schema";
import { HttpError } from "@/lib/api/errors";
import { genDocId } from "@/lib/ids";
import { BRANCH_KEYS, isBranch, type Branch, branchLabel } from "@/lib/stock";
import { setVariantPrice } from "./stockOps";
import { createInward, validateInwardBatch, type InwardBatchLine } from "./stock";
import { definedOnly, row, rows } from "./_util";

export type PurchasePaymentMode = "" | "CASH" | "UPI" | "CARD" | "BANK" | "OTHER" | "CREDIT";
const PAYMENT_MODES = ["", "CASH", "UPI", "CARD", "BANK", "OTHER", "CREDIT"] as const;

export interface PurchaseRecord {
  id: string;
  vendorId: string;
  invoiceNo: string;
  purchaseDate: string;
  subtotal: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  amountPaid: number;
  /** What each branch paid of `amountPaid` (absent on older purchases, which spread it by goods value). */
  paidAllocations?: Record<string, number>;
  /** Set on an opening-balance bill: the branch that owes it (it has no lines). */
  openingBranch?: string | null;
  paymentMode: PurchasePaymentMode;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface PurchaseLineRecord {
  id: string;
  purchaseId: string | null;
  vendorId: string;
  productId: string;
  productName: string;
  variant: string;
  quantity: number;
  unitCost: number;
  /** GST rate (%) the vendor charged on this line. */
  gst: number;
  branch: string;
  createdBy: string;
  inwardAt: string;
}

export interface PurchaseWithLines extends PurchaseRecord {
  lines: PurchaseLineRecord[];
  paymentsTotal: number;
}

export interface PurchaseInput {
  /** Client-generated id for the whole submission (used for the header id). */
  batchId: string;
  vendorId: string;
  invoiceNo?: string;
  purchaseDate?: string;
  subtotal: number;
  tax?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  totalAmount: number;
  amountPaid?: number;
  /** How much of `amountPaid` each branch pays. Optional when the stock all lands in one branch. */
  paidAllocations?: PaidAllocationInput[];
  paymentMode?: PurchasePaymentMode;
  notes?: string;
  lines: InwardBatchLine[];
}

export class PurchaseValidationError extends Error {}

export interface PaidAllocationInput { branch: string; amount: number }

function assertMode(m: unknown): asserts m is PurchasePaymentMode {
  if (m !== undefined && !PAYMENT_MODES.includes(m as PurchasePaymentMode)) {
    throw new PurchaseValidationError(`Unknown payment mode: ${String(m)}`);
  }
}

/** A whole-paise amount ≥ 0; `undefined` means 0. */
function paise(label: string, v: unknown): number {
  const n = v ?? 0;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
    throw new PurchaseValidationError(`${label} must be a whole number of paise ≥ 0.`);
  }
  return n;
}

/** True for a real calendar date written YYYY-MM-DD (rejects 2025-99-99, 2025-02-30). */
function isCalendarDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00.000Z`);
  return !isNaN(+t) && t.toISOString().slice(0, 10) === d;
}

function assertDate(d: unknown): void {
  if (d !== undefined && d !== "" && !(typeof d === "string" && isCalendarDate(d))) {
    throw new PurchaseValidationError("Purchase date must be a real date in YYYY-MM-DD.");
  }
}

/** A payment date: YYYY-MM-DD, or a full ISO timestamp (date part must be real). */
function assertPaidAt(d: unknown): void {
  if (d === undefined || d === "") return;
  const ok =
    typeof d === "string" &&
    (isCalendarDate(d) || (/^\d{4}-\d{2}-\d{2}T/.test(d) && isCalendarDate(d.slice(0, 10)) && !isNaN(Date.parse(d))));
  if (!ok) throw new PurchaseValidationError("Payment date must be a valid date (YYYY-MM-DD or ISO timestamp).");
}

/** When the purchase happened: the user-entered date, else when it was saved. */
function purchasedAt(p: { purchaseDate: string; createdAt: string }): string {
  return p.purchaseDate ? `${p.purchaseDate}T00:00:00.000Z` : p.createdAt;
}

/* ──────────────────────────  Reads  ────────────────────────── */

/** `amountPaid` is what was paid at purchase time; later part-payments live in
 *  vendor_payments and are surfaced here as `paymentsTotal`. Paid = both. */
export async function getPurchases(): Promise<(PurchaseRecord & { paymentsTotal: number; lines: PurchaseLineRecord[]; branchOwed: Record<string, number> })[]> {
  const list = rows<PurchaseRecord>(await db.select().from(purchases).orderBy(desc(purchases.createdAt)));
  const sums = await db
    .select({ purchaseId: vendorPayments.purchaseId, sum: sql<number>`COALESCE(SUM(${vendorPayments.amount}), 0)` })
    .from(vendorPayments)
    .where(sql`${vendorPayments.purchaseId} IS NOT NULL`)
    .groupBy(vendorPayments.purchaseId);
  const byId = new Map(sums.map((r) => [r.purchaseId as string, Number(r.sum)]));
  const lineRows = rows<PurchaseLineRecord>(
    await db.select().from(stockInward).where(sql`${stockInward.purchaseId} IS NOT NULL`).orderBy(stockInward.inwardAt),
  );
  const linesById = new Map<string, PurchaseLineRecord[]>();
  for (const l of lineRows) {
    const arr = linesById.get(l.purchaseId as string) ?? [];
    arr.push(l);
    linesById.set(l.purchaseId as string, arr);
  }
  const byBranch = await db
    .select({ purchaseId: vendorPayments.purchaseId, branch: vendorPayments.branch, sum: sql<number>`COALESCE(SUM(${vendorPayments.amount}), 0)` })
    .from(vendorPayments)
    .where(sql`${vendorPayments.purchaseId} IS NOT NULL`)
    .groupBy(vendorPayments.purchaseId, vendorPayments.branch);
  const laterByBill = new Map<string, Record<string, number>>();
  for (const r of byBranch) {
    const m = laterByBill.get(r.purchaseId as string) ?? {};
    m[r.branch] = Number(r.sum);
    laterByBill.set(r.purchaseId as string, m);
  }
  return list.map((p) => {
    const lines = linesById.get(p.id) ?? [];
    return { ...p, paymentsTotal: byId.get(p.id) ?? 0, lines, branchOwed: branchOwedOn(p, lines, laterByBill.get(p.id) ?? {}) };
  });
}

/**
 * What each branch still owes on one bill: its share of the total (by the goods it
 * took) minus what that branch has paid (at purchase and later). Never below 0.
 * Every branch that received stock is listed, even at 0.
 */
export function branchOwedOn(
  p: { totalAmount: number; amountPaid: number; paidAllocations?: Record<string, number>; openingBranch?: string | null },
  lines: { branch: string; quantity: number; unitCost: number }[],
  later: Record<string, number>,
): Record<string, number> {
  if (p.openingBranch) return { [p.openingBranch]: Math.max(0, p.totalAmount - p.amountPaid - Object.values(later).reduce((n, v) => n + v, 0)) };
  const goods: Record<string, number> = {};
  for (const l of lines) goods[l.branch] = (goods[l.branch] ?? 0) + l.quantity * l.unitCost;
  const branches = Object.keys(goods);
  if (branches.length === 0) return {};
  const sum = branches.reduce((n, b) => n + goods[b], 0);
  const share = splitByWeightsPlain(p.totalAmount, goods, sum);
  const atPurchase = p.paidAllocations ?? (p.amountPaid > 0 ? splitByWeightsPlain(p.amountPaid, goods, sum) : {});
  const out: Record<string, number> = {};
  for (const b of branches) out[b] = Math.max(0, (share[b] ?? 0) - (atPurchase[b] ?? 0) - (later[b] ?? 0));
  return out;
}

function splitByWeightsPlain(amount: number, w: Record<string, number>, sum: number): Record<string, number> {
  const bs = Object.keys(w);
  const out: Record<string, number> = {};
  let left = amount;
  bs.forEach((b, i) => {
    const part = i === bs.length - 1 ? left : sum > 0 ? Math.round((amount * w[b]) / sum) : Math.round(amount / bs.length);
    out[b] = part;
    left -= part;
  });
  return out;
}

export async function getPurchase(id: string): Promise<PurchaseWithLines | undefined> {
  const [header] = await db.select().from(purchases).where(eq(purchases.id, id)).limit(1);
  if (!header) return undefined;
  const lines = rows<PurchaseLineRecord>(
    await db.select().from(stockInward).where(eq(stockInward.purchaseId, id)).orderBy(stockInward.inwardAt),
  );
  const payRows = await db.select({ sum: sql<number>`COALESCE(SUM(${vendorPayments.amount}), 0)` })
    .from(vendorPayments)
    .where(eq(vendorPayments.purchaseId, id));
  const paymentsTotal = Number(payRows[0]?.sum ?? 0);
  return { ...row<PurchaseRecord>(header), lines, paymentsTotal };
}

/* ──────────────────────────  Create  ────────────────────────── */

/**
 * How a paid amount is split across branches, the same way stock is: the person
 * says how much each branch pays and the shares must add up to the amount. Each
 * branch has to be one that received stock on the purchase (and, for staff, one of
 * their own). With stock going to a single branch the split can be left out.
 * Nothing paid means no split.
 */
function resolvePaidAllocations(
  amountPaid: number,
  given: PaidAllocationInput[] | undefined,
  receiving: string[],
  allowed: Branch[] | null,
): Record<string, number> | null {
  if (amountPaid <= 0) return null;
  const list = (given ?? []).filter((a) => a && a.amount !== 0);
  if (list.length === 0) {
    if (receiving.length === 1) return { [receiving[0]]: amountPaid };
    throw new PurchaseValidationError("Split the amount paid across the branches (it must add up to the amount paid).");
  }
  const out: Record<string, number> = {};
  for (const a of list) {
    if (!isBranch(a.branch)) throw new PurchaseValidationError("Unknown branch in the payment split.");
    if (!Number.isInteger(a.amount) || a.amount < 0) throw new PurchaseValidationError("Each branch's share must be a whole number of paise.");
    if (out[a.branch] !== undefined) throw new PurchaseValidationError("A branch appears twice in the payment split.");
    if (allowed && !allowed.includes(a.branch)) {
      throw new PurchaseValidationError(`You can only record a payment for ${allowed.map(branchLabel).join(" or ")}.`);
    }
    if (!receiving.includes(a.branch)) {
      throw new PurchaseValidationError(`${branchLabel(a.branch)} isn't receiving any stock on this purchase; pick a branch that is.`);
    }
    out[a.branch] = a.amount;
  }
  const sum = Object.values(out).reduce((n, v) => n + v, 0);
  if (sum !== amountPaid) {
    throw new PurchaseValidationError(`The branch shares (${sum}) don't add up to the amount paid (${amountPaid}).`);
  }
  return out;
}

export async function createPurchase(input: PurchaseInput, createdBy: string, allowed: Branch[] | null): Promise<PurchaseWithLines> {
  if (!input.vendorId) throw new PurchaseValidationError("Vendor is required.");
  if (!input.batchId || !/^[\w-]{1,64}$/.test(input.batchId)) throw new PurchaseValidationError("Invalid batch id.");
  assertMode(input.paymentMode);
  assertDate(input.purchaseDate);
  await validateInwardBatch(input.lines, allowed);
  // Only a full admin may change selling prices (staff have a price lock).
  if (allowed !== null && input.lines.some((l) => l.newPrice !== undefined)) {
    throw new PurchaseValidationError("Only an admin can change selling prices.");
  }
  const [vendor] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
  if (!vendor) throw new PurchaseValidationError("Unknown vendor.");

  // Lines compute their own goods subtotal; the header's subtotal must agree
  // with it so analytics don't disagree with the ledger.
  const lineSubtotal = input.lines.reduce((n, l) => n + l.quantity * l.unitCost, 0);
  if (input.subtotal !== lineSubtotal) {
    throw new PurchaseValidationError(`Subtotal (${input.subtotal}) doesn't match the line items (${lineSubtotal}).`);
  }
  const cgst = paise("CGST", input.cgst);
  const sgst = paise("SGST", input.sgst);
  const igst = paise("IGST", input.igst);
  const tax = cgst + sgst + igst;
  if (input.tax !== undefined && input.tax !== tax) {
    throw new PurchaseValidationError(`Tax (${input.tax}) doesn't match CGST + SGST + IGST (${tax}).`);
  }
  const totalAmount = lineSubtotal + tax;
  if (input.totalAmount !== undefined && input.totalAmount !== totalAmount) {
    throw new PurchaseValidationError(`Total (${input.totalAmount}) doesn't match goods + tax (${totalAmount}).`);
  }
  const amountPaid = paise("Amount paid", input.amountPaid);
  if (amountPaid > totalAmount) {
    throw new PurchaseValidationError("Amount paid can't exceed the total.");
  }
  const receivingNow = [...new Set(input.lines.flatMap((l) => l.allocations.filter((a) => a.quantity > 0).map((a) => a.branch)))];
  const paidAllocations = resolvePaidAllocations(amountPaid, input.paidAllocations, receivingNow, allowed);

  // Derived from the whole batch id (no year, no truncation) so a retry always
  // lands on the same header and two different batches never share one.
  const headerId = `PUR-${input.batchId}`;
  const headerRow = {
    id: headerId,
    vendorId: input.vendorId,
    invoiceNo: input.invoiceNo ?? "",
    purchaseDate: input.purchaseDate || new Date().toISOString().slice(0, 10),
    subtotal: lineSubtotal,
    tax,
    cgst,
    sgst,
    igst,
    totalAmount,
    amountPaid,
    paidAllocations,
    paymentMode: input.paymentMode ?? "",
    notes: input.notes ?? "",
    createdBy,
    createdAt: new Date().toISOString(),
  };

  // Header first, idempotent on retry (same batch id → same header id).
  const [savedHeader] = await db.insert(purchases).values(headerRow).onConflictDoNothing().returning();
  if (!savedHeader) {
    const existing = await getPurchase(headerId);
    const same =
      !!existing &&
      existing.vendorId === headerRow.vendorId &&
      existing.subtotal === headerRow.subtotal &&
      existing.cgst === headerRow.cgst &&
      existing.sgst === headerRow.sgst &&
      existing.igst === headerRow.igst &&
      existing.totalAmount === headerRow.totalAmount &&
      existing.lines.length <= input.lines.reduce((n, l) => n + l.allocations.filter((a) => a.quantity > 0).length, 0);
    if (!same) {
      throw new PurchaseValidationError("This batch id was already used for a different purchase.");
    }
  }

  // Now the lines — createInward is idempotent by id, so a retried call just
  // returns the previously-saved row without bumping stock a second time.
  let n = 0;
  for (const l of input.lines) {
    for (const a of l.allocations) {
      if (a.quantity <= 0) continue;
      n += 1;
      const lineId = `${input.batchId}-${n}`;
      const saved = await createInward({
        id: lineId,
        purchaseId: headerId,
        vendorId: input.vendorId,
        productId: l.productId,
        variantIndex: l.variantIndex,
        quantity: a.quantity,
        unitCost: l.unitCost,
        gst: l.gst ?? 0,
        branch: a.branch,
        createdBy,
      });
      // The parent is written with the row. Only a line saved unlinked by an
      // earlier, interrupted attempt needs stamping now.
      if (saved.purchaseId !== headerId) {
        await db.update(stockInward).set({ purchaseId: headerId }).where(eq(stockInward.id, saved.id));
      }
    }
    // Opt-in: the user ticked "update selling price" for this line.
    if (l.newPrice !== undefined) await setVariantPrice(l.productId, l.variantIndex, l.newPrice);
  }

  const full = await getPurchase(headerId);
  if (!full) throw new HttpError(500, "Purchase saved but could not be re-read.");
  return full;
}

/* ──────────────────────────  Edit  ────────────────────────── */

/** Fields an admin may edit after the fact. Tax and total are derived (never
 *  taken from the client) so they can't drift from the GST split / goods. Lines
 *  can change cost and GST %, not product or quantity (that would move stock). */
export interface PurchasePatch {
  invoiceNo?: string;
  purchaseDate?: string;
  cgst?: number;
  sgst?: number;
  igst?: number;
  amountPaid?: number;
  /** How much of the paid-at-purchase amount each branch pays. */
  paidAllocations?: PaidAllocationInput[];
  paymentMode?: PurchasePaymentMode;
  notes?: string;
  lines?: { id: string; unitCost?: number; gst?: number }[];
  /** Opening-balance bills only: the amount owed. */
  openingAmount?: number;
}

export async function updatePurchase(id: string, patch: PurchasePatch): Promise<PurchaseRecord | undefined> {
  const existing = await getPurchase(id);
  if (!existing) return undefined;
  assertMode(patch.paymentMode);
  assertDate(patch.purchaseDate);
  if (patch.invoiceNo !== undefined && typeof patch.invoiceNo !== "string") throw new PurchaseValidationError("Invalid invoice number.");
  if (patch.notes !== undefined && typeof patch.notes !== "string") throw new PurchaseValidationError("Invalid notes.");

  // Line edits are validated up front and written once everything checks out.
  const lineEdits = new Map<string, { unitCost?: number; gst?: number }>();
  for (const e of patch.lines ?? []) {
    if (!existing.lines.some((l) => l.id === e.id)) throw new PurchaseValidationError("That line isn't part of this purchase.");
    if (e.unitCost !== undefined) paise("Unit cost", e.unitCost);
    if (e.gst !== undefined && (!Number.isInteger(e.gst) || e.gst < 0 || e.gst > 100)) {
      throw new PurchaseValidationError("GST % must be a whole number from 0 to 100.");
    }
    lineEdits.set(e.id, { unitCost: e.unitCost, gst: e.gst });
  }
  if (existing.openingBranch) return updateOpeningBalance(existing, patch);
  const hasLines = existing.lines.length > 0;
  const subtotal = hasLines
    ? existing.lines.reduce((n, l) => n + l.quantity * (lineEdits.get(l.id)?.unitCost ?? l.unitCost), 0)
    : existing.subtotal;

  const cgst = patch.cgst === undefined ? existing.cgst : paise("CGST", patch.cgst);
  const sgst = patch.sgst === undefined ? existing.sgst : paise("SGST", patch.sgst);
  const igst = patch.igst === undefined ? existing.igst : paise("IGST", patch.igst);
  const tax = cgst + sgst + igst;
  const totalAmount = subtotal + tax;
  const amountPaid = patch.amountPaid === undefined ? existing.amountPaid : paise("Amount paid", patch.amountPaid);
  if (amountPaid + existing.paymentsTotal > totalAmount) {
    throw new PurchaseValidationError("Amount paid (including later payments) can't exceed the total.");
  }

  // The paid-now amount stays split across branches that actually received stock.
  const receiving = [...new Set(existing.lines.map((l) => l.branch))];
  let paidAllocations: Record<string, number> | null | undefined;
  if (amountPaid <= 0) {
    paidAllocations = null;
  } else if (patch.paidAllocations !== undefined) {
    paidAllocations = resolvePaidAllocations(amountPaid, patch.paidAllocations, receiving, null);
  } else if (existing.paidAllocations) {
    const kept = Object.values(existing.paidAllocations).reduce((n, v) => n + v, 0);
    if (kept !== amountPaid) {
      if (receiving.length === 1) paidAllocations = { [receiving[0]]: amountPaid };
      else throw new PurchaseValidationError("Split the new amount paid across the branches.");
    }
  } else if (amountPaid !== existing.amountPaid) {
    // An older purchase (no split on record) whose paid amount changed needs one now.
    paidAllocations = resolvePaidAllocations(amountPaid, undefined, receiving, null);
  }

  for (const [lineId, e] of lineEdits) {
    const set = definedOnly({ unitCost: e.unitCost, gst: e.gst }) as Partial<typeof stockInward.$inferInsert>;
    if (Object.keys(set).length > 0) await db.update(stockInward).set(set).where(eq(stockInward.id, lineId));
  }

  const set = definedOnly({
    invoiceNo: patch.invoiceNo,
    purchaseDate: patch.purchaseDate,
    paymentMode: patch.paymentMode,
    notes: patch.notes,
    paidAllocations,
    cgst, sgst, igst, tax, totalAmount, amountPaid,
    subtotal,
  }) as Partial<typeof purchases.$inferInsert>;
  const [r] = await db.update(purchases).set(set).where(eq(purchases.id, id)).returning();
  return r ? row<PurchaseRecord>(r) : undefined;
}

/* ──────────────────────────  Rollups for analytics / outstandings  ─────── */

/**
 * What we owe each vendor per branch, GST included. A purchase's total (goods +
 * tax) is split across branches in proportion to its line values; stock that
 * predates purchase headers (no purchase_id) counts at goods cost.
 */
/** Per-branch goods value and unit count of one purchase's lines. */
interface BranchWeights { goods: Record<Branch, number>; qty: Record<Branch, number> }

const zeroByBranch = () => Object.fromEntries(BRANCH_KEYS.map((b) => [b, 0])) as Record<Branch, number>;

/**
 * Split `amount` (a bill total, or the part of it paid up front) across the
 * branches a purchase landed in, by goods value, or by unit count when the goods
 * are free. Every share is computed here so outstandings and statements agree,
 * and the leftover paise go to the last branch so the shares sum to `amount`.
 */
function splitAcrossBranches(amount: number, w: BranchWeights): Record<Branch, number> {
  const goodsSum = BRANCH_KEYS.reduce((n, b) => n + w.goods[b], 0);
  const weights = goodsSum > 0 ? w.goods : w.qty;
  const used = BRANCH_KEYS.filter((b) => weights[b] > 0);
  const sum = used.reduce((n, b) => n + weights[b], 0);
  const out: Record<Branch, number> = {};
  let left = amount;
  used.forEach((b, i) => {
    const share = i === used.length - 1 ? left : Math.round((amount * weights[b]) / sum);
    left -= share;
    out[b] = share;
  });
  return out;
}

/** Line weights per purchase id, from stock_inward rows grouped by (purchase, branch). */
function weightsByPurchase(
  lineRows: { purchaseId: string | null; branch: string; goods: unknown; qty: unknown }[],
): Map<string, BranchWeights> {
  const m = new Map<string, BranchWeights>();
  for (const r of lineRows) {
    if (!r.purchaseId || !isBranch(r.branch)) continue;
    const w = m.get(r.purchaseId) ?? { goods: zeroByBranch(), qty: zeroByBranch() };
    w.goods[r.branch] = Number(r.goods);
    w.qty[r.branch] = Number(r.qty);
    m.set(r.purchaseId, w);
  }
  return m;
}

const goodsSql = sql<number>`COALESCE(SUM(${stockInward.quantity} * ${stockInward.unitCost}), 0)`;
const qtySql = sql<number>`COALESCE(SUM(${stockInward.quantity}), 0)`;

async function purchasedByVendorBranch(vendorId?: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const add = (v: string, b: Branch, n: number) => out.set(`${v}::${b}`, (out.get(`${v}::${b}`) ?? 0) + n);

  const heads = await db.select({ id: purchases.id, vendorId: purchases.vendorId, total: purchases.totalAmount, openingBranch: purchases.openingBranch })
    .from(purchases)
    .where(vendorId ? eq(purchases.vendorId, vendorId) : undefined);
  const lineRows = await db
    .select({
      vendorId: stockInward.vendorId,
      purchaseId: stockInward.purchaseId,
      branch: stockInward.branch,
      goods: goodsSql,
      qty: qtySql,
    })
    .from(stockInward)
    .where(vendorId ? eq(stockInward.vendorId, vendorId) : undefined)
    .groupBy(stockInward.vendorId, stockInward.purchaseId, stockInward.branch);

  // Lines without a header (interrupted save) count at goods cost until stamped.
  for (const r of lineRows) {
    if (!r.purchaseId && isBranch(r.branch)) add(r.vendorId, r.branch, Number(r.goods));
  }
  const perHeader = weightsByPurchase(lineRows);
  for (const h of heads) {
    if (h.openingBranch) { if (isBranch(h.openingBranch)) add(h.vendorId, h.openingBranch, h.total); continue; }
    const w = perHeader.get(h.id);
    if (!w) continue; // header with no lines: no branch to charge it to
    for (const [b, share] of Object.entries(splitAcrossBranches(h.total, w))) add(h.vendorId, b as Branch, share);
  }
  return out;
}

/** Per-branch purchase totals for a vendor (GST included, no payments). */
export async function vendorBranchPurchaseTotals(vendorId: string): Promise<Record<Branch, number>> {
  const result = Object.fromEntries(BRANCH_KEYS.map((b) => [b, 0])) as Record<Branch, number>;
  const m = await purchasedByVendorBranch(vendorId);
  for (const b of BRANCH_KEYS) result[b] = m.get(`${vendorId}::${b}`) ?? 0;
  return result;
}

/** All vendors' outstandings in one query — one row per (vendorId, branch). */
export interface VendorOutstandingRow {
  vendorId: string;
  branch: Branch;
  purchased: number;
  paid: number;
  outstanding: number;
}

export async function vendorOutstandings(): Promise<VendorOutstandingRow[]> {
  // Payments carry their own branch stamp.
  const paymentRows = await db
    .select({
      vendorId: vendorPayments.vendorId,
      branch: vendorPayments.branch,
      total: sql<number>`COALESCE(SUM(${vendorPayments.amount}), 0)`,
    })
    .from(vendorPayments)
    .groupBy(vendorPayments.vendorId, vendorPayments.branch);

  // Header-level amount_paid is "first payment attached to the receipt". Split
  // it by lines in the same ratio as goods, so a mixed-branch purchase charges
  // each branch's share correctly.
  const headerPaidRows = await db
    .select({ id: purchases.id, vendorId: purchases.vendorId, amountPaid: purchases.amountPaid, paidAllocations: purchases.paidAllocations })
    .from(purchases)
    .where(sql`${purchases.amountPaid} > 0`);

  // Line totals per header, so we can prorate header-paid across branches.
  const headerIds = headerPaidRows.map((h) => h.id);
  const headerSplits = headerIds.length
    ? await db
        .select({
          purchaseId: stockInward.purchaseId,
          branch: stockInward.branch,
          goods: goodsSql,
          qty: qtySql,
        })
        .from(stockInward)
        .where(inArray(stockInward.purchaseId, headerIds))
        .groupBy(stockInward.purchaseId, stockInward.branch)
    : [];

  const map = new Map<string, VendorOutstandingRow>();
  const bump = (vendorId: string, branch: Branch, deltaP: number, deltaY: number) => {
    const key = `${vendorId}::${branch}`;
    const prev = map.get(key) ?? { vendorId, branch, purchased: 0, paid: 0, outstanding: 0 };
    prev.purchased += deltaP;
    prev.paid += deltaY;
    prev.outstanding = prev.purchased - prev.paid;
    map.set(key, prev);
  };

  for (const [key, total] of await purchasedByVendorBranch()) {
    const [vId, br] = key.split("::");
    if (isBranch(br)) bump(vId, br, total, 0);
  }
  for (const r of paymentRows) {
    if (isBranch(r.branch)) bump(r.vendorId, r.branch, 0, Number(r.total));
  }
  // The paid-now amount goes to the branches it was recorded against. Purchases
  // from before that was captured (no split) keep the old by-goods spread.
  const headerWeights = weightsByPurchase(headerSplits);
  for (const h of headerPaidRows) {
    if (h.paidAllocations) {
      for (const [b, amt] of Object.entries(h.paidAllocations)) if (isBranch(b) && amt > 0) bump(h.vendorId, b, 0, amt);
      continue;
    }
    const w = headerWeights.get(h.id);
    if (!w) continue;
    for (const [b, share] of Object.entries(splitAcrossBranches(h.amountPaid, w))) {
      if (share > 0) bump(h.vendorId, b as Branch, 0, share);
    }
  }
  return [...map.values()].sort((a, b) => (a.vendorId === b.vendorId ? a.branch.localeCompare(b.branch) : a.vendorId.localeCompare(b.vendorId)));
}

/** Statement for one vendor: every purchase + every payment, oldest first. */
export interface VendorStatementEntry {
  kind: "purchase" | "payment";
  id: string;
  at: string;
  branch?: Branch | null;
  amount: number; // + for purchase, − for payment
  reference?: string;
  invoiceNo?: string;
  mode?: string;
  /** Items bought (purchase entries only). */
  lines?: VendorStatementLine[];
}

export interface VendorStatementLine {
  productName: string;
  variant: string;
  quantity: number;
  unitCost: number;
  branch: string;
}

/** `scope` limits the ledger to those branches (`null` = every branch). */
export async function vendorStatement(vendorId: string, scope: Branch[] | null = null): Promise<VendorStatementEntry[]> {
  const [purch, pays, inwards, lineRows] = await Promise.all([
    db.select().from(purchases).where(eq(purchases.vendorId, vendorId)),
    db.select().from(vendorPayments).where(eq(vendorPayments.vendorId, vendorId)),
    db
      .select({ purchaseId: stockInward.purchaseId, branch: stockInward.branch, goods: goodsSql, qty: qtySql })
      .from(stockInward)
      .where(eq(stockInward.vendorId, vendorId))
      .groupBy(stockInward.purchaseId, stockInward.branch),
    db.select().from(stockInward).where(eq(stockInward.vendorId, vendorId)).orderBy(stockInward.inwardAt),
  ]);

  const toLine = (l: (typeof lineRows)[number]): VendorStatementLine => ({
    productName: l.productName,
    variant: l.variant,
    quantity: l.quantity,
    unitCost: l.unitCost,
    branch: l.branch,
  });
  const linesByPurchase = new Map<string, VendorStatementLine[]>();
  const legacy: typeof lineRows = [];
  for (const l of lineRows) {
    if (scope && !scope.includes(l.branch)) continue; // branch staff only see their own lines
    if (!l.purchaseId) { legacy.push(l); continue; }
    const arr = linesByPurchase.get(l.purchaseId) ?? [];
    arr.push(toLine(l));
    linesByPurchase.set(l.purchaseId, arr);
  }

  // Each purchase's dominant branch is its short display label.
  const weights = weightsByPurchase(inwards);
  const dominant = new Map<string, Branch>();
  for (const [id, w] of weights.entries()) {
    const goodsSum = BRANCH_KEYS.reduce((n, b) => n + w.goods[b], 0);
    const key = goodsSum > 0 ? w.goods : w.qty;
    dominant.set(id, BRANCH_KEYS.reduce((best, b) => (key[b] > key[best] ? b : best), BRANCH_KEYS[0]));
  }

  // A branch-scoped statement shows only purchases that landed stock in those
  // branches, at their share of the bill (same split as the outstandings).
  const shareOf = (p: (typeof purch)[number], amount: number): number => {
    if (!scope) return amount;
    const w = weights.get(p.id);
    if (!w) return 0;
    const split = splitAcrossBranches(amount, w);
    return scope.reduce((n, b) => n + (split[b] ?? 0), 0);
  };

  const entries: VendorStatementEntry[] = [];
  for (const p of purch) {
    if (p.openingBranch) {
      if (scope && !scope.includes(p.openingBranch)) continue;
      entries.push({
        kind: "purchase", id: p.id, at: purchasedAt(p),
        branch: isBranch(p.openingBranch) ? p.openingBranch : null,
        amount: p.totalAmount, invoiceNo: "Opening balance", lines: [],
      });
      continue;
    }
    if (scope && !linesByPurchase.has(p.id)) continue;
    entries.push({
      kind: "purchase",
      id: p.id,
      at: purchasedAt(p),
      branch: dominant.get(p.id) ?? null,
      amount: shareOf(p, p.totalAmount),
      invoiceNo: p.invoiceNo,
      lines: linesByPurchase.get(p.id) ?? [],
    });
    if (p.amountPaid > 0) {
      const split = p.paidAllocations ? Object.entries(p.paidAllocations).filter(([b, v]) => isBranch(b) && v > 0) : null;
      if (split) {
        // One entry per paying branch; a branch-scoped ledger shows only its own.
        for (const [b, amt] of split) {
          if (scope && !scope.includes(b)) continue;
          entries.push({
            kind: "payment",
            id: split.length === 1 ? `${p.id}:initial` : `${p.id}:initial:${b}`,
            at: purchasedAt(p),
            branch: b,
            amount: amt,
            mode: p.paymentMode,
            reference: "At purchase",
          });
        }
      } else {
        // Older purchases: spread by goods value.
        entries.push({
          kind: "payment",
          id: `${p.id}:initial`,
          at: purchasedAt(p),
          branch: dominant.get(p.id) ?? null,
          amount: shareOf(p, p.amountPaid),
          mode: p.paymentMode,
          reference: "At purchase",
        });
      }
    }
  }
  // Stock received before purchase headers existed still counts toward the
  // vendor's purchased total, so surface each such line as its own entry.
  for (const l of legacy) {
    entries.push({
      kind: "purchase",
      id: l.id,
      at: l.inwardAt,
      branch: isBranch(l.branch) ? l.branch : null,
      amount: l.quantity * l.unitCost,
      lines: [toLine(l)],
    });
  }
  for (const pay of pays) {
    if (scope && !scope.includes(pay.branch)) continue;
    entries.push({
      kind: "payment",
      id: pay.id,
      at: pay.paidAt,
      branch: isBranch(pay.branch) ? pay.branch : null,
      amount: pay.amount,
      mode: pay.mode,
      reference: pay.reference,
    });
  }
  entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return entries;
}

/* ──────────────────────────  Payments  ─────────────────── */

export interface VendorPaymentInput {
  vendorId: string;
  purchaseId?: string | null;
  branch: Branch;
  amount: number;
  mode: "CASH" | "UPI" | "CARD" | "BANK" | "OTHER";
  reference?: string;
  paidAt?: string;
  notes?: string;
}

export async function createVendorPayment(input: VendorPaymentInput, createdBy: string): Promise<typeof vendorPayments.$inferSelect> {
  if (!input.vendorId) throw new PurchaseValidationError("Vendor is required.");
  if (!isBranch(input.branch)) throw new PurchaseValidationError("Unknown branch.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new PurchaseValidationError("Amount must be a whole number of paise > 0.");
  if (!["CASH", "UPI", "CARD", "BANK", "OTHER"].includes(input.mode)) throw new PurchaseValidationError("Unknown payment mode.");
  assertPaidAt(input.paidAt);
  const [vendor] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
  if (!vendor) throw new PurchaseValidationError("Unknown vendor.");
  if (input.purchaseId) {
    const p = await getPurchase(input.purchaseId);
    if (!p || p.vendorId !== input.vendorId) throw new PurchaseValidationError("Purchase not found.");
    // The payment must come out of a branch the purchase actually landed stock in,
    // otherwise per-branch outstandings drift (one branch stays owing, another goes negative).
    if (p.openingBranch && p.openingBranch !== input.branch) {
      throw new PurchaseValidationError(`This opening balance is owed by ${branchLabel(p.openingBranch)}; pay it from there.`);
    }
    if (p.lines.length > 0 && !p.lines.some((l) => l.branch === input.branch)) {
      throw new PurchaseValidationError(`This purchase has no stock in ${branchLabel(input.branch)}; pay it from a branch it was received into.`);
    }
    if (input.amount > p.totalAmount - p.amountPaid - p.paymentsTotal) throw new PurchaseValidationError("Payment exceeds the purchase's balance.");
  }

  const rec = {
    id: genDocId("PAY"),
    vendorId: input.vendorId,
    purchaseId: input.purchaseId ?? null,
    branch: input.branch,
    amount: input.amount,
    mode: input.mode,
    reference: input.reference ?? "",
    paidAt: input.paidAt || new Date().toISOString(),
    notes: input.notes ?? "",
    createdBy,
    createdAt: new Date().toISOString(),
  };
  const [saved] = await db.insert(vendorPayments).values(rec).returning();

  // The balance check above and this insert aren't atomic (the Neon HTTP driver
  // has no transactions), so re-check once the row is in. If racing payments
  // overpaid the bill, only the newest of them (createdAt, then id) withdraws, so
  // the earlier one stands instead of every racer failing.
  if (input.purchaseId) {
    const after = await getPurchase(input.purchaseId);
    if (after && after.amountPaid + after.paymentsTotal > after.totalAmount) {
      const [newest] = await db
        .select({ id: vendorPayments.id })
        .from(vendorPayments)
        .where(eq(vendorPayments.purchaseId, input.purchaseId))
        .orderBy(desc(vendorPayments.createdAt), desc(vendorPayments.id))
        .limit(1);
      if (newest?.id === saved.id) {
        await db.delete(vendorPayments).where(eq(vendorPayments.id, saved.id));
        throw new PurchaseValidationError("Payment exceeds the purchase's balance (someone else just paid it). Refresh and retry.");
      }
    }
  }
  return saved;
}

/**
 * Pay part of ONE purchase from several branches at once, like splitting stock:
 * each branch pays its own amount. Everything is checked first; if a later row
 * fails the earlier ones are withdrawn so the bill never ends up half-paid.
 */
export async function createVendorPaymentSplit(
  input: Omit<VendorPaymentInput, "branch" | "amount"> & { purchaseId: string; allocations: PaidAllocationInput[] },
  createdBy: string,
  allowed: Branch[] | null,
): Promise<Array<typeof vendorPayments.$inferSelect>> {
  const list = (input.allocations ?? []).filter((a) => a && a.amount !== 0);
  if (list.length === 0) throw new PurchaseValidationError("Enter an amount for at least one branch.");
  const seen = new Set<string>();
  for (const a of list) {
    if (!isBranch(a.branch)) throw new PurchaseValidationError("Unknown branch in the payment split.");
    if (!Number.isInteger(a.amount) || a.amount <= 0) throw new PurchaseValidationError("Each branch's share must be a whole number of paise > 0.");
    if (seen.has(a.branch)) throw new PurchaseValidationError("A branch appears twice in the payment split.");
    seen.add(a.branch);
    if (allowed && !allowed.includes(a.branch)) {
      throw new PurchaseValidationError(`You can only record a payment for ${allowed.map(branchLabel).join(" or ")}.`);
    }
  }
  const p = await getPurchase(input.purchaseId);
  if (!p || p.vendorId !== input.vendorId) throw new PurchaseValidationError("Purchase not found.");
  const total = list.reduce((n, a) => n + a.amount, 0);
  if (total > p.totalAmount - p.amountPaid - p.paymentsTotal) throw new PurchaseValidationError("Payment exceeds the purchase's balance.");

  const saved: Array<typeof vendorPayments.$inferSelect> = [];
  try {
    for (const a of list) {
      saved.push(await createVendorPayment({ ...input, branch: a.branch as Branch, amount: a.amount }, createdBy));
    }
  } catch (e) {
    for (const r of saved) await db.delete(vendorPayments).where(eq(vendorPayments.id, r.id));
    throw e;
  }
  return saved;
}

/**
 * Pay several of one vendor's bills in a single go (the rows come from the "Pay
 * vendor" screen: which bill, which branch pays, how much). Every row is checked
 * first — each bill's total against its balance, each branch against the bill and the
 * user's access — and if one still fails the rows already saved are withdrawn.
 */
export async function payVendorBills(
  input: { vendorId: string; rows: { purchaseId: string; branch: string; amount: number }[]; mode: VendorPaymentInput["mode"]; reference?: string; paidAt?: string; notes?: string },
  createdBy: string,
  allowed: Branch[] | null,
): Promise<Array<typeof vendorPayments.$inferSelect>> {
  const rows = (input.rows ?? []).filter((r) => r && r.amount !== 0);
  if (rows.length === 0) throw new PurchaseValidationError("Enter an amount to pay.");
  const perBill = new Map<string, number>();
  for (const r of rows) {
    if (!isBranch(r.branch)) throw new PurchaseValidationError("Unknown branch in the payment.");
    if (!Number.isInteger(r.amount) || r.amount <= 0) throw new PurchaseValidationError("Each amount must be a whole number of paise > 0.");
    if (allowed && !allowed.includes(r.branch)) {
      throw new PurchaseValidationError(`You can only record a payment for ${allowed.map(branchLabel).join(" or ")}.`);
    }
    perBill.set(r.purchaseId, (perBill.get(r.purchaseId) ?? 0) + r.amount);
  }
  for (const [id, sum] of perBill) {
    const p = await getPurchase(id);
    if (!p || p.vendorId !== input.vendorId) throw new PurchaseValidationError("A bill in this payment isn't this vendor's.");
    if (sum > p.totalAmount - p.amountPaid - p.paymentsTotal) throw new PurchaseValidationError(`${p.invoiceNo || p.id} has less outstanding than that.`);
  }
  const saved: Array<typeof vendorPayments.$inferSelect> = [];
  try {
    for (const r of rows) {
      saved.push(await createVendorPayment({ vendorId: input.vendorId, purchaseId: r.purchaseId, branch: r.branch as Branch, amount: r.amount, mode: input.mode, reference: input.reference, paidAt: input.paidAt, notes: input.notes }, createdBy));
    }
  } catch (e) {
    for (const r of saved) await db.delete(vendorPayments).where(eq(vendorPayments.id, r.id));
    throw e;
  }
  return saved;
}

export async function getVendorPayments(vendorId?: string): Promise<Array<typeof vendorPayments.$inferSelect>> {
  if (vendorId) {
    return await db.select().from(vendorPayments).where(eq(vendorPayments.vendorId, vendorId)).orderBy(desc(vendorPayments.paidAt));
  }
  return await db.select().from(vendorPayments).orderBy(desc(vendorPayments.paidAt));
}

export async function deleteVendorPayment(id: string): Promise<boolean> {
  const r = await db.delete(vendorPayments).where(eq(vendorPayments.id, id)).returning({ id: vendorPayments.id });
  return r.length > 0;
}

/* ──────────────────────────  Opening balances  ─────────────── */

export interface OpeningBalanceInput { vendorId: string; branch: string; amount: number; asOf?: string; notes?: string }

/**
 * What we already owed a vendor before this system. It's stored as a bill with no
 * items (owed by one branch) so it shows in outstandings and the statement and can
 * be paid against like any other invoice.
 */
export async function createOpeningBalance(input: OpeningBalanceInput, createdBy: string): Promise<PurchaseWithLines> {
  if (!isBranch(input.branch)) throw new PurchaseValidationError("Unknown branch.");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new PurchaseValidationError("Opening balance must be more than 0.");
  assertDate(input.asOf);
  const [vendor] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, input.vendorId)).limit(1);
  if (!vendor) throw new PurchaseValidationError("Unknown vendor.");
  const [dup] = await db.select({ id: purchases.id }).from(purchases)
    .where(and(eq(purchases.vendorId, input.vendorId), eq(purchases.openingBranch, input.branch))).limit(1);
  if (dup) throw new PurchaseValidationError(`${branchLabel(input.branch)} already has an opening balance for this vendor; edit that one.`);
  const id = genDocId("OPB");
  await db.insert(purchases).values({
    id, vendorId: input.vendorId, invoiceNo: "Opening balance", purchaseDate: input.asOf ?? "",
    subtotal: input.amount, tax: 0, cgst: 0, sgst: 0, igst: 0, totalAmount: input.amount, amountPaid: 0,
    openingBranch: input.branch, notes: input.notes ?? "", createdBy, createdAt: new Date().toISOString(),
  });
  return (await getPurchase(id)) as PurchaseWithLines;
}

async function updateOpeningBalance(existing: PurchaseWithLines, patch: PurchasePatch): Promise<PurchaseRecord | undefined> {
  assertDate(patch.purchaseDate);
  const amount = patch.openingAmount === undefined ? existing.totalAmount : patch.openingAmount;
  if (!Number.isInteger(amount) || amount <= 0) throw new PurchaseValidationError("Opening balance must be more than 0.");
  if (amount < existing.paymentsTotal) throw new PurchaseValidationError("The balance can't be less than what's already been paid against it.");
  const set = definedOnly({
    purchaseDate: patch.purchaseDate, notes: typeof patch.notes === "string" ? patch.notes : undefined,
    subtotal: amount, totalAmount: amount,
  }) as Partial<typeof purchases.$inferInsert>;
  const [r] = await db.update(purchases).set(set).where(eq(purchases.id, existing.id)).returning();
  return r ? row<PurchaseRecord>(r) : undefined;
}

/** Remove an opening balance that nothing has been paid against yet. */
export async function deleteOpeningBalance(id: string): Promise<boolean> {
  const p = await getPurchase(id);
  if (!p?.openingBranch) throw new PurchaseValidationError("Only an opening balance can be removed here.");
  if (p.paymentsTotal > 0) throw new PurchaseValidationError("Payments are recorded against this balance; remove them first.");
  const r = await db.delete(purchases).where(eq(purchases.id, id)).returning({ id: purchases.id });
  return r.length > 0;
}

/* ──────────────────  Applying an unassigned payment to bills  ─────── */

/** Payments recorded for the vendor in general, from before every payment had to name a bill. */
export async function unappliedPayments(vendorId: string): Promise<Array<typeof vendorPayments.$inferSelect>> {
  return await db.select().from(vendorPayments)
    .where(and(eq(vendorPayments.vendorId, vendorId), sql`${vendorPayments.purchaseId} IS NULL`))
    .orderBy(vendorPayments.paidAt);
}

/**
 * Attach a vendor-level payment to specific bills. The shares must not exceed the
 * payment; whatever is left stays unassigned. The first share reuses the payment's
 * row and the rest become copies of it (same branch, mode and date), so branch
 * outstandings don't move. New rows are written before the original changes, so a
 * failure part-way leaves the payment whole.
 */
export async function applyPaymentToBills(
  paymentId: string,
  shares: { purchaseId: string; amount: number }[],
): Promise<void> {
  const [pay] = await db.select().from(vendorPayments).where(eq(vendorPayments.id, paymentId)).limit(1);
  if (!pay) throw new PurchaseValidationError("Payment not found.");
  if (pay.purchaseId) throw new PurchaseValidationError("This payment is already against a bill.");
  const list = (shares ?? []).filter((x) => x && x.amount !== 0);
  if (list.length === 0) throw new PurchaseValidationError("Pick at least one bill.");
  const seen = new Set<string>();
  let sum = 0;
  for (const x of list) {
    if (!Number.isInteger(x.amount) || x.amount <= 0) throw new PurchaseValidationError("Each share must be a whole number of paise > 0.");
    if (seen.has(x.purchaseId)) throw new PurchaseValidationError("A bill appears twice.");
    seen.add(x.purchaseId);
    sum += x.amount;
    const p = await getPurchase(x.purchaseId);
    if (!p || p.vendorId !== pay.vendorId) throw new PurchaseValidationError("Bill not found for this vendor.");
    if (x.amount > p.totalAmount - p.amountPaid - p.paymentsTotal) throw new PurchaseValidationError(`${p.invoiceNo || p.id} has less outstanding than that.`);
  }
  if (sum > pay.amount) throw new PurchaseValidationError("The shares add up to more than the payment.");

  const [first, ...rest] = list;
  for (const x of rest) {
    await db.insert(vendorPayments).values({ ...pay, id: genDocId("PAY"), purchaseId: x.purchaseId, amount: x.amount, createdAt: new Date().toISOString() });
  }
  if (sum < pay.amount) {
    await db.insert(vendorPayments).values({ ...pay, id: genDocId("PAY"), purchaseId: null, amount: pay.amount - sum, createdAt: new Date().toISOString() });
  }
  await db.update(vendorPayments).set({ purchaseId: first.purchaseId, amount: first.amount }).where(eq(vendorPayments.id, pay.id));
}

/* ──────────────────────────  Branch scoping helpers  ─────── */

/** A purchase is in-scope for a branch user when at least one of its lines
 *  landed in that branch. */
export async function purchaseIdsInBranch(branches: Branch[]): Promise<Set<string>> {
  if (branches.length === 0) return new Set();
  const r = await db
    .selectDistinct({ purchaseId: stockInward.purchaseId })
    .from(stockInward)
    .where(inArray(stockInward.branch, branches));
  const out = new Set<string>();
  for (const row of r) if (row.purchaseId) out.add(row.purchaseId);
  const opening = await db.select({ id: purchases.id }).from(purchases).where(inArray(purchases.openingBranch, branches));
  for (const o of opening) out.add(o.id);
  return out;
}

/** Branch staff see only their own branch's lines of a purchase; the other
 *  branch's items and unit costs are not theirs to read. */
export function scopePurchaseLines<T extends { lines: { branch: string }[] }>(p: T, scope: Branch[] | null): T {
  return scope === null ? p : { ...p, lines: p.lines.filter((l) => scope.includes(l.branch)) };
}

/** True when `scope` is unrestricted (`null`), or the purchase has a line in one of those branches. */
export async function purchaseVisibleTo(purchaseId: string, scope: Branch[] | null): Promise<boolean> {
  if (scope === null) return true;
  if (scope.length === 0) return false;
  const [hit] = await db
    .select({ id: stockInward.id })
    .from(stockInward)
    .where(and(eq(stockInward.purchaseId, purchaseId), inArray(stockInward.branch, scope)))
    .limit(1);
  if (hit) return true;
  const [open] = await db.select({ id: purchases.id }).from(purchases)
    .where(and(eq(purchases.id, purchaseId), inArray(purchases.openingBranch, scope))).limit(1);
  return !!open;
}
