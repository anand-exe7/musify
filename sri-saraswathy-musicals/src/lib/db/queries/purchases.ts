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
import { BRANCH_KEYS, isBranch, type Branch } from "@/lib/stock";
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
  paymentMode?: PurchasePaymentMode;
  notes?: string;
  lines: InwardBatchLine[];
}

export class PurchaseValidationError extends Error {}

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
export async function getPurchases(): Promise<(PurchaseRecord & { paymentsTotal: number; lines: PurchaseLineRecord[] })[]> {
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
  return list.map((p) => ({ ...p, paymentsTotal: byId.get(p.id) ?? 0, lines: linesById.get(p.id) ?? [] }));
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

export async function createPurchase(input: PurchaseInput, createdBy: string, allowedBranch: Branch | null): Promise<PurchaseWithLines> {
  if (!input.vendorId) throw new PurchaseValidationError("Vendor is required.");
  if (!input.batchId || !/^[\w-]{1,64}$/.test(input.batchId)) throw new PurchaseValidationError("Invalid batch id.");
  assertMode(input.paymentMode);
  assertDate(input.purchaseDate);
  await validateInwardBatch(input.lines, allowedBranch);
  // Only a full admin may change selling prices (staff have a price lock).
  if (allowedBranch !== null && input.lines.some((l) => l.newPrice !== undefined)) {
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
 *  taken from the client) so they can't drift from the GST split / goods. */
export interface PurchasePatch {
  invoiceNo?: string;
  purchaseDate?: string;
  cgst?: number;
  sgst?: number;
  igst?: number;
  amountPaid?: number;
  paymentMode?: PurchasePaymentMode;
  notes?: string;
}

export async function updatePurchase(id: string, patch: PurchasePatch): Promise<PurchaseRecord | undefined> {
  const existing = await getPurchase(id);
  if (!existing) return undefined;
  assertMode(patch.paymentMode);
  assertDate(patch.purchaseDate);
  if (patch.invoiceNo !== undefined && typeof patch.invoiceNo !== "string") throw new PurchaseValidationError("Invalid invoice number.");
  if (patch.notes !== undefined && typeof patch.notes !== "string") throw new PurchaseValidationError("Invalid notes.");

  const cgst = patch.cgst === undefined ? existing.cgst : paise("CGST", patch.cgst);
  const sgst = patch.sgst === undefined ? existing.sgst : paise("SGST", patch.sgst);
  const igst = patch.igst === undefined ? existing.igst : paise("IGST", patch.igst);
  const tax = cgst + sgst + igst;
  const totalAmount = existing.subtotal + tax;
  const amountPaid = patch.amountPaid === undefined ? existing.amountPaid : paise("Amount paid", patch.amountPaid);
  if (amountPaid + existing.paymentsTotal > totalAmount) {
    throw new PurchaseValidationError("Amount paid (including later payments) can't exceed the total.");
  }

  const set = definedOnly({
    invoiceNo: patch.invoiceNo,
    purchaseDate: patch.purchaseDate,
    paymentMode: patch.paymentMode,
    notes: patch.notes,
    cgst, sgst, igst, tax, totalAmount, amountPaid,
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
function splitAcrossBranches(amount: number, w: BranchWeights): Partial<Record<Branch, number>> {
  const goodsSum = BRANCH_KEYS.reduce((n, b) => n + w.goods[b], 0);
  const weights = goodsSum > 0 ? w.goods : w.qty;
  const used = BRANCH_KEYS.filter((b) => weights[b] > 0);
  const sum = used.reduce((n, b) => n + weights[b], 0);
  const out: Partial<Record<Branch, number>> = {};
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

  const heads = await db.select({ id: purchases.id, vendorId: purchases.vendorId, total: purchases.totalAmount })
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
    .select({ id: purchases.id, vendorId: purchases.vendorId, amountPaid: purchases.amountPaid })
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
  // Prorate header-paid with the same split used for the bill itself.
  const headerWeights = weightsByPurchase(headerSplits);
  for (const h of headerPaidRows) {
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

export async function vendorStatement(vendorId: string, branch: Branch | null = null): Promise<VendorStatementEntry[]> {
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
    if (branch && l.branch !== branch) continue; // branch staff only see their own lines
    if (!l.purchaseId) { legacy.push(l); continue; }
    const arr = linesByPurchase.get(l.purchaseId) ?? [];
    arr.push(toLine(l));
    linesByPurchase.set(l.purchaseId, arr);
  }

  // Each purchase's dominant branch is its short display label.
  const weights = weightsByPurchase(inwards);
  const dominant = new Map<string, Branch>();
  for (const [id, w] of weights.entries()) {
    const [b1, b2] = BRANCH_KEYS;
    const goodsSum = BRANCH_KEYS.reduce((n, b) => n + w.goods[b], 0);
    const key = goodsSum > 0 ? w.goods : w.qty;
    dominant.set(id, key[b1] >= key[b2] ? b1 : b2);
  }

  // A branch-scoped statement shows only purchases that landed stock in that
  // branch, at that branch's share of the bill (same split as the outstandings).
  const shareOf = (p: (typeof purch)[number], amount: number): number => {
    if (!branch) return amount;
    const w = weights.get(p.id);
    return w ? (splitAcrossBranches(amount, w)[branch] ?? 0) : 0;
  };

  const entries: VendorStatementEntry[] = [];
  for (const p of purch) {
    if (branch && !linesByPurchase.has(p.id)) continue;
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
    if (branch && pay.branch !== branch) continue;
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
    if (p.lines.length > 0 && !p.lines.some((l) => l.branch === input.branch)) {
      throw new PurchaseValidationError(`This purchase has no stock in ${input.branch}; pay it from a branch it was received into.`);
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

/* ──────────────────────────  Branch scoping helpers  ─────── */

/** A purchase is in-scope for a branch user when at least one of its lines
 *  landed in that branch. */
export async function purchaseIdsInBranch(branch: Branch): Promise<Set<string>> {
  const r = await db
    .selectDistinct({ purchaseId: stockInward.purchaseId })
    .from(stockInward)
    .where(eq(stockInward.branch, branch));
  const out = new Set<string>();
  for (const row of r) if (row.purchaseId) out.add(row.purchaseId);
  return out;
}

/** Branch staff see only their own branch's lines of a purchase; the other
 *  branch's items and unit costs are not theirs to read. */
export function scopePurchaseLines<T extends { lines: { branch: string }[] }>(p: T, access: Branch | "all"): T {
  return access === "all" ? p : { ...p, lines: p.lines.filter((l) => l.branch === access) };
}

/** True when `access` is full-admin, or the purchase has a line in that branch. */
export async function purchaseVisibleTo(purchaseId: string, access: Branch | "all"): Promise<boolean> {
  if (access === "all") return true;
  const [hit] = await db
    .select({ id: stockInward.id })
    .from(stockInward)
    .where(and(eq(stockInward.purchaseId, purchaseId), eq(stockInward.branch, access)))
    .limit(1);
  return !!hit;
}
