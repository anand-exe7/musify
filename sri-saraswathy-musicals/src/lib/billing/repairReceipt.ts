/**
 * REP-02: the document a part-paid repair gets — a Payment Receipt / acknowledgement, never a tax invoice.
 * Built from the ticket alone (pure), so the admin page and the public share link render the same thing.
 */
import type { RepairTicket } from "@/lib/store/repair";
import { serviceInvoiceBreakup } from "@/lib/billing/serviceInvoice";
import { ticketPayments, paymentsTotal, PAY_MODE_LABEL } from "@/lib/billing/repairPayments";
import { fmtDate, type PrintDoc } from "@/lib/print/doc";

export const RECEIPT_NOTICE = "Payment receipt — not a tax invoice. The GST tax invoice is issued on full payment.";

export function ticketReceiptDoc(t: RepairTicket): PrintDoc {
  const charge = t.finalCost > 0 ? t.finalCost : t.estimate;
  const bk = serviceInvoiceBreakup(t.productName, charge, t.gstRate || 0, t.parts);
  const payments = ticketPayments(t);
  const paid = Math.min(bk.total, paymentsTotal(payments));
  const last = payments[payments.length - 1];
  return {
    kind: "receipt",
    title: "Payment Receipt",
    number: last?.receiptNo ?? t.id,
    date: last?.at ?? t.updatedAt ?? t.createdAt,
    meta: [
      { label: "Ticket", value: t.id },
      { label: "Item", value: t.productName },
    ],
    branch: t.branch,
    customer: { name: t.customerName || "Customer", phone: t.phone, gstin: t.customerGstin },
    lines: bk.items.map((l) => ({ name: l.name, hsn: l.hsn, qty: l.qty, rate: l.rate, gst: l.gst, amount: l.amount })),
    subtotal: bk.subtotal,
    cgst: bk.cgst,
    sgst: bk.sgst,
    igst: 0,
    total: bk.total,
    paid,
    balance: t.status === "cancelled" ? 0 : Math.max(0, bk.total - paid),
    payments: payments.map((p) => ({ label: `${fmtDate(p.at)} · ${PAY_MODE_LABEL[p.mode] ?? p.mode}${p.receiptNo ? ` · ${p.receiptNo}` : ""}`, amount: p.amount })),
    notice: RECEIPT_NOTICE,
    cancelled: t.status === "cancelled",
  };
}
