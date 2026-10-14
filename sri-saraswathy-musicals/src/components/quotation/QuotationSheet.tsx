import type { Quotation } from "@/types";
import { BUSINESS, branchInfo } from "@/lib/data/business";
import { amountInWords, formatINR } from "@/lib/utils";
import { QUOTE_TERMS } from "@/lib/quotation";

/** Isolates `#quotation-sheet` so Print / Save-PDF captures only the quotation. */
export const QUOTATION_PRINT_CSS = `
#quotation-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print {
  body * { visibility: hidden !important; }
  #quotation-sheet, #quotation-sheet * { visibility: visible !important; }
  #quotation-sheet { position: absolute; left: 0; top: 0; width: 100%; margin: 0; border: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
  @page { margin: 12mm; }
}
`;

function fmtDate(d: string) {
  const date = new Date(d);
  return isNaN(+date) ? d : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** The quotation document — shown in the admin, on the customer's share link, and printed. */
export function QuotationSheet({ quotation: q }: { quotation: Quotation }) {
  const branch = branchInfo(q.branch);
  const hasTax = q.cgst + q.sgst + (q.igst ?? 0) > 0;
  const discount = q.discount ?? 0;
  const itemsTotal = q.items.reduce((n, l) => n + l.amount, 0);
  const advance = Math.min(q.advance ?? 0, q.total);

  return (
    <div id="quotation-sheet" className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
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
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-700">
                {BUSINESS.branches.map((b) => b.area).join(" · ")}
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-ivory-100 px-2 py-1 text-[11px] text-ink-500">
                GSTIN <span className="font-semibold tracking-wide text-ink-800">{BUSINESS.gstin}</span>
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-ink-100 bg-ivory-50 px-5 py-4 sm:min-w-[230px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold-600">Quotation</p>
            <p className="mt-1 font-display text-xl font-bold text-ink-900">{q.number}</p>
            <dl className="mt-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Date</dt><dd className="font-medium text-ink-700">{fmtDate(q.date)}</dd></div>
              <div className="flex items-center justify-between gap-6"><dt className="text-ink-400">Valid until</dt><dd className="font-medium text-ink-700">{fmtDate(q.validUntil)}</dd></div>
            </dl>
          </div>
        </div>

        {/* Parties */}
        <div className="grid gap-4 py-7 sm:grid-cols-2">
          <div className="rounded-xl border border-ink-100 bg-ivory-50/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Quotation for</p>
            <p className="mt-2 text-base font-semibold text-ink-900">{q.customer}</p>
            {q.customerPhone && <p className="mt-1 text-sm text-ink-600">Phone <span className="font-semibold text-ink-800">{q.customerPhone}</span></p>}
            {q.customerGstin && <p className="mt-1 text-sm text-ink-600">GSTIN <span className="font-semibold tracking-wide text-ink-800">{q.customerGstin}</span></p>}
          </div>
          <div className="rounded-xl border border-ink-100 bg-ivory-50/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Issued by</p>
            <p className="mt-2 text-base font-semibold text-ink-900">{BUSINESS.name}</p>
            <p className="text-sm font-semibold text-gold-600">{branch.area} Branch</p>
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
                <th className="rounded-l-lg pl-4 pr-3 text-left">#</th>
                <th className="px-3 text-left">Description</th>
                <th className="px-3 text-center">HSN</th>
                {hasTax && <th className="px-3 text-center">GST</th>}
                <th className="px-3 text-center">Qty</th>
                <th className="px-3 text-right">Rate</th>
                <th className="rounded-r-lg pl-3 pr-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((l, i) => (
                <tr key={i} className="align-top [&>td]:border-b [&>td]:border-ink-100 [&>td]:py-4">
                  <td className="pl-4 pr-3 tabular-nums text-ink-400">{i + 1}</td>
                  <td className="px-3">
                    <p className="font-semibold text-ink-900">{l.name}</p>
                    {l.note && <p className="mt-1 text-xs text-ink-500">{l.note}</p>}
                  </td>
                  <td className="px-3 text-center text-ink-600">{l.hsn || "-"}</td>
                  {hasTax && <td className="px-3 text-center tabular-nums text-ink-600">{l.gst > 0 ? `${l.gst}%` : "—"}</td>}
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
            <p className="mt-1.5 text-sm font-medium italic leading-relaxed text-ink-700">{amountInWords(q.total)}</p>
          </div>
          <dl className="w-full space-y-2 text-sm sm:max-w-xs">
            {discount > 0 && (
              <>
                <div className="flex justify-between px-3 text-ink-600"><dt>Items total (incl. GST)</dt><dd className="tabular-nums">{formatINR(itemsTotal)}</dd></div>
                <div className="flex justify-between px-3 text-success"><dt>Discount</dt><dd className="tabular-nums">- {formatINR(discount)}</dd></div>
              </>
            )}
            {hasTax && (
              <>
                <div className="flex justify-between px-3 text-ink-600"><dt>Taxable value</dt><dd className="tabular-nums">{formatINR(q.subtotal)}</dd></div>
                {(q.igst ?? 0) > 0 ? (
                  <div className="flex justify-between px-3 text-ink-600"><dt>IGST</dt><dd className="tabular-nums">{formatINR(q.igst ?? 0)}</dd></div>
                ) : (
                  <>
                    <div className="flex justify-between px-3 text-ink-600"><dt>CGST</dt><dd className="tabular-nums">{formatINR(q.cgst)}</dd></div>
                    <div className="flex justify-between px-3 text-ink-600"><dt>SGST</dt><dd className="tabular-nums">{formatINR(q.sgst)}</dd></div>
                  </>
                )}
              </>
            )}
            <div className="mt-1 flex justify-between rounded-lg bg-ink-900 px-3 py-2.5 text-base font-bold text-ivory-50"><dt>Total</dt><dd className="tabular-nums">{formatINR(q.total)}</dd></div>
            {advance > 0 && (
              <>
                <div className="flex justify-between rounded-lg bg-gold-100 px-3 py-2 font-bold text-ink-900"><dt>Advance to pay</dt><dd className="tabular-nums">{formatINR(advance)}</dd></div>
                <div className="flex justify-between px-3 text-ink-600"><dt>Balance after advance</dt><dd className="tabular-nums">{formatINR(q.total - advance)}</dd></div>
              </>
            )}
          </dl>
        </div>

        {q.notes && (
          <div className="mt-7 rounded-xl border border-ink-100 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Notes</p>
            <p className="mt-1.5 whitespace-pre-line text-sm text-ink-700">{q.notes}</p>
          </div>
        )}

        {/* Terms */}
        <div className="mt-7 rounded-xl border border-ink-100 bg-ivory-50/60 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Terms and conditions</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-700">
            {QUOTE_TERMS.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col gap-4 border-t border-ink-100 pt-6 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-sm text-[11px] leading-relaxed text-ink-400">
            This is a price quotation, not a tax invoice. A GST tax invoice is issued when the sale is completed. Thank you for considering {BUSINESS.name}.
          </p>
          <div className="sm:text-right">
            <p className="text-sm text-ink-500">For {BUSINESS.name}</p>
            <div className="ml-auto mt-10 w-40 border-t border-ink-300 pt-1.5 text-xs text-ink-400">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}
