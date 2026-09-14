"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Link2, Check } from "lucide-react";
import type { Order } from "@/types";
import { BUSINESS, branchInfo } from "@/lib/data/business";
import { amountInWords, formatINR, cn } from "@/lib/utils";

interface Line {
  name: string;
  brand: string;
  qty: number;
  rate: number;
  amount: number;
}

interface Props {
  order: Order;
  lines: Line[];
  discount?: number;
  coupon?: string;
  /** GST-inclusive tax breakup for a GST bill; omitted/null for plain bills. */
  taxBreakup?: { taxable: number; cgst: number; sgst: number; gst: number } | null;
}

function fmtDate(d: string) {
  const date = new Date(d);
  return isNaN(+date) ? d : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_TONE: Record<string, string> = {
  delivered: "bg-success/10 text-success",
  shipped: "bg-info/10 text-info",
  processing: "bg-warning/10 text-warning",
  cancelled: "bg-danger/10 text-danger",
};

const PRINT_CSS = `
#invoice-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print {
  body * { visibility: hidden !important; }
  #invoice-sheet, #invoice-sheet * { visibility: visible !important; }
  #invoice-sheet { position: absolute; left: 0; top: 0; width: 100%; margin: 0; border: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
  @page { margin: 12mm; }
}
`;

export function OrderInvoiceView({ order, lines, discount = 0, coupon, taxBreakup }: Props) {
  const [copied, setCopied] = useState(false);
  const paid = order.paymentMethod === "razorpay";
  const paymentLabel =
    order.paymentMethod === "razorpay"
      ? "Paid online · Razorpay"
      : order.paymentMethod === "cod"
        ? "Cash on delivery"
        : "—";
  const branch = branchInfo(order.branch ?? "Branch 1");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="min-h-screen bg-ivory-100 p-5 md:p-8">
      <style>{PRINT_CSS}</style>

      {/* Toolbar (hidden on print) */}
      <div className="mx-auto mb-6 flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600">
          <ArrowLeft className="h-4 w-4" /> Back to shop
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600"
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
            {copied ? "Link copied" : "Copy share link"}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900"
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Invoice sheet */}
      <div id="invoice-sheet" className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
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
              </div>
            </div>
            <div className="shrink-0 rounded-xl border border-ink-100 bg-ivory-50 px-5 py-4 sm:min-w-[230px]">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold-600">Order Invoice</p>
              <p className="mt-1 font-display text-xl font-bold text-ink-900">{order.id.toUpperCase()}</p>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Date</dt><dd className="font-medium text-ink-700">{fmtDate(order.date)}</dd></div>
                <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Status</dt><dd><span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", STATUS_TONE[order.status] ?? "bg-ink-100 text-ink-600")}>{order.status}</span></dd></div>
                <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Payment</dt><dd className="font-medium text-ink-700">{paymentLabel}</dd></div>
              </dl>
            </div>
          </div>

          {/* Parties */}
          <div className="grid gap-4 py-7 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-100 bg-ivory-50/60 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Billed To</p>
              <p className="mt-2 text-base font-semibold text-ink-900">{order.customerName || "Customer"}</p>
              {order.phone && <p className="text-sm text-ink-600">{order.phone}</p>}
              {order.email && <p className="text-sm text-ink-600">{order.email}</p>}
              {order.address && <p className="mt-1 text-sm leading-relaxed text-ink-600">{order.address}</p>}
            </div>
            <div className="rounded-xl border border-ink-100 bg-ivory-50/60 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Seller</p>
              <p className="mt-2 text-base font-semibold text-ink-900">{BUSINESS.name}</p>
              <p className="text-sm text-ink-600">{branch.street}</p>
              <p className="text-sm text-ink-600">{branch.zip}</p>
              <p className="text-sm text-ink-600">{branch.phone}</p>
            </div>
          </div>

          {/* Line items */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-ink-900 text-ivory-50 [&>th]:py-3 [&>th]:text-[10px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.12em]">
                  <th className="rounded-l-lg pl-4 pr-3 text-left">Description</th>
                  <th className="px-3 text-center">Qty</th>
                  <th className="px-3 text-right">Rate</th>
                  <th className="rounded-r-lg pl-3 pr-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="align-top [&>td]:border-b [&>td]:border-ink-100 [&>td]:py-4">
                    <td className="pl-4 pr-3">
                      <p className="font-semibold text-ink-900">{l.name}</p>
                      {l.brand && <p className="mt-0.5 text-[11px] uppercase tracking-wide text-gold-600">{l.brand}</p>}
                    </td>
                    <td className="px-3 text-center tabular-nums text-ink-700">{l.qty}</td>
                    <td className="px-3 text-right tabular-nums text-ink-700">{formatINR(l.rate)}</td>
                    <td className="pl-3 pr-4 text-right font-semibold tabular-nums text-ink-900">{formatINR(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Amount in words + totals */}
          <div className="mt-7 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-[16rem]">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Amount in words</p>
              <p className="mt-1.5 text-sm font-medium italic leading-relaxed text-ink-700">{amountInWords(order.total)} Rupees Only</p>
            </div>
            <dl className="w-full space-y-2 text-sm sm:max-w-xs">
              <div className="flex justify-between px-3 text-ink-600"><dt>Subtotal</dt><dd className="tabular-nums">{formatINR(order.subtotal)}</dd></div>
              {discount > 0 && (
                <div className="flex justify-between px-3 text-success"><dt>Discount{coupon ? ` (${coupon})` : ""}</dt><dd className="tabular-nums">- {formatINR(discount)}</dd></div>
              )}
              <div className="flex justify-between px-3 text-ink-600"><dt>{order.shipping ? "Delivery" : "Shipping"}</dt><dd className="tabular-nums">{order.shipping === 0 ? "Free" : formatINR(order.shipping)}</dd></div>
              {taxBreakup && taxBreakup.gst > 0 && (
                <>
                  <div className="flex justify-between px-3 text-ink-500"><dt>Taxable value</dt><dd className="tabular-nums">{formatINR(taxBreakup.taxable)}</dd></div>
                  <div className="flex justify-between px-3 text-ink-500"><dt>CGST</dt><dd className="tabular-nums">{formatINR(taxBreakup.cgst)}</dd></div>
                  <div className="flex justify-between px-3 text-ink-500"><dt>SGST</dt><dd className="tabular-nums">{formatINR(taxBreakup.sgst)}</dd></div>
                  <p className="px-3 text-[10px] text-ink-400">GST of {formatINR(taxBreakup.gst)} is included in the total.</p>
                </>
              )}
              <div className="mt-1 flex justify-between rounded-lg bg-ink-900 px-3 py-2.5 text-base font-bold text-ivory-50"><dt>Total</dt><dd className="tabular-nums">{formatINR(order.total)}</dd></div>
              <div className={cn("flex justify-between rounded-lg px-3 py-2 text-sm font-bold", paid ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                <dt>{paid ? "Paid in full" : "Payable on delivery"}</dt>
                <dd className="tabular-nums">{formatINR(order.total)}</dd>
              </div>
            </dl>
          </div>

          {/* Footer */}
          <div className="mt-8 flex flex-col gap-4 border-t border-ink-100 pt-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-sm">
              {order.paymentId && <p className="text-[11px] text-ink-400">Payment ref: <span className="font-medium text-ink-600">{order.paymentId}</span></p>}
              <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
                This is a computer-generated order invoice and does not require a signature. Thank you for choosing {BUSINESS.name}.
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-sm text-ink-500">For {BUSINESS.name}</p>
              <div className="ml-auto mt-10 w-40 border-t border-ink-300 pt-1.5 text-xs text-ink-400">Authorised Signatory</div>
            </div>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-4 max-w-3xl text-center text-[11px] text-ink-400 print:hidden">
        Shareable order invoice — anyone with this link can view it.
      </p>
    </div>
  );
}
