"use client";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { branchLabel } from "@/lib/stock";
import { formatINR, cn } from "@/lib/utils";
import { fitPaymentAlloc, normalizeAlloc, sumAlloc, type PaymentAlloc } from "@/lib/paymentAlloc";

/**
 * How much each branch pays of one amount — entered like the stock split on a
 * purchase line. Change one branch and the rest moves to another, so the shares
 * always add up to `total`. With one branch it is just that branch paying all of it.
 */
export function PaymentSplit({
  branches, total, value, onChange, disabled,
}: {
  branches: string[];
  total: number;
  value: PaymentAlloc;
  onChange: (next: PaymentAlloc) => void;
  disabled?: boolean;
}) {
  const alloc = normalizeAlloc(value, total, branches);
  const single = branches.length <= 1;
  const input = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-right text-sm tabular-nums focus:border-gold-500 focus:outline-none disabled:opacity-60";

  const edit = (branch: string, paise: number) => {
    const v = Math.min(paise, total);
    const keep = branches.find((b) => b !== branch) ?? branch;
    onChange(fitPaymentAlloc({ ...alloc, [branch]: v }, total, keep, branches));
  };

  if (branches.length === 0) return <p className="text-xs text-ink-400">Add products first, so we know which branches are receiving stock.</p>;

  return (
    <div>
      <div className={cn("grid gap-3", branches.length > 1 ? "sm:grid-cols-2" : "")}>
        {branches.map((b) => (
          <div key={b}>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">{branchLabel(b)} pays (₹)</label>
            <MoneyInput value={alloc[b] || 0} onChange={(p) => edit(b, p)} disabled={disabled || single || total <= 0} className={input} placeholder="0" />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-400">
        {single
          ? `${branchLabel(branches[0])} pays the whole amount.`
          : total > 0
            ? `Split of ${formatINR(total)} across the branches, like the stock quantities. Change one and the other adjusts.`
            : "Enter an amount first, then split it between the branches."}
        {sumAlloc(alloc) !== total && total > 0 && <span className="font-semibold text-danger"> Shares don&apos;t add up.</span>}
      </p>
    </div>
  );
}
