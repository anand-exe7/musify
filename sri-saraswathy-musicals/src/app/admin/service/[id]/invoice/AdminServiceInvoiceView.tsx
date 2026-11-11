"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Invoice } from "@/types";
import { grossTotal, balanceDue, type RepairTicket } from "@/lib/store/repair";
import { BUSINESS, serviceInvoiceUrl } from "@/lib/data/business";
import { formatINR } from "@/lib/utils";
import { TaxInvoiceSheet, TAX_INVOICE_PRINT_CSS } from "@/components/invoice/TaxInvoiceSheet";
import { ReceiptSheet } from "@/components/print/ReceiptSheet";
import { OutputActions } from "@/components/print/OutputActions";
import { invoiceToDoc } from "@/lib/print/doc";
import { ticketReceiptDoc } from "@/lib/billing/repairReceipt";
import { E } from "@/lib/whatsapp";

export function ticketPayment(t: RepairTicket) {
  const total = grossTotal(t);
  const paid = Math.min(total, t.advance || 0);
  return { paid, balance: Math.max(0, total - paid) };
}

function invoiceMessage(t: RepairTicket, number: string | null, link: string): string {
  const bal = balanceDue(t);
  return (
    `*${BUSINESS.name} — ${bal > 0 ? "Payment Receipt" : "Service Invoice"}*\n` +
    (bal > 0
      ? `Hi ${t.customerName || "there"}, thank you for your payment towards your repair.\n\n`
      : `Hi ${t.customerName || "there"}, your repair is complete. Here's your invoice.\n\n`) +
    (number && bal <= 0 ? `${E.receipt} Invoice: ${number}\n` : "") +
    `${E.ticket} Ticket: ${t.id}\n` +
    `${E.guitar} Item: ${t.productName}\n` +
    `${E.wrench} Work: ${t.problem}\n\n` +
    `Total (incl GST): ${formatINR(grossTotal(t))}\n` +
    `Amount paid: ${formatINR(t.advance)}\n` +
    (bal > 0 ? `*Balance due: ${formatINR(bal)}*\n_This is a payment receipt, not a tax invoice. The tax invoice is issued on full payment._\n` : `*Fully paid ${E.check}*\n`) +
    `\n${E.doc} View / download:\n${link}\n` +
    `\nThank you for trusting ${BUSINESS.name}! ${E.notes}`
  );
}

/**
 * REP-02 / REP-05: a fully-paid repair shows its GST tax invoice; a part-paid (or unpaid) one shows a payment
 * receipt instead. Both print as a thermal receipt or A4, download as PDF, and go out on WhatsApp.
 */
export function AdminServiceInvoiceView({ invoice, ticket }: { invoice: Invoice | null; ticket: RepairTicket }) {
  const due = ticket.status !== "cancelled" && balanceDue(ticket) > 0;
  const showReceipt = due || !invoice;
  const doc = showReceipt ? ticketReceiptDoc(ticket) : invoiceToDoc(invoice!, ticketPayment(ticket));
  const link = serviceInvoiceUrl(ticket.id);

  return (
    <div className="p-5 md:p-8">
      <style>{TAX_INVOICE_PRINT_CSS}</style>

      {/* Toolbar (hidden on print) */}
      <div className="mx-auto mb-6 flex max-w-3xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between print:hidden">
        <Link href={`/admin/service/${ticket.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600">
          <ArrowLeft className="h-4 w-4" /> Back to ticket
        </Link>
        <OutputActions
          doc={doc}
          a4TargetId="invoice-sheet"
          phone={ticket.phone}
          whatsappText={invoiceMessage(ticket, invoice?.number ?? null, link)}
          pdfName={`${showReceipt ? "Receipt" : "Invoice"}-${showReceipt ? ticket.id : invoice!.number}`}
        />
      </div>

      {showReceipt ? <ReceiptSheet doc={doc} /> : <TaxInvoiceSheet invoice={invoice!} payment={ticketPayment(ticket)} />}
    </div>
  );
}
