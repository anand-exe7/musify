"use client";
import Link from "next/link";
import { ArrowLeft, Printer, MessageCircle } from "lucide-react";
import type { Invoice } from "@/types";
import { grossTotal, balanceDue, type RepairTicket } from "@/lib/store/repair";
import { BUSINESS, waLink, serviceInvoiceUrl } from "@/lib/data/business";
import { formatINR } from "@/lib/utils";
import { TaxInvoiceSheet, TAX_INVOICE_PRINT_CSS } from "@/components/invoice/TaxInvoiceSheet";

function invoiceMessage(t: RepairTicket, number: string | null, link: string): string {
  const bal = balanceDue(t);
  return (
    `*${BUSINESS.name} — Service Invoice*\n` +
    `Hi ${t.customerName || "there"}, your repair is complete. Here's your invoice.\n\n` +
    (number ? `🧾 Invoice: ${number}\n` : "") +
    `🎫 Ticket: ${t.id}\n` +
    `🎸 Item: ${t.productName}\n` +
    `🛠 Work done: ${t.problem}\n\n` +
    `Total (incl GST): ${formatINR(grossTotal(t))}\n` +
    `Advance paid: ${formatINR(t.advance)}\n` +
    (bal > 0 ? `*Balance due: ${formatINR(bal)}*\n` : `*Fully paid ✅*\n`) +
    `\n📄 View / download your invoice:\n${link}\n` +
    `\nThank you for trusting ${BUSINESS.name}! 🎶`
  );
}

export function AdminServiceInvoiceView({ invoice, ticket }: { invoice: Invoice | null; ticket: RepairTicket }) {
  const sendInvoice = () => {
    const link = serviceInvoiceUrl(ticket.id);
    window.open(waLink(ticket.phone, invoiceMessage(ticket, invoice?.number ?? null, link)), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="p-5 md:p-8">
      <style>{TAX_INVOICE_PRINT_CSS}</style>

      {/* Toolbar (hidden on print) */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/admin/service/${ticket.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600">
          <ArrowLeft className="h-4 w-4" /> Back to ticket
        </Link>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
          <button onClick={sendInvoice} className="flex items-center gap-2 rounded-xl bg-[#128C4B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0f7a41]">
            <MessageCircle className="h-4 w-4" /> Send via WhatsApp
          </button>
        </div>
      </div>

      {invoice ? (
        <TaxInvoiceSheet invoice={invoice} />
      ) : (
        <div className="mx-auto max-w-3xl rounded-2xl border border-ink-100 bg-ivory-50 p-10 text-center">
          <p className="text-lg font-bold text-ink-900">Invoice not issued yet</p>
          <p className="mt-2 text-sm text-ink-500">
            The tax invoice is minted once the ticket is marked <span className="font-semibold">Ready</span> or <span className="font-semibold">Completed</span>, or when a final cost is set.
          </p>
        </div>
      )}
    </div>
  );
}
