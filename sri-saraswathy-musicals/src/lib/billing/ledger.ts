/**
 * Unified sales/tax ledger. Every sale — whether it comes from the web
 * storefront (`orders`) or the in-store POS (`pos_bills`) — also writes one row
 * into the `invoices` table, so there is a single GST ledger and one reporting
 * surface (the admin Invoices page).
 *
 * Both recorders are best-effort: a failure here is logged but never bubbles up
 * to fail the underlying sale.
 */
import { eq } from "drizzle-orm";
import { db, invoices } from "@/lib/db";
import { getAllProducts } from "@/lib/db/queries/products";
import { getGstSettings } from "@/lib/db/queries/settings";
import { genDocId } from "@/lib/ids";
import type { Order, Invoice } from "@/types";
import type { Bill } from "@/lib/store/pos";

/** Generate the next sales-invoice number, e.g. `INV-2026-7QK3M`. Checks the
 *  DB for a free code before returning it, retrying on the rare clash. */
async function nextInvoiceNumber(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = genDocId("INV");
    const [existing] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, candidate)).limit(1);
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique invoice number");
}

async function insertInvoice(inv: Invoice): Promise<void> {
  await db.insert(invoices).values(inv);
}

/** Write a GST invoice row for a completed web order. */
export async function recordOrderInvoice(order: Order): Promise<void> {
  try {
    const [products, gstCfg] = await Promise.all([getAllProducts(), getGstSettings()]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const intra =
      !order.shipState || order.shipState.trim().toLowerCase() === gstCfg.homeState.trim().toLowerCase();

    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    const items = order.items.map((it) => {
      const p = byId.get(it.productId);
      const rate = p?.gstRate ?? gstCfg.standardRate;
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

    const number = await nextInvoiceNumber();
    await insertInvoice({
      id: number,
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

/** Write a GST invoice row for an in-store POS bill (retail prices are treated
 *  as GST-inclusive; the tax is extracted from the grand total).
 *
 *  Reuses the bill's own id as the invoice number — that id is already what's
 *  printed on the receipt and sent to the customer over WhatsApp, so the
 *  ledger must record the same number rather than minting a second one. */
export async function recordBillInvoice(bill: Bill): Promise<void> {
  try {
    const gstCfg = await getGstSettings();
    const rate = gstCfg.standardRate;
    const gstTotal = Math.round((bill.total * rate) / (100 + rate));
    const taxable = bill.total - gstTotal;
    const items = bill.items.map((i) => ({
      name: i.name,
      hsn: "-",
      qty: i.qty,
      rate: i.price,
      gst: rate,
      amount: i.price * i.qty,
    }));

    await insertInvoice({
      id: bill.id,
      number: bill.id,
      date: bill.createdAt,
      customer: bill.customerName || "Walk-in",
      branch: bill.branch,
      items,
      subtotal: taxable,
      cgst: Math.round(gstTotal / 2),
      sgst: Math.round(gstTotal / 2),
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
