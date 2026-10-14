"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { formatINR, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useBranchScope } from "@/lib/store/branch";
import { PaymentSplit } from "./PaymentSplit";
import { allocList, normalizeAlloc, sumAlloc, type PaymentAlloc } from "@/lib/paymentAlloc";
import { receivingBranches, type PurchaseRow } from "./types";

/** Record a part-payment against ONE purchase invoice; the branch you pick is charged the whole amount. */
export function PaymentDialog({
  purchase, vendorName, onClose, onDone,
}: {
  purchase: PurchaseRow;
  vendorName: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const allowed = useBranchScope((s) => s.allowed);
  const bal = Math.max(0, purchase.totalAmount - purchase.amountPaid - purchase.paymentsTotal);
  // Only a branch the stock went into can pay for it (and only one the user may act for).
  const receiving = receivingBranches(purchase);
  const options = receiving.filter((b) => allowed.includes(b));
  const [amount, setAmount] = useState<number>(bal);
  const [mode, setMode] = useState<"CASH" | "UPI" | "CARD" | "BANK" | "OTHER">("CASH");
  const [alloc, setAlloc] = useState<PaymentAlloc>({});
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const split = normalizeAlloc(alloc, amount, options);

  const submit = async () => {
    if (amount <= 0) { setError("Amount must be greater than 0."); return; }
    if (amount > bal) { setError(`Only ${formatINR(bal)} outstanding.`); return; }
    if (options.length === 0 || sumAlloc(split) !== amount) { setError("Split the payment across the branches."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/purchases/${purchase.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocations: allocList(split), mode, reference, notes }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(typeof b?.error === "string" ? b.error : "Couldn't record the payment.");
      }
      onDone(`Recorded ${formatINR(amount)} payment to ${vendorName}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed.");
      setSaving(false);
    }
  };

  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";
  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink-900">Record Payment</h3>
        <p className="mt-1 text-xs text-ink-500">{purchase.invoiceNo ? `${purchase.invoiceNo} · ` : ""}{purchase.id} · {vendorName}</p>
        <p className="mt-3 rounded-lg bg-ink-900/5 px-3 py-2 text-xs"><span className="text-ink-500">Outstanding on this invoice:</span> <span className="font-bold tabular-nums text-ink-900">{formatINR(bal)}</span></p>
        <div className="mt-4 space-y-4">
          <div><label className={label}>Amount (₹)</label><MoneyInput value={amount} onChange={setAmount} className={field + " text-right tabular-nums"} /></div>
          <div>
            <label className={label}>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className={field}>
              {(["CASH", "UPI", "CARD", "BANK", "OTHER"] as const).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Which branch pays it</label>
            <PaymentSplit branches={options} total={amount} value={alloc} onChange={setAlloc} />
          </div>
          <div><label className={label}>Reference (cheque / txn id)</label><input value={reference} onChange={(e) => setReference(e.target.value)} className={field} /></div>
          <div><label className={label}>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(field, "resize-none")} /></div>
          {error && <p className="text-xs font-semibold text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
            <button onClick={submit} disabled={saving} className="flex-1 rounded-xl bg-ink-900 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800 disabled:opacity-60">
              <Check className="mr-1 inline h-4 w-4" /> {saving ? "Saving…" : "Save Payment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
