"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer, MessageCircle } from "lucide-react";
import {
  useRepair, grossTotal, balanceDue,
  type RepairTicket,
} from "@/lib/store/repair";
import { BUSINESS, waLink, serviceInvoiceUrl } from "@/lib/data/business";
import { formatINR } from "@/lib/utils";
import { ServiceInvoiceSheet, SERVICE_INVOICE_PRINT_CSS } from "@/components/invoice/ServiceInvoiceSheet";

function invoiceMessage(t: RepairTicket, link: string): string {
  const bal = balanceDue(t);
  return (
    `*${BUSINESS.name} — Service Invoice*\n` +
    `Hi ${t.customerName || "there"}, your repair is complete. Here's your invoice.\n\n` +
    `🧾 Invoice: ${t.invoiceNo}\n` +
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

export default function ServiceInvoicePage() {
  const params = useParams();
  const id = String(params.id);
  const tickets = useRepair((s) => s.tickets);
  const updateTicket = useRepair((s) => s.updateTicket);
  const nextInvoiceNo = useRepair((s) => s.nextInvoiceNo);
  const t = tickets.find((x) => x.id === id);

  // Ensure an invoice number exists if the page is opened directly.
  useEffect(() => {
    if (t && !t.invoiceNo) {
      void nextInvoiceNo().then((no) => {
        updateTicket(t.id, { invoiceNo: no }, `Invoice ${no} generated`);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id, t?.invoiceNo]);

  if (!t) {
    return (
      <div className="p-8">
        <Link href="/admin/service" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600"><ArrowLeft className="h-4 w-4" /> Back to Service</Link>
        <div className="grid place-items-center rounded-2xl border border-ink-100 bg-ivory-50 py-24 text-center">
          <p className="text-lg font-bold text-ink-900">Ticket not found</p>
        </div>
      </div>
    );
  }

  const sendInvoice = () => {
    const link = serviceInvoiceUrl(t.id);
    updateTicket(t.id, { whatsappSentAt: new Date().toISOString() }, `Invoice ${t.invoiceNo} sent via WhatsApp`);
    window.open(waLink(t.phone, invoiceMessage(t, link)), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="p-5 md:p-8">
      <style>{SERVICE_INVOICE_PRINT_CSS}</style>

      {/* Toolbar (hidden on print) */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/admin/service/${t.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600"><ArrowLeft className="h-4 w-4" /> Back to ticket</Link>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600"><Printer className="h-4 w-4" /> Print / Save PDF</button>
          <button onClick={sendInvoice} className="flex items-center gap-2 rounded-xl bg-[#128C4B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0f7a41]"><MessageCircle className="h-4 w-4" /> Send via WhatsApp</button>
        </div>
      </div>

      {/* Invoice sheet */}
      <ServiceInvoiceSheet ticket={t} />
    </div>
  );
}
