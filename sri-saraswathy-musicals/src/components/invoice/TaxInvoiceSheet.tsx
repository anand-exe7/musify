import type { Invoice } from "@/types";
import { BUSINESS, branchInfo } from "@/lib/data/business";
import { amountInWords, formatINR, cn } from "@/lib/utils";

/**
 * Print stylesheet shared by every route that renders the tax invoice — isolates
 * `#invoice-sheet` so Print / Save-PDF captures only the invoice.
 */
export const TAX_INVOICE_PRINT_CSS = `
#invoice-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print {
  body * { visibility: hidden !important; }
  #invoice-sheet, #invoice-sheet * { visibility: visible !important; }
  #invoice-sheet { position: absolute; left: 0; top: 0; width: 100%; margin: 0; border: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
  @page { margin: 12mm; }
}
`;

function fmtDate(d: string) {
  const date = new Date(d);
  return isNaN(+date) ? d : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_TONE: Record<string, string> = {
  paid: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  cancelled: "bg-danger/10 text-danger",
};

const SOURCE_LABEL: Record<string, string> = {
  web: "Online",
  pos: "In-store",
  service: "Service",
  manual: "Manual",
};

/**
 * The one tax-invoice sheet the app renders — driven by an `invoices` row.
 * When the row carries zero tax (a fully non-GST bill of supply, or a POS bill
 * raised in Non-GST mode), the title switches to "Bill of Supply" and the tax
 * columns/rows are dropped per Rule 49 of the CGST Rules.
 */
export function TaxInvoiceSheet({ invoice }: { invoice: Invoice }) {
  const totalTax = (invoice.cgst ?? 0) + (invoice.sgst ?? 0) + (invoice.igst ?? 0);
  const isBillOfSupply = totalTax === 0;
  const intra = (invoice.igst ?? 0) === 0;
  const branch = branchInfo(invoice.branch);

  return (
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
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-ivory-100 px-2 py-1 text-[11px] text-ink-500">
                GSTIN <span className="font-semibold tracking-wide text-ink-800">{BUSINESS.gstin}</span>
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-ink-100 bg-ivory-50 px-5 py-4 sm:min-w-[230px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold-600">
              {isBillOfSupply ? "Bill of Supply" : "Tax Invoice"}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-ink-900">{invoice.number}</p>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Date</dt><dd className="font-medium text-ink-700">{fmtDate(invoice.date)}</dd></div>
              {invoice.refId && (
                <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Ref</dt><dd className="font-medium text-ink-700">{invoice.refId}</dd></div>
              )}
              <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Source</dt><dd className="font-medium uppercase text-ink-700">{SOURCE_LABEL[invoice.source ?? "manual"] ?? invoice.source}</dd></div>
              <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Status</dt><dd><span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", STATUS_TONE[invoice.status] ?? "bg-ink-100 text-ink-600")}>{invoice.status}</span></dd></div>
              <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Payment</dt><dd className="font-medium uppercase text-ink-700">{invoice.paymentMode}</dd></div>
            </dl>
          </div>
        </div>

        {/* Parties */}
        <div className="grid gap-4 py-7 sm:grid-cols-2">
          <div className="rounded-xl border border-ink-100 bg-ivory-50/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Billed To</p>
            <p className="mt-2 text-base font-semibold text-ink-900">{invoice.customer || "Customer"}</p>
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
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-ink-900 text-ivory-50 [&>th]:py-3 [&>th]:text-[10px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.12em]">
                <th className="rounded-l-lg pl-4 pr-3 text-left">Description</th>
                <th className="px-3 text-center">HSN</th>
                {!isBillOfSupply && <th className="px-3 text-center">GST</th>}
                <th className="px-3 text-center">Qty</th>
                <th className="px-3 text-right">Rate</th>
                <th className="rounded-r-lg pl-3 pr-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((l, i) => (
                <tr key={i} className="align-top [&>td]:border-b [&>td]:border-ink-100 [&>td]:py-4">
                  <td className="pl-4 pr-3">
                    <p className="font-semibold text-ink-900">{l.name}</p>
                  </td>
                  <td className="px-3 text-center text-ink-600">{l.hsn || "-"}</td>
                  {!isBillOfSupply && (
                    <td className="px-3 text-center tabular-nums text-ink-600">{l.gst > 0 ? `${l.gst}%` : "—"}</td>
                  )}
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
            <p className="mt-1.5 text-sm font-medium italic leading-relaxed text-ink-700">{amountInWords(invoice.total)}</p>
          </div>
          <dl className="w-full space-y-2 text-sm sm:max-w-xs">
            <div className="flex justify-between px-3 text-ink-600"><dt>Subtotal</dt><dd className="tabular-nums">{formatINR(invoice.subtotal)}</dd></div>
            {!isBillOfSupply && (
              intra ? (
                <>
                  <div className="flex justify-between px-3 text-ink-600"><dt>CGST</dt><dd className="tabular-nums">{formatINR(invoice.cgst)}</dd></div>
                  <div className="flex justify-between px-3 text-ink-600"><dt>SGST</dt><dd className="tabular-nums">{formatINR(invoice.sgst)}</dd></div>
                </>
              ) : (
                <div className="flex justify-between px-3 text-ink-600"><dt>IGST</dt><dd className="tabular-nums">{formatINR(invoice.igst ?? 0)}</dd></div>
              )
            )}
            <div className="mt-1 flex justify-between rounded-lg bg-ink-900 px-3 py-2.5 text-base font-bold text-ivory-50"><dt>Total</dt><dd className="tabular-nums">{formatINR(invoice.total)}</dd></div>
          </dl>
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col gap-4 border-t border-ink-100 pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-sm">
            <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
              {isBillOfSupply
                ? `This is a computer-generated bill of supply for exempt/non-GST goods and does not require a signature. Thank you for choosing ${BUSINESS.name}.`
                : `This is a computer-generated tax invoice and does not require a signature. GST invoice numbers are issued sequentially in accordance with Rule 46 of the CGST Rules.`}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-sm text-ink-500">For {BUSINESS.name}</p>
            <div className="ml-auto mt-10 w-40 border-t border-ink-300 pt-1.5 text-xs text-ink-400">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}
