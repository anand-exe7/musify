/**
 * One printable-document model shared by every output format (thermal receipt, A4, PDF, WhatsApp text).
 * Invoices, quotations and repair payment receipts are all mapped onto `PrintDoc`, so the same GST
 * split-up (rate, CGST, SGST, IGST, total tax) appears identically everywhere.
 *
 * Money is paise throughout, like the rest of the app.
 */
import type { Invoice, Quotation } from "@/types";
import { E } from "@/lib/whatsapp";

export interface PrintLine {
  name: string;
  hsn?: string;
  qty: number;
  /** GST-inclusive unit price. */
  rate: number;
  /** GST rate %. */
  gst: number;
  /** Line total after any line discount (GST-inclusive). */
  amount: number;
  discount?: number;
  note?: string;
}

export interface PrintDoc {
  kind: "invoice" | "quotation" | "receipt";
  /** Printed heading, e.g. "Tax Invoice", "Bill of Supply", "Quotation", "Payment Receipt". */
  title: string;
  number: string;
  date: string;
  /** Extra header rows (Reference, Valid until, Ticket …). */
  meta?: { label: string; value: string }[];
  branch: string;
  customer: { name: string; phone?: string | null; gstin?: string | null };
  lines: PrintLine[];
  /** Taxable value (GST-exclusive). */
  subtotal: number;
  discount?: number;
  cgst: number;
  sgst: number;
  igst: number;
  delivery?: number;
  total: number;
  /** For part-paid documents. */
  paid?: number;
  balance?: number;
  paymentMode?: string;
  /** Individual payments shown on a receipt (label = date · mode). */
  payments?: { label: string; amount: number }[];
  /** A boxed notice under the title (e.g. "Not a tax invoice"). */
  notice?: string;
  cancelled?: boolean;
}

export interface GstRow {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface GstSummary {
  rows: GstRow[];
  totalTax: number;
  /** The one GST rate on the document, or null when lines carry different rates. */
  singleRate: number | null;
  interState: boolean;
}

/**
 * BIL-01 / QUO-02: GST split-up per rate. The per-rate tax is backed out of the GST-inclusive line amounts,
 * then scaled so the rows add up exactly to the document's own CGST / SGST / IGST (which already account for
 * any bill-level discount). Intra-state tax splits into equal CGST and SGST halves; inter-state is all IGST.
 */
export function gstSummary(lines: Pick<PrintLine, "gst" | "amount">[], cgst: number, sgst: number, igst: number): GstSummary {
  const totalTax = cgst + sgst + igst;
  const interState = igst > 0;
  const byRate = new Map<number, { gross: number; tax: number }>();
  for (const l of lines) {
    if (!(l.gst > 0)) continue;
    const cur = byRate.get(l.gst) ?? { gross: 0, tax: 0 };
    cur.gross += l.amount;
    cur.tax += (l.amount * l.gst) / (100 + l.gst);
    byRate.set(l.gst, cur);
  }
  const raw = [...byRate.entries()].sort((a, b) => a[0] - b[0]);
  const rawTax = raw.reduce((n, [, v]) => n + v.tax, 0);
  const scale = rawTax > 0 ? totalTax / rawTax : 0;

  let taxLeft = totalTax;
  const rows: GstRow[] = raw.map(([rate, v], i) => {
    const last = i === raw.length - 1;
    const tax = last ? taxLeft : Math.round(v.tax * scale);
    taxLeft -= tax;
    const taxable = Math.round((tax * 100) / rate);
    if (interState) return { rate, taxable, cgst: 0, sgst: 0, igst: tax };
    const c = Math.round(tax / 2);
    return { rate, taxable, cgst: c, sgst: tax - c, igst: 0 };
  });
  // Keep the CGST/SGST columns in step with the document's own figures (rounding can differ by a paisa).
  if (!interState && rows.length > 0) {
    const dc = cgst - rows.reduce((n, r) => n + r.cgst, 0);
    const ds = sgst - rows.reduce((n, r) => n + r.sgst, 0);
    rows[rows.length - 1].cgst += dc;
    rows[rows.length - 1].sgst += ds;
  }
  return { rows, totalTax, singleRate: rows.length === 1 ? rows[0].rate : null, interState };
}

/** "9%" style label for half a GST rate (CGST / SGST), trimming trailing zeros. */
export function halfRate(rate: number): string {
  return `${+(rate / 2).toFixed(2)}%`;
}

/** Label for a tax row: "CGST @ 9%" when the document has one rate, plain "CGST" otherwise. */
export function taxLabel(kind: "CGST" | "SGST" | "IGST", s: GstSummary): string {
  if (s.singleRate === null) return kind;
  return `${kind} @ ${kind === "IGST" ? `${s.singleRate}%` : halfRate(s.singleRate)}`;
}

/** Invoice row → print model. `payment` carries live paid/balance for part-paid (repair) invoices. */
export function invoiceToDoc(inv: Invoice, payment?: { paid: number; balance: number; history?: { label: string; amount: number }[] }): PrintDoc {
  const tax = (inv.cgst ?? 0) + (inv.sgst ?? 0) + (inv.igst ?? 0);
  const meta: PrintDoc["meta"] = [];
  if (inv.reference) meta.push({ label: "Ref", value: inv.reference });
  return {
    kind: "invoice",
    title: tax === 0 ? "Bill of Supply" : "Tax Invoice",
    number: inv.number,
    date: inv.date,
    meta,
    branch: inv.branch,
    customer: { name: inv.customer || "Customer", phone: inv.customerPhone, gstin: inv.customerGstin },
    lines: inv.items.map((l) => ({ name: l.name, hsn: l.hsn, qty: l.qty, rate: l.rate, gst: l.gst, amount: l.amount, discount: l.discount, note: l.instruction })),
    subtotal: inv.subtotal,
    discount: inv.discount,
    cgst: inv.cgst ?? 0,
    sgst: inv.sgst ?? 0,
    igst: inv.igst ?? 0,
    delivery: inv.delivery,
    total: inv.total,
    paid: payment?.paid,
    balance: payment?.balance,
    paymentMode: inv.paymentMode,
    payments: payment?.history?.length
      ? payment.history
      : (inv.payments ?? []).length > 1
        ? inv.payments!.map((p) => ({ label: p.method, amount: p.amount }))
        : undefined,
    cancelled: inv.status === "cancelled",
  };
}

/** Quotation → print model. */
export function quotationToDoc(q: Quotation): PrintDoc {
  const meta: PrintDoc["meta"] = [{ label: "Valid until", value: fmtDate(q.validUntil) }];
  if ((q.advance ?? 0) > 0) meta.push({ label: "Advance", value: rupees(q.advance ?? 0) });
  return {
    kind: "quotation",
    title: "Quotation",
    number: q.number,
    date: q.date,
    meta,
    branch: q.branch,
    customer: { name: q.customer || "Customer", phone: q.customerPhone, gstin: q.customerGstin },
    lines: q.items.map((l) => ({ name: l.name, hsn: l.hsn, qty: l.qty, rate: l.rate, gst: l.gst, amount: l.amount, discount: l.discount, note: l.note })),
    subtotal: q.subtotal,
    discount: q.discount,
    cgst: q.cgst,
    sgst: q.sgst,
    igst: q.igst ?? 0,
    total: q.total,
  };
}

export function fmtDate(d: string): string {
  const date = new Date(d);
  return isNaN(+date) ? d : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** ₹ amount for plain-text output (WhatsApp, receipts) — paise in. */
export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** BIL-05 / LED-01 / QUO-04: WhatsApp message for any document — items, GST split-up, totals and the link, with emojis. */
export function docWhatsAppText(doc: PrintDoc, businessName: string, link?: string): string {
  const s = gstSummary(doc.lines, doc.cgst, doc.sgst, doc.igst);
  const items = doc.lines.map((l) => `${E.note} ${l.name} × ${l.qty} — ${rupees(l.amount)}`).join("\n");
  const tax =
    s.totalTax > 0
      ? s.interState
        ? `${E.tag} ${taxLabel("IGST", s)}: ${rupees(doc.igst)}\n`
        : `${E.tag} ${taxLabel("CGST", s)}: ${rupees(doc.cgst)}\n${E.tag} ${taxLabel("SGST", s)}: ${rupees(doc.sgst)}\n${E.tag} Total GST: ${rupees(s.totalTax)}\n`
      : "";
  const icon = doc.kind === "quotation" ? E.memo : E.receipt;
  const name = doc.customer.name && doc.customer.name !== "Customer" && doc.customer.name !== "Walk-in" ? ` ${doc.customer.name}` : "";
  const closing = doc.kind === "quotation" ? `We look forward to serving you! ${E.pray}` : `Thank you for shopping with us! ${E.pray} Visit again ${E.guitar}${E.keyboard}${E.drum}`;
  return (
    `${E.notes} *${businessName}* ${E.notes}\n` +
    `Hi${name}! ${E.wave}\n\n` +
    `${icon} *${doc.title}:* ${doc.number}\n` +
    `${E.calendar} *Date:* ${fmtDate(doc.date)}\n` +
    (doc.meta ?? []).map((m) => `▫ ${m.label}: ${m.value}\n`).join("") +
    `\n${E.cart} *Items*\n${items}\n\n` +
    `${E.chart} Taxable value: ${rupees(doc.subtotal)}\n` +
    tax +
    ((doc.discount ?? 0) > 0 ? `${E.gift} Discount: -${rupees(doc.discount ?? 0)}\n` : "") +
    ((doc.delivery ?? 0) > 0 ? `${E.truck} Delivery: ${rupees(doc.delivery ?? 0)}\n` : "") +
    `\n${E.money} *Total: ${rupees(doc.total)}*\n` +
    (doc.paid !== undefined ? `${E.check} Paid: ${rupees(doc.paid)}\n` : "") +
    (doc.balance !== undefined && doc.balance > 0 ? `${E.hourglass} *Balance due: ${rupees(doc.balance)}*\n` : "") +
    (doc.notice ? `\n${E.bulb} _${doc.notice}_\n` : "") +
    (link ? `\n${E.doc} View / download:\n${link}\n` : "") +
    `\n${closing}`
  );
}
