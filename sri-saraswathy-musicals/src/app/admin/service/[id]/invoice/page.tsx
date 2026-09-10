"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer, MessageCircle, CheckCircle2 } from "lucide-react";
import {
  useRepair, chargeBase, grossTotal, balanceDue, statusMeta,
  type RepairTicket,
} from "@/lib/store/repair";
import { BUSINESS, branchInfo, waLink } from "@/lib/data/business";
import { calculateGST, formatINR } from "@/lib/utils";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function invoiceMessage(t: RepairTicket): string {
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
    `\nThank you for trusting ${BUSINESS.name}! 🎶`
  );
}

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #invoice-sheet, #invoice-sheet * { visibility: visible !important; }
  #invoice-sheet { position: absolute; left: 0; top: 0; width: 100%; margin: 0; border: 0 !important; box-shadow: none !important; }
  @page { margin: 14mm; }
}
`;

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
      const no = nextInvoiceNo();
      updateTicket(t.id, { invoiceNo: no }, `Invoice ${no} generated`);
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

  const branch = branchInfo(t.branch);
  const base = chargeBase(t);
  const gst = calculateGST(base, t.gstRate);
  const total = grossTotal(t);
  const balance = balanceDue(t);
  const paid = balance <= 0;
  const dateStr = fmtDate(t.completedAt || new Date().toISOString());

  const sendInvoice = () => {
    updateTicket(t.id, { whatsappSentAt: new Date().toISOString() }, `Invoice ${t.invoiceNo} sent via WhatsApp`);
    window.open(waLink(t.phone, invoiceMessage(t)), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="p-5 md:p-8">
      <style>{PRINT_CSS}</style>

      {/* Toolbar (hidden on print) */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/admin/service/${t.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600"><ArrowLeft className="h-4 w-4" /> Back to ticket</Link>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600"><Printer className="h-4 w-4" /> Print / Save PDF</button>
          <button onClick={sendInvoice} className="flex items-center gap-2 rounded-xl bg-[#128C4B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0f7a41]"><MessageCircle className="h-4 w-4" /> Send via WhatsApp</button>
        </div>
      </div>

      {/* Invoice sheet */}
      <div id="invoice-sheet" className="mx-auto max-w-3xl rounded-2xl border border-ink-100 bg-white p-6 shadow-sm md:p-10">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-ink-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LOGO2.png" alt="" className="h-14 w-14 object-contain" />
            <div>
              <p className="font-display text-xl font-bold text-ink-900">{BUSINESS.name}</p>
              <p className="text-xs text-ink-500">{BUSINESS.tagline}</p>
              <p className="mt-1 text-[11px] text-ink-400">GSTIN: {BUSINESS.gstin}</p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-gold-600">Service Invoice</p>
            <p className="mt-1 text-lg font-bold text-ink-900">{t.invoiceNo || "—"}</p>
            <p className="text-xs text-ink-500">Date: {dateStr}</p>
            <p className="text-xs text-ink-500">Ref Ticket: {t.id}</p>
          </div>
        </div>

        {/* Parties */}
        <div className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Billed To</p>
            <p className="mt-1.5 text-sm font-semibold text-ink-900">{t.customerName}</p>
            <p className="text-sm text-ink-600">{t.phone}</p>
            {t.email && <p className="text-sm text-ink-600">{t.email}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Service Branch</p>
            <p className="mt-1.5 text-sm font-semibold text-ink-900">{branch.city} · {branch.area}</p>
            <p className="text-sm text-ink-600">{branch.street}</p>
            <p className="text-sm text-ink-600">{branch.zip}</p>
            <p className="text-sm text-ink-600">{branch.phone}</p>
          </div>
        </div>

        {/* Line items */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-y border-ink-100 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">
                <th className="py-3">Description</th>
                <th className="text-center">HSN/SAC</th>
                <th className="text-center">Qty</th>
                <th className="text-right">Rate</th>
                <th className="pr-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="align-top">
                <td className="py-4">
                  <p className="font-semibold text-ink-900">Repair &amp; service — {t.productName}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{t.problem}</p>
                  {t.brand && <p className="text-[11px] text-ink-400">Brand: {t.brand}{t.serial ? ` · SN ${t.serial}` : ""}</p>}
                </td>
                <td className="py-4 text-center text-ink-600">9954</td>
                <td className="py-4 text-center tabular-nums">1</td>
                <td className="py-4 text-right tabular-nums">{formatINR(base)}</td>
                <td className="py-4 pr-1 text-right tabular-nums">{formatINR(base)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-2 flex justify-end border-t border-ink-100 pt-4">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between text-ink-600"><dt>Subtotal</dt><dd className="tabular-nums">{formatINR(base)}</dd></div>
            <div className="flex justify-between text-ink-600"><dt>CGST ({t.gstRate / 2}%)</dt><dd className="tabular-nums">{formatINR(gst.cgst)}</dd></div>
            <div className="flex justify-between text-ink-600"><dt>SGST ({t.gstRate / 2}%)</dt><dd className="tabular-nums">{formatINR(gst.sgst)}</dd></div>
            <div className="flex justify-between border-t border-ink-100 pt-2 text-base font-bold text-ink-900"><dt>Total</dt><dd className="tabular-nums">{formatINR(total)}</dd></div>
            <div className="flex justify-between text-ink-600"><dt>Advance / Paid</dt><dd className="tabular-nums">− {formatINR(t.advance)}</dd></div>
            <div className={`flex justify-between rounded-lg px-2 py-1.5 text-base font-bold ${paid ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
              <dt>{paid ? "Paid in full" : "Balance Due"}</dt><dd className="tabular-nums">{formatINR(Math.max(0, balance))}</dd>
            </div>
          </dl>
        </div>

        {/* Status + footer */}
        <div className="mt-6 flex flex-col gap-3 border-t border-ink-100 pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Ticket status</span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${statusMeta(t.status).tone}`}>{statusMeta(t.status).label}</span>
            </div>
            {paid && <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle2 className="h-4 w-4" /> Payment received</p>}
            <p className="mt-3 max-w-sm text-[11px] leading-relaxed text-ink-400">
              This is a computer-generated service invoice. Repaired instruments carry a 30-day service warranty on the work performed. Thank you for choosing {BUSINESS.name}.
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-sm text-ink-500">For {BUSINESS.name}</p>
            <div className="mt-8 border-t border-ink-300 pt-1 text-xs text-ink-400">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}
