"use client";
import { cn, formatINR } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { PAY_METHODS, PAY_LABEL, resolvePayBox, type PayBox, type PayMethod } from "@/lib/paymentSplit";

const MODES: { id: PayBox["mode"]; label: string }[] = [
  ...PAY_METHODS.map((m) => ({ id: m as PayBox["mode"], label: PAY_LABEL[m] })),
  { id: "SPLIT", label: "Split" },
];

/**
 * How the customer paid: Cash, Card, UPI, or a split across all three. A single method left blank means
 * "paid in full". Cash handed over above the bill shows the change to return; less than the total leaves a balance.
 */
export function PaymentBox({ total, value, onChange, className }: { total: number; value: PayBox; onChange: (v: PayBox) => void; className?: string }) {
  const set = (m: PayMethod, paise: number) => onChange({ ...value, amounts: { ...value.amounts, [m]: paise > 0 ? paise : null } });
  const result = total > 0 ? resolvePayBox(value, total) : null;
  const field = "w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-right text-sm tabular-nums text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";

  return (
    <div className={cn("rounded-xl border border-ink-100 bg-[#FAF7EF] p-3", className)}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Payment</p>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-white p-1 ring-1 ring-ink-100">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange({ ...value, mode: m.id })}
            className={cn("rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-colors", value.mode === m.id ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:bg-ink-900/5")}
          >
            {m.label}
          </button>
        ))}
      </div>

      {value.mode === "SPLIT" ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {PAY_METHODS.map((m) => (
            <label key={m} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              {PAY_LABEL[m]}
              <MoneyInput value={value.amounts[m] ?? 0} onChange={(p) => set(m, p)} placeholder="₹ 0" className={cn(field, "mt-1")} />
            </label>
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            {PAY_LABEL[value.mode as PayMethod]} amount {value.mode === "CASH" ? "received" : "paid"}
            <MoneyInput
              value={value.amounts[value.mode as PayMethod] ?? 0}
              onChange={(p) => set(value.mode as PayMethod, p)}
              placeholder={total > 0 ? `${formatINR(total)} (full)` : "Full amount"}
              className={cn(field, "mt-1")}
            />
          </label>
        </div>
      )}

      {result &&
        (result.ok ? (
          <div className="mt-2 space-y-0.5 text-xs font-medium">
            {result.change > 0 && <p className="text-success">Change to return: {formatINR(result.change)}</p>}
            {result.balance > 0 ? <p className="text-danger">Balance due: {formatINR(result.balance)} (bill stays pending)</p> : <p className="text-success">Paid in full</p>}
          </div>
        ) : (
          <p className="mt-2 text-xs font-medium text-danger">{result.error}</p>
        ))}
    </div>
  );
}
