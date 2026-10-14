"use client";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { formatINR, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useBranchScope } from "@/lib/store/branch";
import { BRANCH_KEYS, branchLabel } from "@/lib/stock";
import { planVendorPayment, type PlanBill } from "@/lib/vendorPayPlan";
import { PAY_MODES, type PurchaseRow } from "./types";

const balanceOf = (p: PurchaseRow) => Math.max(0, p.totalAmount - p.amountPaid - p.paymentsTotal);

/** What each branch still owes on a bill — so a branch that has already paid its part isn't charged again. */
function weightsOf(p: PurchaseRow): Record<string, number> {
  if (p.branchOwed && Object.keys(p.branchOwed).length > 0) return p.branchOwed;
  if (p.openingBranch) return { [p.openingBranch]: 1 };
  const w: Record<string, number> = {};
  for (const l of p.lines) w[l.branch] = (w[l.branch] ?? 0) + l.quantity * l.unitCost;
  return w;
}

/**
 * Pay a vendor with one amount: it is spread over the unpaid bills, oldest first, and
 * the table shows exactly which bill gets what and which branch pays it before saving.
 */
export function PayVendorDialog({
  vendorName, vendorId, bills, onClose, onDone,
}: {
  vendorName: string;
  vendorId: string;
  bills: PurchaseRow[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const allowed = useBranchScope((s) => s.allowed);
  const allBranches = BRANCH_KEYS.every((b) => allowed.includes(b));

  const open = useMemo(
    () => bills.filter((b) => balanceOf(b) > 0).sort((a, b) => (a.purchaseDate || a.createdAt).localeCompare(b.purchaseDate || b.createdAt)),
    [bills],
  );
  const owed = open.reduce((n, b) => n + balanceOf(b), 0);

  const [amount, setAmount] = useState(owed);
  const [paidBy, setPaidBy] = useState<string>(allBranches ? "each" : allowed[0] ?? "each");
  const [mode, setMode] = useState<"CASH" | "UPI" | "CARD" | "BANK" | "OTHER">("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planBills: PlanBill[] = open.map((b) => ({ id: b.id, balance: balanceOf(b), weights: weightsOf(b) }));
  const plan = planVendorPayment(planBills, Math.min(amount, owed), paidBy);
  const placed = Object.values(plan.perBill).reduce((n, v) => n + v, 0);
  const nameOf = (b: PurchaseRow) => (b.openingBranch ? `Opening balance · ${branchLabel(b.openingBranch)}` : b.invoiceNo || b.id);

  const submit = async () => {
    if (amount <= 0) { setError("Enter the amount you are paying."); return; }
    if (amount > owed) { setError(`This vendor is only owed ${formatINR(owed)}.`); return; }
    if (placed !== amount) { setError(plan.skipped.length ? "The branch you chose can't pay enough of these bills — pick another or choose \"each branch\"." : "Nothing to pay this against."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: plan.rows, mode, reference, notes }),
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
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-ink-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-xl rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink-900">Pay {vendorName}</h3>
        <p className="mt-1 text-xs text-ink-500">Enter one amount. It pays the oldest unpaid bills first — the table shows where it goes.</p>
        <p className="mt-3 rounded-lg bg-ink-900/5 px-3 py-2 text-xs"><span className="text-ink-500">Total owed on these bills:</span> <b className="tabular-nums text-ink-900">{formatINR(owed)}</b></p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><label className={label}>Amount (₹)</label><MoneyInput value={amount} onChange={setAmount} className={field + " text-right tabular-nums"} /></div>
          <div>
            <label className={label}>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className={field}>
              {PAY_MODES.filter((m) => m && m !== "CREDIT").map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className={label}>Who pays</label>
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={field}>
            {allBranches && <option value="each">Each branch pays its own share of every bill</option>}
            {allowed.map((b) => <option key={b} value={b}>Only {branchLabel(b)} pays</option>)}
          </select>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-ink-100 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[9px] font-semibold uppercase tracking-wider text-ink-400">
                <th className="px-3 py-2">Bill</th>
                <th className="text-right">Owes</th>
                <th className="text-right">Pays now</th>
                <th className="pr-3 text-right">Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {open.map((b) => {
                const take = plan.perBill[b.id] ?? 0;
                const parts = plan.rows.filter((r) => r.purchaseId === b.id);
                const skipped = plan.skipped.includes(b.id);
                return (
                  <tr key={b.id} className={cn("align-top", take === 0 && "text-ink-400")}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-ink-900">{nameOf(b)}</p>
                      <p className="text-[10px] text-ink-400">{b.purchaseDate || b.createdAt.slice(0, 10)}</p>
                      {parts.length > 0 && <p className="mt-0.5 text-[10px] text-ink-500">{parts.map((r) => `${branchLabel(r.branch)} ${formatINR(r.amount)}`).join(" · ")}</p>}
                      {skipped && <p className="mt-0.5 text-[10px] text-danger">{branchLabel(paidBy)} didn&apos;t receive this bill&apos;s stock</p>}
                    </td>
                    <td className="text-right tabular-nums">{formatINR(balanceOf(b))}</td>
                    <td className="text-right font-semibold tabular-nums text-success">{take ? formatINR(take) : "—"}</td>
                    <td className="pr-3 text-right tabular-nums">{formatINR(balanceOf(b) - take)}</td>
                  </tr>
                );
              })}
              {open.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-ink-400">No unpaid bills.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 rounded-lg bg-ink-900/5 px-3 py-2 text-xs">
          <span className="text-ink-500">Paying:</span> <b className="tabular-nums text-ink-900">{formatINR(placed)}</b>
          {amount > placed && <><span className="mx-2 text-ink-300">·</span><span className="text-danger">{formatINR(amount - placed)} has no bill to go to</span></>}
          <span className="mx-2 text-ink-300">·</span>
          <span className="text-ink-500">Still owed after:</span> <b className="tabular-nums text-ink-900">{formatINR(owed - placed)}</b>
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className={label}>Reference (cheque / txn id)</label><input value={reference} onChange={(e) => setReference(e.target.value)} className={field} /></div>
          <div><label className={label}>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className={field} /></div>
        </div>
        {error && <p className="mt-3 text-xs font-semibold text-danger">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
          <button onClick={submit} disabled={saving || open.length === 0} className="flex-1 rounded-xl bg-ink-900 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800 disabled:opacity-60">
            <Check className="mr-1 inline h-4 w-4" /> {saving ? "Saving…" : "Save Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
