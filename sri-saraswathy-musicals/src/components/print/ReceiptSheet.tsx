import { BUSINESS, branchInfo } from "@/lib/data/business";
import { amountInWords, formatINR } from "@/lib/utils";
import { fmtDate, type PrintDoc } from "@/lib/print/doc";
import { PrintFit } from "@/components/invoice/PrintFit";

/**
 * REP-02: A4 payment receipt for a part-paid repair. Deliberately titled "Payment Receipt" with a visible
 * "not a tax invoice" notice; the charges are shown only so the customer can see the balance still due.
 * Uses the same `#invoice-sheet` id as the tax invoice so print / PDF work identically.
 */
export function ReceiptSheet({ doc }: { doc: PrintDoc }) {
  const branch = branchInfo(doc.branch);
  return (
    <div id="invoice-sheet" className="relative mx-auto max-w-3xl overflow-hidden rounded-sm border border-ink-200 bg-white shadow-[0_2px_6px_rgba(10,9,8,0.06)]">
      <div className="h-2.5 w-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500" />
      <PrintFit />
      <div className="p-7 md:p-10 print:p-6">
        <div className="flex flex-col gap-4 border-b border-ink-900 pb-5 sm:flex-row sm:items-start sm:justify-between print:flex-row">
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LOGO2.png" alt="" className="h-14 w-14 shrink-0 object-contain" />
            <div>
              <p className="text-[24px] font-bold leading-none text-ink-900">{BUSINESS.name}</p>
              <p className="mt-1.5 text-[12px] text-ink-600">{branch.area} · {branch.street}, {branch.zip}</p>
              <p className="text-[12px] text-ink-600">{branch.phone} · GSTIN {BUSINESS.gstin}</p>
            </div>
          </div>
          <div className="text-left sm:text-right print:text-right">
            <p className="text-[15px] font-bold uppercase tracking-[0.25em] text-ink-900">{doc.title}</p>
            <p className="mt-1 text-[12px] text-ink-600">No. <span className="font-mono font-semibold text-ink-900">{doc.number}</span></p>
            <p className="text-[12px] text-ink-600">{fmtDate(doc.date)}</p>
          </div>
        </div>

        {doc.notice && (
          <p className="mt-4 rounded border-2 border-ink-900 px-3 py-2 text-center text-[12px] font-bold uppercase tracking-wider text-ink-900">{doc.notice}</p>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <div className="rounded border border-ink-200 p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-gold-700">Received from</p>
            <p className="mt-1.5 text-[15px] font-bold text-ink-900">{doc.customer.name}</p>
            {doc.customer.phone && <p className="text-[12px] text-ink-600">Phone {doc.customer.phone}</p>}
            {doc.customer.gstin && <p className="text-[12px] text-ink-600">GSTIN <span className="font-mono">{doc.customer.gstin}</span></p>}
          </div>
          <div className="rounded border border-ink-200 p-4 text-[12px] text-ink-700">
            {(doc.meta ?? []).map((m) => (
              <p key={m.label} className="flex justify-between gap-3"><span className="text-ink-500">{m.label}</span><span className="font-semibold text-ink-900">{m.value}</span></p>
            ))}
          </div>
        </div>

        <table className="mt-5 w-full border border-ink-200 text-[12px]">
          <thead className="bg-ink-900 text-[9.5px] font-bold uppercase tracking-[0.16em] text-ivory-50">
            <tr className="[&>th]:px-3 [&>th]:py-2"><th className="text-left">Payment</th><th className="text-right">Amount (₹)</th></tr>
          </thead>
          <tbody>
            {(doc.payments ?? []).map((p, i) => (
              <tr key={i} className="[&>td]:border-b [&>td]:border-ink-100 [&>td]:px-3 [&>td]:py-2">
                <td>{p.label}</td>
                <td className="text-right font-semibold tabular-nums">{formatINR(p.amount)}</td>
              </tr>
            ))}
            {(doc.payments ?? []).length === 0 && (
              <tr><td colSpan={2} className="px-3 py-4 text-center text-ink-400">No payment received yet.</td></tr>
            )}
          </tbody>
        </table>

        <div className="mt-5 grid gap-5 sm:grid-cols-5 print:grid-cols-5">
          <div className="sm:col-span-3 print:col-span-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-ink-400">Amount received (in words)</p>
            <p className="mt-1 text-[13px] italic text-ink-900">{amountInWords(doc.paid ?? 0)}</p>
            <p className="mt-3 text-[11px] text-ink-500">Work: {doc.lines.map((l) => l.name).join(", ")}</p>
          </div>
          <dl className="divide-y divide-ink-100 rounded border border-ink-200 text-[12px] sm:col-span-2 print:col-span-2">
            <div className="flex justify-between px-3 py-2"><dt>Job value (incl. GST)</dt><dd className="font-semibold tabular-nums">{formatINR(doc.total)}</dd></div>
            <div className="flex justify-between bg-ink-900 px-3 py-2.5 font-bold text-ivory-50"><dt>Total received</dt><dd className="tabular-nums">{formatINR(doc.paid ?? 0)}</dd></div>
            <div className="flex justify-between px-3 py-2.5 font-bold text-danger"><dt>Balance due</dt><dd className="tabular-nums">{formatINR(doc.balance ?? 0)}</dd></div>
          </dl>
        </div>

        <div className="mt-8 flex items-end justify-between border-t border-dashed border-ink-200 pt-4 text-[11px] text-ink-500">
          <span>Computer-generated payment receipt.</span>
          <span className="w-44 border-t-2 border-ink-900 pt-1 text-right text-[10px] font-bold uppercase tracking-[0.2em] text-ink-600">Received by</span>
        </div>
      </div>
    </div>
  );
}
