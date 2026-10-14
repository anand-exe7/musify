"use client";
import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { BRANCH_KEYS, branchLabel } from "@/lib/stock";
import { useVendors } from "@/lib/store/vendors";
import type { PurchaseRow } from "./types";

/**
 * What was already owed to a vendor before this system, per branch. Pass `existing`
 * to edit (or remove) one; otherwise it adds a new one for the chosen vendor.
 */
export function OpeningBalanceDialog({
  vendorId, existing, onClose, onDone,
}: {
  vendorId?: string;
  existing?: PurchaseRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const vendors = useVendors((s) => s.vendors);
  const [vendor, setVendor] = useState(existing?.vendorId ?? vendorId ?? "");
  const [branch, setBranch] = useState<string>(existing?.openingBranch ?? BRANCH_KEYS[0]);
  const [amount, setAmount] = useState(existing?.totalAmount ?? 0);
  const [asOf, setAsOf] = useState(existing?.purchaseDate ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (url: string, init: RequestInit, done: string) => {
    setSaving(true);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(typeof b?.error === "string" ? b.error : "Couldn't save.");
      }
      onDone(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setSaving(false);
    }
  };

  const submit = () => {
    if (!vendor) { setError("Pick the vendor."); return; }
    if (amount <= 0) { setError("Enter the amount owed."); return; }
    if (existing) return call(`/api/purchases/${existing.id}`, { method: "PATCH", body: JSON.stringify({ openingAmount: amount, purchaseDate: asOf, notes }) }, "Opening balance updated");
    return call(`/api/vendors/${vendor}/opening-balance`, { method: "POST", body: JSON.stringify({ branch, amount, asOf, notes }) }, "Opening balance added");
  };
  const remove = () => {
    if (existing && window.confirm("Remove this opening balance?")) void call(`/api/purchases/${existing.id}`, { method: "DELETE" }, "Opening balance removed");
  };

  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";
  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20 disabled:opacity-60";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink-900">{existing ? "Edit opening balance" : "Add opening balance"}</h3>
        <p className="mt-1 text-xs text-ink-500">What you already owed this vendor before using this system. It shows in outstandings and can be paid like any bill.</p>
        <div className="mt-4 space-y-4">
          <div>
            <label className={label}>Vendor</label>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} disabled={!!existing || !!vendorId} className={field}>
              <option value="">Select vendor…</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Branch that owes it</label>
              <select value={branch} onChange={(e) => setBranch(e.target.value)} disabled={!!existing} className={field}>
                {BRANCH_KEYS.map((b) => <option key={b} value={b}>{branchLabel(b)}</option>)}
              </select>
            </div>
            <div><label className={label}>As of</label><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={field} /></div>
          </div>
          <div><label className={label}>Amount owed (₹)</label><MoneyInput value={amount} onChange={setAmount} className={field + " text-right tabular-nums"} /></div>
          <div><label className={label}>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(field, "resize-none")} /></div>
          {error && <p className="text-xs font-semibold text-danger">{error}</p>}
          <div className="flex gap-2">
            {existing && (
              <button onClick={remove} disabled={saving} title="Remove" className="rounded-xl border border-danger/30 px-3 text-danger hover:bg-danger/5 disabled:opacity-60"><Trash2 className="h-4 w-4" /></button>
            )}
            <button onClick={onClose} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
            <button onClick={submit} disabled={saving} className="flex-1 rounded-xl bg-ink-900 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800 disabled:opacity-60">
              <Check className="mr-1 inline h-4 w-4" /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
