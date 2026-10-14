"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { branchLabel } from "@/lib/stock";
import type { PurchaseRow } from "./types";

export interface LoosePayment { id: string; amount: number; branch: string; mode: string; paidAt: string; reference: string }

const balanceOf = (p: PurchaseRow) => Math.max(0, p.totalAmount - p.amountPaid - p.paymentsTotal);

/**
 * A payment that was made to the vendor in general: choose which bills it settles.
 * Prefilled oldest bill first; whatever isn't used stays as an unassigned payment.
 */
export function ApplyPaymentDialog({
  payment, bills, onClose, onDone,
}: {
  payment: LoosePayment;
  bills: PurchaseRow[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const open = bills
    .filter((b) => balanceOf(b) > 0)
    .sort((a, b) => (a.purchaseDate || a.createdAt).localeCompare(b.purchaseDate || b.createdAt));
  const [shares, setShares] = useState<Record<string, number>>(() => {
    let left = payment.amount;
    const out: Record<string, number> = {};
    for (const b of open) {
      const take = Math.min(left, balanceOf(b));
      if (take > 0) out[b.id] = take;
      left -= take;
    }
    return out;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = Object.values(shares).reduce((n, v) => n + v, 0);

  const submit = async () => {
    if (used <= 0) { setError("Enter an amount against at least one bill."); return; }
    if (used > payment.amount) { setError(`That's more than the ${formatINR(payment.amount)} payment.`); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/vendor-payments/${payment.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shares: Object.entries(shares).filter(([, a]) => a > 0).map(([purchaseId, amount]) => ({ purchaseId, amount })) }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(typeof b?.error === "string" ? b.error : "Couldn't apply the payment.");
      }
      onDone("Payment applied to the bills");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't apply the payment.");
      setSaving(false);
    }
  };

  const cell = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gold-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink-900">Apply payment to bills</h3>
        <p className="mt-1 text-xs text-ink-500">
          {formatINR(payment.amount)} · {branchLabel(payment.branch)} · {payment.mode || "—"} · {payment.paidAt.slice(0, 10)}{payment.reference ? ` · ${payment.reference}` : ""}
        </p>
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {open.map((b) => (
            <div key={b.id} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{b.openingBranch ? "Opening balance" : b.invoiceNo || b.id}</p>
                <p className="text-[11px] text-ink-400">{b.purchaseDate || b.createdAt.slice(0, 10)} · owes {formatINR(balanceOf(b))}</p>
              </div>
              <div className="w-32">
                <MoneyInput value={shares[b.id] ?? 0} onChange={(v) => setShares((m) => ({ ...m, [b.id]: Math.min(v, balanceOf(b)) }))} className={cell} />
              </div>
            </div>
          ))}
          {open.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No unpaid bills for this vendor.</p>}
        </div>
        <p className="mt-3 rounded-lg bg-ink-900/5 px-3 py-2 text-xs">
          <span className="text-ink-500">Applied:</span> <b className="tabular-nums text-ink-900">{formatINR(used)}</b>
          <span className="mx-2 text-ink-300">·</span>
          <span className="text-ink-500">Left unassigned:</span> <b className="tabular-nums text-ink-900">{formatINR(Math.max(0, payment.amount - used))}</b>
        </p>
        {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
          <button onClick={submit} disabled={saving || open.length === 0} className="flex-1 rounded-xl bg-ink-900 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800 disabled:opacity-60">
            <Check className="mr-1 inline h-4 w-4" /> {saving ? "Saving…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
