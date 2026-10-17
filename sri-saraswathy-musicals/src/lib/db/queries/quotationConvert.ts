/**
 * Turn a quotation into a real sale: stock comes off the quotation's branch, the payment is recorded, and a GST
 * tax invoice is written. It goes through the same path as a counter bill, so it shows up in billing history,
 * reports and the invoice list, and deleting that bill later puts the stock back.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { quotations } from "@/lib/db/schema";
import { HttpError } from "@/lib/api/errors";
import { getQuotation } from "./quotations";
import { getPricingCatalog } from "./products";
import { createBill } from "./pos";
import { getInvoiceByRefId } from "./invoices";
import { recordBillInvoice } from "@/lib/billing/ledger";
import { variantKey } from "@/lib/catalog/variants";
import { cleanPayments, paymentLabel, statusFor } from "@/lib/paymentSplit";
import { genDocId } from "@/lib/ids";
import type { Bill, BillItem } from "@/lib/store/pos";
import type { Quotation } from "@/types";

const bad = (m: string) => new HttpError(400, m);

export async function convertQuotation(id: string, paymentsInput: unknown): Promise<{ quotation: Quotation; billId: string } | undefined> {
  const q = await getQuotation(id);
  if (!q) return undefined;
  if (q.status === "invoiced") throw new HttpError(409, "This quotation has already been turned into an invoice.");
  if (q.status === "declined") throw new HttpError(409, "This quotation was declined. Mark it open or accepted first.");

  const pay = cleanPayments(paymentsInput, q.total);
  if (!pay.ok) throw bad(pay.error);

  // Every line must point at a live product variant — that is what moves stock.
  const catalog = new Map((await getPricingCatalog()).map((p) => [p.id, p]));
  const items: BillItem[] = q.items.map((l) => {
    const product = l.productId ? catalog.get(l.productId) : undefined;
    const idx = product && l.variantKey ? product.variants.findIndex((v) => variantKey(v) === l.variantKey) : -1;
    if (idx < 0) throw bad(`"${l.name}" isn't linked to a product in the catalogue. Edit the quotation and pick the product for that line.`);
    return { name: l.name, price: l.rate, qty: l.qty, gstRate: l.gst, hsn: l.hsn === "-" ? "" : l.hsn, productId: l.productId, variantIndex: idx };
  });

  const gst = q.cgst + q.sgst + (q.igst ?? 0);
  const bill: Bill = {
    id: genDocId("INV"),
    createdAt: new Date().toISOString(),
    customerName: q.customer,
    phone: q.customerPhone ?? "",
    customerGstin: q.customerGstin ?? "",
    source: "offline",
    branch: q.branch as Bill["branch"],
    items,
    subtotal: q.items.reduce((n, l) => n + l.amount, 0),
    discount: q.discount ?? 0,
    delivery: 0,
    total: q.total,
    gstEnabled: true,
    taxable: q.subtotal,
    cgst: q.cgst,
    sgst: q.sgst,
    gst,
    status: statusFor(q.total, pay.lines) === "paid" ? "completed" : "pending",
    payment: paymentLabel(pay.lines) || "cash",
    payments: pay.lines,
  };

  // Claim the quotation first so two people pressing Convert can't make two sales.
  const claimed = await db
    .update(quotations)
    .set({ status: "invoiced" })
    .where(and(eq(quotations.id, id), inArray(quotations.status, ["open", "accepted"])))
    .returning({ id: quotations.id });
  if (claimed.length === 0) throw new HttpError(409, "This quotation has already been turned into an invoice.");

  try {
    await createBill(bill); // takes the stock (refuses a short sale) and keeps the payment lines
  } catch (err) {
    // Nothing was sold, so the quotation goes back to how it was.
    await db.update(quotations).set({ status: q.status }).where(eq(quotations.id, id));
    throw err;
  }
  await recordBillInvoice(bill);
  if (!(await getInvoiceByRefId(bill.id))) console.error(`[quotation] bill ${bill.id} saved for ${q.number} but its tax invoice was not written`);
  await db.update(quotations).set({ invoiceId: bill.id }).where(eq(quotations.id, id));
  return { quotation: { ...q, status: "invoiced", invoiceId: bill.id }, billId: bill.id };
}
