"use client";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { branchLabel } from "@/lib/stock";
import { formatINR, cn } from "@/lib/utils";
import { sumAlloc, type PaymentAlloc } from "@/lib/paymentAlloc";

export interface BranchPayRow {
  branch: string;
  /** Units this branch took (the purchase form shows it). */
  qty?: number;
  /** What this branch's part of the bill comes to. */
  value: number;
  /** Already paid before this entry (later payments, or paid at purchase). */
  paid?: number;
  /** The most this branch can put in now. */
  max: number;
}

/** One row per branch: what it took, what it owes, and a box for what it pays — the box can't go above what is owed. */
export function BranchPayTable({
  rows, value, onChange, valueLabel = "Its share", payLabel = "Pay now", disabled,
}: {
  rows: BranchPayRow[];
  value: PaymentAlloc;
  onChange: (next: PaymentAlloc) => void;
  valueLabel?: string;
  payLabel?: string;
  disabled?: boolean;
}) {
  if (rows.length === 0) return <p className="text-xs text-ink-400">Add products first, so we know which branches are receiving stock.</p>;
  const showQty = rows.some((r) => r.qty !== undefined);
  const showPaid = rows.some((r) => (r.paid ?? 0) > 0);
  const amt = (r: BranchPayRow) => Math.min(value[r.branch] || 0, r.max);
  const set = (r: BranchPayRow, p: number) => onChange({ ...value, [r.branch]: Math.max(0, Math.min(p, r.max)) });
  const input = "w-full min-w-[6rem] rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gold-500 focus:outline-none disabled:opacity-60";
  const paying = rows.reduce((n, r) => n + amt(r), 0);
  const share = rows.reduce((n, r) => n + r.value, 0);
  const left = rows.reduce((n, r) => n + Math.max(0, r.value - (r.paid ?? 0) - amt(r)), 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            <th className="px-3 py-2">Branch</th>
            {showQty && <th className="text-right">Bought</th>}
            <th className="text-right">{valueLabel}</th>
            {showPaid && <th className="text-right">Paid</th>}
            <th className="w-36 px-2 text-right">{payLabel} (₹)</th>
            <th className="pr-3 text-right">Left</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-50">
          {rows.map((r) => {
            const mine = amt(r);
            const rest = Math.max(0, r.value - (r.paid ?? 0) - mine);
            return (
              <tr key={r.branch}>
                <td className="px-3 py-2 font-medium text-ink-900">{branchLabel(r.branch)}</td>
                {showQty && <td className="text-right tabular-nums text-ink-600">{r.qty ?? 0}</td>}
                <td className="text-right tabular-nums text-ink-700">{formatINR(r.value)}</td>
                {showPaid && <td className="text-right tabular-nums text-ink-500">{formatINR(r.paid ?? 0)}</td>}
                <td className="px-2">
                  <MoneyInput value={mine} onChange={(p) => set(r, p)} disabled={disabled || r.max <= 0} className={input} placeholder="0" />
                  <button type="button" disabled={disabled || r.max <= 0} onClick={() => set(r, r.max)} className="mt-0.5 block w-full text-right text-[10px] font-semibold text-gold-600 hover:underline disabled:opacity-40">
                    {r.max > 0 ? `Max ${formatINR(r.max)}` : "Nothing to pay"}
                  </button>
                </td>
                <td className={cn("pr-3 text-right tabular-nums", rest > 0 ? "text-danger" : "text-success")}>{formatINR(rest)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-ink-100 bg-ink-900/5 text-xs font-bold text-ink-900">
            <td className="px-3 py-2">Total</td>
            {showQty && <td className="text-right tabular-nums">{rows.reduce((n, r) => n + (r.qty ?? 0), 0)}</td>}
            <td className="text-right tabular-nums">{formatINR(share)}</td>
            {showPaid && <td className="text-right tabular-nums">{formatINR(rows.reduce((n, r) => n + (r.paid ?? 0), 0))}</td>}
            <td className="px-2 text-right tabular-nums">{formatINR(paying)}</td>
            <td className="pr-3 text-right tabular-nums">{formatINR(left)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** What the table has been told to pay, each branch held to its own limit. */
export function clampedPay(rows: BranchPayRow[], value: PaymentAlloc): PaymentAlloc {
  return Object.fromEntries(rows.map((r) => [r.branch, Math.min(Math.max(0, value[r.branch] || 0), r.max)]));
}
export const totalPay = (rows: BranchPayRow[], value: PaymentAlloc): number => sumAlloc(clampedPay(rows, value));
