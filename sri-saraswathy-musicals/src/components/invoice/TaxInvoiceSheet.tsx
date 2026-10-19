import type { Invoice } from "@/types";
import { BUSINESS, branchInfo } from "@/lib/data/business";
import { amountInWords, formatINR, cn } from "@/lib/utils";
import { paymentText } from "@/lib/paymentSplit";
import { PrintFit } from "@/components/invoice/PrintFit";

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
  @page { size: A4; margin: 8mm; }
}
`;

function fmtDate(d: string) {
  const date = new Date(d);
  return isNaN(+date) ? d : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_TONE: Record<string, string> = {
  paid: "bg-success/10 text-success ring-success/30",
  pending: "bg-warning/10 text-warning ring-warning/30",
  "part paid": "bg-warning/10 text-warning ring-warning/30",
  cancelled: "bg-danger/10 text-danger ring-danger/30",
};

const SOURCE_LABEL: Record<string, string> = {
  web: "Online",
  pos: "In-store",
  service: "Service",
  manual: "Manual",
};

/**
 * The one tax-invoice sheet the app renders — driven by an `invoices` row.
 * Styled to read like an actual printed tax invoice: formal boxed layout, a
 * centered title band, double-rule separators, and a watermark imprint of the
 * company monogram so a Save-PDF looks like a real document, not a web card.
 * When the row carries zero tax (a fully non-GST bill of supply, or a POS bill
 * raised in Non-GST mode), the title switches to "Bill of Supply" and the tax
 * columns/rows are dropped per Rule 49 of the CGST Rules.
 */
export function TaxInvoiceSheet({ invoice, payment }: { invoice: Invoice; payment?: { paid: number; balance: number } }) {
  const totalTax = (invoice.cgst ?? 0) + (invoice.sgst ?? 0) + (invoice.igst ?? 0);
  const isBillOfSupply = totalTax === 0;
  const intra = (invoice.igst ?? 0) === 0;
  const branch = branchInfo(invoice.branch);
  const overall = invoice.discount ?? 0;
  const status = payment ? (payment.balance > 0 ? (payment.paid > 0 ? "part paid" : "pending") : "paid") : invoice.status;
  const itemsTotal = invoice.items.reduce((n, l) => n + l.amount, 0);
  const showDiscount = invoice.items.some((l) => (l.discount ?? 0) > 0);
  const saved = invoice.items.reduce((n, l) => n + Math.max(0, Math.max(l.mrp ?? 0, l.rate) * l.qty - l.amount), 0) + overall;
  const docTitle = isBillOfSupply ? "Bill of Supply" : "Tax Invoice";

  return (
    <div
      id="invoice-sheet"
      className="relative mx-auto max-w-3xl overflow-hidden rounded-sm border border-ink-200 bg-white shadow-[0_2px_6px_rgba(10,9,8,0.06),_0_30px_60px_-30px_rgba(10,9,8,0.25)]"
    >
      {/* Decorative double-rule top band — reads formal, like a notarised doc. */}
      <div className="relative">
        <div className="h-2.5 w-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500" />
        <div className="h-px w-full bg-ink-900" />
      </div>

      {/* Watermark monogram — subtle, print-safe. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.035]"
      >
        <span className="font-serif text-[280px] font-bold leading-none text-ink-900">SSM</span>
      </div>

      <PrintFit />
      <div className="relative p-7 md:p-11 print:p-6">
        {/* ─────────────────────────────────────────────────────────────
            Letterhead — logo + name on left, GSTIN block on right.
            ───────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-6 border-b border-ink-900 pb-5 print:pb-3">
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LOGO2.png" alt="" className="h-16 w-16 shrink-0 object-contain" />
            <div>
              <p className="font-display text-[26px] font-bold leading-none tracking-tight text-ink-900">
                {BUSINESS.name}
              </p>
              <p className="mt-1.5 text-[11px] italic text-ink-500">{BUSINESS.tagline}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.22em] text-gold-700">
                {BUSINESS.branches.map((b) => b.area).join(" · ")} · Since 1978
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[15px] font-bold uppercase tracking-[0.3em] text-ink-900">{docTitle}</p>
            <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.22em] text-ink-400">GSTIN</p>
            <p className="mt-0.5 font-mono text-[13px] font-bold tracking-wide text-ink-900">{BUSINESS.gstin}</p>
            <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.22em] text-ink-400">State · Code</p>
            <p className="mt-0.5 text-[12px] font-semibold text-ink-800">Tamil Nadu · 33</p>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            Meta table — invoice no / date / status / etc. — in a
            formal boxed grid instead of a right-aligned card.
            ───────────────────────────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-2 overflow-hidden rounded border border-ink-200 text-[12px] sm:grid-cols-4 print:mt-3">
          <MetaCell label="Invoice No." value={invoice.number} strong />
          <MetaCell label="Date" value={fmtDate(invoice.date)} />
          <MetaCell label="Source" value={SOURCE_LABEL[invoice.source ?? "manual"] ?? (invoice.source ?? "Manual")} />
          <MetaCell
            label="Status"
            value={
              <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1", STATUS_TONE[status] ?? "bg-ink-100 text-ink-600 ring-ink-200")}>
                {status}
              </span>
            }
          />
          {invoice.reference && <MetaCell label="Reference" value={invoice.reference} />}
          {invoice.refId && <MetaCell label="Order Ref" value={invoice.refId} mono />}
          <MetaCell label="Payment" value={invoice.paymentMode.toUpperCase()} />
          {(invoice.payments?.length ?? 0) > 1 && (
            <MetaCell label="Paid via" value={paymentText(invoice.payments ?? [], formatINR)} />
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────
            Parties — Billed To / Seller, side by side, like a GST form.
            ───────────────────────────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-1 overflow-hidden rounded border border-ink-200 sm:grid-cols-2 sm:divide-x sm:divide-ink-200 print:mt-3 print:grid-cols-2">
          <div className="p-4 print:p-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-gold-700">Billed To</p>
            <p className="mt-2 text-[15px] font-bold text-ink-900">{invoice.customer || "Customer"}</p>
            {invoice.customerPhone && (
              <p className="mt-1 text-[12px] text-ink-600">
                Phone <span className="font-semibold tracking-wide text-ink-900">{invoice.customerPhone}</span>
              </p>
            )}
            {invoice.customerGstin && (
              <p className="mt-1 text-[12px] text-ink-600">
                GSTIN <span className="font-mono font-semibold tracking-wide text-ink-900">{invoice.customerGstin}</span>
              </p>
            )}
          </div>
          <div className="border-t border-ink-200 p-4 sm:border-t-0 print:border-t-0 print:p-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-gold-700">Supplied By</p>
            <p className="mt-2 text-[15px] font-bold text-ink-900">{BUSINESS.name}</p>
            <p className="text-[12px] font-semibold text-gold-700">{branch.area} Branch</p>
            <p className="text-[12px] text-ink-600">{branch.street}</p>
            <p className="text-[12px] text-ink-600">{branch.zip} · {branch.phone}</p>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            Line items — proper GST table with ruled rows + banded
            header. Reads like a Tally / Zoho invoice.
            ───────────────────────────────────────────────────────────── */}
        <div className="mt-6 overflow-x-auto print:mt-3 print:overflow-visible">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr className="bg-ink-900 text-ivory-50 [&>th]:py-2.5 [&>th]:text-[9.5px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.18em]">
                <th className="w-10 border-r border-ink-800 px-2 text-center">#</th>
                <th className="border-r border-ink-800 px-3 text-left">Description of Goods</th>
                <th className="border-r border-ink-800 px-3 text-center">HSN</th>
                {!isBillOfSupply && <th className="border-r border-ink-800 px-3 text-center">GST %</th>}
                <th className="border-r border-ink-800 px-3 text-right">MRP</th>
                <th className="border-r border-ink-800 px-3 text-center">Qty</th>
                <th className="border-r border-ink-800 px-3 text-right">Rate</th>
                {showDiscount && <th className="border-r border-ink-800 px-3 text-right">Disc.</th>}
                <th className="px-3 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((l, i) => (
                <tr key={i} className="align-top odd:bg-ivory-50/30 [&>td]:border-b [&>td]:border-ink-100 [&>td]:py-3 print:[&>td]:py-1.5">
                  <td className="border-r border-ink-100 px-2 text-center font-semibold text-ink-500">{i + 1}</td>
                  <td className="border-r border-ink-100 px-3">
                    <p className="font-semibold text-ink-900">{l.name}</p>
                    {l.instruction && (
                      <p className="mt-1 text-[11px] text-ink-500"><span className="font-semibold uppercase tracking-wider text-ink-400">Note:</span> {l.instruction}</p>
                    )}
                  </td>
                  <td className="border-r border-ink-100 px-3 text-center font-mono text-[11px] text-ink-600">{l.hsn || "—"}</td>
                  {!isBillOfSupply && (
                    <td className="border-r border-ink-100 px-3 text-center tabular-nums text-ink-700">{l.gst > 0 ? `${l.gst}%` : "—"}</td>
                  )}
                  <td className="border-r border-ink-100 px-3 text-right tabular-nums text-ink-500 line-through">{formatINR(Math.max(l.mrp ?? 0, l.rate))}</td>
                  <td className="border-r border-ink-100 px-3 text-center tabular-nums font-semibold text-ink-800">{l.qty}</td>
                  <td className="border-r border-ink-100 px-3 text-right tabular-nums text-ink-800">{formatINR(l.rate)}</td>
                  {showDiscount && (
                    <td className="border-r border-ink-100 px-3 text-right tabular-nums text-success">
                      {l.discount ? (
                        <>
                          {formatINR(l.discount)}
                          <span className="block text-[10px] text-ink-400">({+((l.discount / (l.rate * l.qty || 1)) * 100).toFixed(2)}%)</span>
                        </>
                      ) : "—"}
                    </td>
                  )}
                  <td className="px-3 text-right font-bold tabular-nums text-ink-900">{formatINR(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            Amount-in-words + totals, boxed like a bank cheque stub.
            ───────────────────────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-5 print:mt-3 print:grid-cols-5 print:break-inside-avoid">
          <div className="sm:col-span-3">
            <div className="rounded border border-dashed border-ink-200 p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-400">Amount Chargeable (in words)</p>
              <p className="mt-1.5 font-serif text-[13px] italic leading-relaxed text-ink-900">
                {amountInWords(invoice.total)}
              </p>
            </div>
            {saved > 0 && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-[11px] font-bold text-success">
                You saved {formatINR(saved)} on this order
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <dl className="divide-y divide-ink-100 rounded border border-ink-200 text-[12px]">
              {overall > 0 && (
                <>
                  <Row dt="Items total" dd={formatINR(itemsTotal)} />
                  <Row dt="Overall discount" dd={`- ${formatINR(overall)}`} ddClassName="text-success" />
                </>
              )}
              <Row dt={overall > 0 ? "Taxable value" : "Subtotal"} dd={formatINR(invoice.subtotal)} />
              {!isBillOfSupply && (
                intra ? (
                  <>
                    <Row dt="CGST" dd={formatINR(invoice.cgst)} />
                    <Row dt="SGST" dd={formatINR(invoice.sgst)} />
                  </>
                ) : (
                  <Row dt="IGST" dd={formatINR(invoice.igst ?? 0)} />
                )
              )}
              {(invoice.delivery ?? 0) > 0 && <Row dt="Delivery" dd={formatINR(invoice.delivery ?? 0)} />}
              <div className="flex items-center justify-between gap-3 bg-ink-900 px-3 py-3 text-ivory-50">
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em]">
                  {payment ? "Total Invoice Amount" : "Grand Total"}
                </dt>
                <dd className="text-[16px] font-bold tabular-nums tracking-tight">{formatINR(invoice.total)}</dd>
              </div>
              {payment && (
                <>
                  <Row dt="Amount paid" dd={formatINR(payment.paid)} ddClassName="text-success" />
                  <div className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2.5 text-[13px] font-bold",
                    payment.balance > 0 ? "bg-danger/10 text-danger" : "bg-success/10 text-success",
                  )}>
                    <dt>Balance due</dt>
                    <dd className="tabular-nums">{formatINR(payment.balance)}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            Declaration + signatory — formal footer.
            ───────────────────────────────────────────────────────────── */}
        <div className="mt-7 grid grid-cols-1 gap-6 border-t border-dashed border-ink-200 pt-5 sm:grid-cols-2 print:mt-3 print:grid-cols-2 print:gap-4 print:break-inside-avoid print:pt-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-400">Terms &amp; Conditions</p>
            <ol className="mt-1.5 list-inside list-decimal space-y-0.5 text-[11px] leading-relaxed text-ink-600">
              <li>Goods once sold cannot be taken back or exchanged.</li>
              <li>Subject to &lsquo;Chennai&rsquo; jurisdiction only.</li>
            </ol>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-ink-500">For <span className="font-serif font-bold italic text-ink-900">{BUSINESS.name}</span></p>
            <div className="ml-auto mt-14 w-48 print:mt-9 border-t-2 border-ink-900 pt-1.5 text-right text-[10px] font-bold uppercase tracking-[0.22em] text-ink-600">
              Authorised Signatory
            </div>
          </div>
        </div>

        {/* Footer strap. */}
        <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-3 text-[10px] text-ink-400 print:mt-3 print:break-inside-avoid">
          <span className="font-semibold">
            {isBillOfSupply ? "Computer-generated bill of supply." : "Computer-generated tax invoice."}
          </span>
          <span className="italic">Thank you for your business.</span>
        </div>
      </div>

      {/* Decorative double-rule bottom band. */}
      <div className="relative">
        <div className="h-px w-full bg-ink-900" />
        <div className="h-2.5 w-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500" />
      </div>
    </div>
  );
}

/** One cell of the meta grid at the top. */
function MetaCell({
  label, value, strong, mono,
}: { label: string; value: React.ReactNode; strong?: boolean; mono?: boolean }) {
  return (
    <div className="border-b border-r border-ink-200 bg-ivory-50/40 px-3 py-2 last:border-r-0 even:bg-white sm:border-b-0 sm:[&:nth-child(4n)]:border-r-0 sm:[&:nth-last-child(-n+4)]:border-b-0">
      <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-400">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[12px] text-ink-900",
          strong && "font-bold tracking-tight",
          mono && "font-mono text-[11px]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** One row inside the totals block. */
function Row({ dt, dd, ddClassName }: { dt: string; dd: string; ddClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-ink-700">
      <dt>{dt}</dt>
      <dd className={cn("font-semibold tabular-nums", ddClassName)}>{dd}</dd>
    </div>
  );
}
