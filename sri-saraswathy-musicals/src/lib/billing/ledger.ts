/**
 * Unified sales/tax ledger. Every sale — whether it comes from the web
 * storefront (`orders`) or the in-store POS (`pos_bills`) — also writes one row
 * into the `invoices` table, so there is a single GST ledger and one reporting
 * surface (the admin Invoices page).
 *
 * Both recorders are best-effort: a failure here is logged but never bubbles up
 * to fail the underlying sale.
 */
import { sql } from "drizzle-orm";
import { db, invoices } from "@/lib/db";
import { counters } from "@/lib/db/schema";
import { getInvoiceByRefId } from "@/lib/db/queries/invoices";
import { getAllProducts } from "@/lib/db/queries/products";
import { getGstSettings } from "@/lib/db/queries/settings";
import type { Order, Invoice } from "@/types";
import type { Bill } from "@/lib/store/pos";
import type { RepairTicket } from "@/lib/store/repair";

/**
 * Indian financial year label for a date, e.g. 2026-09-14 → "2026-27". The FY
 * runs 1 April → 31 March, so Jan–Mar belong to the year that started the
 * previous April. Used to scope the invoice series so it resets each FY.
 */
function financialYear(iso: string): string {
  const d = new Date(iso);
  const y = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const m = Number.isNaN(d.getTime()) ? new Date().getMonth() : d.getMonth(); // 0 = Jan
  const start = m >= 3 ? y : y - 1; // April (index 3) starts the FY
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * Next sequential GST tax-invoice number, e.g. `SSM/2026-27/0001`. The per-FY
 * counter is bumped atomically in a single upsert, so concurrent sales never
 * collide or skip. Stays within GST's 16-character limit for 4-digit runs.
 */
async function nextInvoiceNumber(dateIso: string): Promise<string> {
  const fy = financialYear(dateIso);
  const key = `invoice:${fy}`;
  const [r] = await db
    .insert(counters)
    .values({ key, value: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  const seq = r?.value ?? 1;
  return `SSM/${fy}/${String(seq).padStart(4, "0")}`;
}

async function insertInvoice(inv: Invoice): Promise<void> {
  await db.insert(invoices).values(inv);
}

/** Write a GST invoice row for a completed web order. */
export async function recordOrderInvoice(order: Order): Promise<void> {
  try {
    // One tax invoice per source order — never mint a second number on a retry.
    if (await getInvoiceByRefId(order.id)) return;
    const [products, gstCfg] = await Promise.all([getAllProducts(), getGstSettings()]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const intra =
      !order.shipState || order.shipState.trim().toLowerCase() === gstCfg.homeState.trim().toLowerCase();

    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    const items = order.items.map((it) => {
      const p = byId.get(it.productId);
      // Non-GST products (isGstApplicable=false) contribute to subtotal but are
      // never taxed, so mixed carts (taxable + exempt) come out right on the
      // invoice — CGST/SGST/IGST only accumulate from taxable lines.
      const taxable = p ? p.isGstApplicable !== false : true;
      const rate = taxable ? (p?.gstRate ?? gstCfg.standardRate) : 0;
      const amount = it.price * it.quantity;
      const g = (amount * rate) / 100;
      if (intra) {
        cgst += g / 2;
        sgst += g / 2;
      } else {
        igst += g;
      }
      return {
        name: p ? `${p.brand} ${p.name}` : it.productId,
        hsn: p?.hsn ?? "-",
        qty: it.quantity,
        rate: it.price,
        gst: rate,
        amount,
      };
    });

    const number = await nextInvoiceNumber(order.date);
    await insertInvoice({
      id: order.id,
      number,
      date: order.date,
      customer: order.customerName || "Online customer",
      branch: order.branch ?? "Branch 1",
      items,
      subtotal: order.subtotal,
      cgst: Math.round(cgst),
      sgst: Math.round(sgst),
      igst: Math.round(igst),
      total: order.total,
      paymentMode: order.paymentMethod || "razorpay",
      status: order.paymentMethod === "cod" ? "pending" : "paid",
      source: "web",
      refId: order.id,
    });
  } catch (err) {
    console.error("[ledger] recordOrderInvoice failed:", err);
  }
}

/** Write a ledger invoice row for an in-store POS bill.
 *
 *  The tax is taken from the bill's own snapshot (`gstEnabled` + the per-line
 *  `gstRate` totals computed at the counter), NOT recomputed here — so a bill
 *  raised in Non-GST mode records with zero tax, a GST bill records its exact
 *  CGST/SGST, and mixed carts (non-GST lines alongside taxed ones) are honoured.
 *  Retail prices are GST-inclusive, so the tax is contained in the grand total.
 *
 *  The bill's own random id (shown to the customer on the receipt) stays the
 *  invoice's `refId`/`id`; the GST `number` is a separate sequential series
 *  that is never shown to the customer. */
export async function recordBillInvoice(bill: Bill): Promise<void> {
  try {
    if (await getInvoiceByRefId(bill.id)) return;
    const taxed = Boolean(bill.gstEnabled);
    const gstTotal = taxed ? Math.round(bill.gst ?? 0) : 0;
    const cgst = taxed ? Math.round(bill.cgst ?? gstTotal / 2) : 0;
    const sgst = taxed ? Math.round(bill.sgst ?? gstTotal - Math.round(gstTotal / 2)) : 0;
    const taxable = bill.total - gstTotal;
    const items = bill.items.map((i) => ({
      name: i.name,
      hsn: i.hsn || "-",
      qty: i.qty,
      rate: i.price,
      gst: taxed ? Number(i.gstRate) || 0 : 0,
      amount: i.price * i.qty,
    }));

    const number = await nextInvoiceNumber(bill.createdAt);
    await insertInvoice({
      id: bill.id,
      number,
      date: bill.createdAt,
      customer: bill.customerName || "Walk-in",
      branch: bill.branch,
      items,
      subtotal: taxable,
      cgst,
      sgst,
      igst: 0,
      total: bill.total,
      paymentMode: bill.payment || (bill.source === "online" ? "razorpay" : "cash"),
      status: bill.status === "pending" ? "pending" : "paid",
      source: "pos",
      refId: bill.id,
    });
  } catch (err) {
    console.error("[ledger] recordBillInvoice failed:", err);
  }
}

/**
 * Write a GST tax invoice for a repair once it is billable — i.e. the work is
 * ready/completed or an invoice has been raised for it, and there is a charge.
 * The service charge is pre-GST; tax is added on top (SAC 9954, intra-state as
 * both branches are in Tamil Nadu). Idempotent per ticket, so it can be called
 * on every repair update and only ever mints one number.
 */
export async function recordServiceInvoice(t: RepairTicket): Promise<void> {
  try {
    if (t.status === "cancelled") return;
    const base = t.finalCost > 0 ? t.finalCost : t.estimate;
    if (base <= 0) return;
    const billable = t.status === "ready" || t.status === "completed" || Boolean(t.invoiceNo);
    if (!billable) return;
    if (await getInvoiceByRefId(t.id)) return;

    const rate = t.gstRate || 0;
    const total = Math.round(base * (1 + rate / 100));
    const gst = total - base;
    const dateIso = t.completedAt || t.updatedAt || t.createdAt;
    const number = await nextInvoiceNumber(dateIso);
    const paid = total - (t.advance || 0) <= 0;

    await insertInvoice({
      id: t.id,
      number,
      date: dateIso,
      customer: t.customerName || "Service customer",
      branch: t.branch,
      items: [{ name: `Repair & service — ${t.productName}`, hsn: "9954", qty: 1, rate: base, gst: rate, amount: base }],
      subtotal: base,
      cgst: Math.round(gst / 2),
      sgst: Math.round(gst / 2),
      igst: 0,
      total,
      paymentMode: "cash",
      status: paid ? "paid" : "pending",
      source: "service",
      refId: t.id,
    });
  } catch (err) {
    console.error("[ledger] recordServiceInvoice failed:", err);
  }
}
