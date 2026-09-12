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

/** Rupee amount → Indian-format words (lakh/crore), e.g. 5310 → "Five Thousand Three Hundred Ten". */
function amountInWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number): string => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : ""));
  const three = (n: number): string => {
    const h = Math.floor(n / 100), r = n % 100;
    return (h ? ones[h] + " Hundred" + (r ? " " : "") : "") + (r ? two(r) : "");
  };
  let n = Math.max(0, Math.round(num));
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  return [
    crore && three(crore) + " Crore",
    lakh && two(lakh) + " Lakh",
    thousand && two(thousand) + " Thousand",
    n && three(n),
  ].filter(Boolean).join(" ").trim();
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
#invoice-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print {
  body * { visibility: hidden !important; }
  #invoice-sheet, #invoice-sheet * { visibility: visible !important; }
  #invoice-sheet { position: absolute; left: 0; top: 0; width: 100%; margin: 0; border: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
  @page { margin: 12mm; }
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
      <div id="invoice-sheet" className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
        {/* Gold accent bar */}
        <div className="h-1.5 w-full bg-gold-gradient" />

        <div className="p-6 md:p-10">
          {/* Header */}
          <div className="flex flex-col gap-5 border-b border-ink-100 pb-7 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/LOGO2.png" alt="" className="h-16 w-16 shrink-0 object-contain" />
              <div>
                <p className="font-display text-2xl font-bold leading-tight text-ink-900">{BUSINESS.name}</p>
                <p className="mt-0.5 text-xs text-ink-500">{BUSINESS.tagline}</p>
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-ivory-100 px-2 py-1 text-[11px] text-ink-500">
                  GSTIN <span className="font-semibold tracking-wide text-ink-800">{BUSINESS.gstin}</span>
                </p>
              </div>
            </div>
            <div className="shrink-0 rounded-xl border border-ink-100 bg-ivory-50 px-5 py-4 sm:min-w-[220px]">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold-600">Service Invoice</p>
              <p className="mt-1 font-display text-xl font-bold text-ink-900">{t.invoiceNo || "—"}</p>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Date</dt><dd className="font-medium text-ink-700">{dateStr}</dd></div>
                <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Ref Ticket</dt><dd className="font-medium text-ink-700">{t.id}</dd></div>
                <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Status</dt><dd><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusMeta(t.status).tone}`}>{statusMeta(t.status).label}</span></dd></div>
              </dl>
            </div>
          </div>

          {/* Parties */}
          <div className="grid gap-4 py-7 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-100 bg-ivory-50/60 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Billed To</p>
              <p className="mt-2 text-base font-semibold text-ink-900">{t.customerName}</p>
              <p className="text-sm text-ink-600">{t.phone}</p>
              {t.email && <p className="text-sm text-ink-600">{t.email}</p>}
            </div>
            <div className="rounded-xl border border-ink-100 bg-ivory-50/60 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Service Branch</p>
              <p className="mt-2 text-base font-semibold text-ink-900">{branch.city} · {branch.area}</p>
              <p className="text-sm text-ink-600">{branch.street}</p>
              <p className="text-sm text-ink-600">{branch.zip}</p>
              <p className="text-sm text-ink-600">{branch.phone}</p>
            </div>
          </div>

          {/* Line items */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-ink-900 text-ivory-50 [&>th]:py-3 [&>th]:text-[10px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.12em]">
                  <th className="rounded-l-lg pl-4 pr-3 text-left">Description</th>
                  <th className="px-3 text-center">HSN/SAC</th>
                  <th className="px-3 text-center">Qty</th>
                  <th className="px-3 text-right">Rate</th>
                  <th className="rounded-r-lg pl-3 pr-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="align-top [&>td]:border-b [&>td]:border-ink-100 [&>td]:py-4">
                  <td className="pl-4 pr-3">
                    <p className="font-semibold text-ink-900">Repair &amp; service — {t.productName}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-500">{t.problem}</p>
                    {(t.brand || t.serial) && (
                      <p className="mt-1 text-[11px] text-ink-400">
                        {[t.brand && `Brand: ${t.brand}`, t.serial && `SN ${t.serial}`].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className="px-3 text-center text-ink-600">9954</td>
                  <td className="px-3 text-center tabular-nums text-ink-700">1</td>
                  <td className="px-3 text-right tabular-nums text-ink-700">{formatINR(base)}</td>
                  <td className="pl-3 pr-4 text-right font-semibold tabular-nums text-ink-900">{formatINR(base)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Amount in words + totals */}
          <div className="mt-7 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-[16rem]">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Amount in words</p>
              <p className="mt-1.5 text-sm font-medium italic leading-relaxed text-ink-700">{amountInWords(total)} Rupees Only</p>
            </div>
            <dl className="w-full space-y-2 text-sm sm:max-w-xs">
              <div className="flex justify-between px-3 text-ink-600"><dt>Subtotal</dt><dd className="tabular-nums">{formatINR(base)}</dd></div>
              <div className="flex justify-between px-3 text-ink-600"><dt>CGST ({t.gstRate / 2}%)</dt><dd className="tabular-nums">{formatINR(gst.cgst)}</dd></div>
              <div className="flex justify-between px-3 text-ink-600"><dt>SGST ({t.gstRate / 2}%)</dt><dd className="tabular-nums">{formatINR(gst.sgst)}</dd></div>
              <div className="mt-1 flex justify-between rounded-lg bg-ink-900 px-3 py-2.5 text-base font-bold text-ivory-50"><dt>Total</dt><dd className="tabular-nums">{formatINR(total)}</dd></div>
              <div className="flex justify-between px-3 text-ink-500"><dt>Advance / Paid</dt><dd className="tabular-nums">− {formatINR(t.advance)}</dd></div>
              <div className={`flex justify-between rounded-lg px-3 py-2 text-base font-bold ${paid ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                <dt>{paid ? "Paid in full" : "Balance Due"}</dt><dd className="tabular-nums">{formatINR(Math.max(0, balance))}</dd>
              </div>
            </dl>
          </div>

          {/* Footer */}
          <div className="mt-8 flex flex-col gap-4 border-t border-ink-100 pt-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-sm">
              {paid && (
                <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Payment received
                </p>
              )}
              <p className="text-[11px] leading-relaxed text-ink-400">
                This is a computer-generated service invoice. Repaired instruments carry a 30-day service warranty on the work performed. Thank you for choosing {BUSINESS.name}.
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-sm text-ink-500">For {BUSINESS.name}</p>
              <div className="ml-auto mt-10 w-40 border-t border-ink-300 pt-1.5 text-xs text-ink-400">Authorised Signatory</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
