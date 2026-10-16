"use client";
import { useEffect, useMemo, useState } from "react";
import { X, Receipt } from "lucide-react";
import { formatINR, cn } from "@/lib/utils";
import { PaymentDialog } from "@/components/purchases/PaymentDialog";
import { PayVendorDialog } from "@/components/purchases/PayVendorDialog";
import { OpeningBalanceDialog } from "@/components/purchases/OpeningBalanceDialog";
import { ApplyPaymentDialog, type LoosePayment } from "@/components/purchases/ApplyPaymentDialog";
import type { PurchaseRow } from "@/components/purchases/types";
import { useAuth } from "@/lib/store/auth";
import { type Branch, branchLabel } from "@/lib/stock";

interface StatementEntry {
  kind: "purchase" | "payment";
  id: string;
  at: string;
  branch?: Branch | null;
  amount: number;
  reference?: string;
  invoiceNo?: string;
  mode?: string;
  lines?: { productName: string; variant: string; quantity: number; unitCost: number; branch: string }[];
}

interface StatementResponse {
  entries: StatementEntry[];
  byBranch: Record<Branch, number>;
}


/* ──────────────── Statement drawer with on-account payment ──────────────── */
export function StatementDrawer({
  vendorId, vendorName, lockedBranch, onClose, onChanged,
}: {
  vendorId: string;
  vendorName: string;
  lockedBranch: Branch | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<StatementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = useAuth((s) => s.isAdmin);
  const [bills, setBills] = useState<PurchaseRow[]>([]);
  const [loose, setLoose] = useState<LoosePayment[]>([]);
  const [payBill, setPayBill] = useState<PurchaseRow | null>(null);
  const [payingVendor, setPayingVendor] = useState(false);
  const [applying, setApplying] = useState<LoosePayment | null>(null);
  const [addingOpening, setAddingOpening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/vendors/${vendorId}/statement`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setData((await res.json()) as StatementResponse);
      const [pr, lr] = await Promise.all([
        fetch(`/api/purchases?vendor=${encodeURIComponent(vendorId)}`, { cache: "no-store" }),
        fetch(`/api/vendors/${vendorId}/unapplied`, { cache: "no-store" }),
      ]);
      if (pr.ok) setBills((await pr.json()) as PurchaseRow[]);
      if (lr.ok) setLoose((await lr.json()) as LoosePayment[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load statement.");
    }
  };
  useEffect(() => { void load(); }, [vendorId]);

  const rows = useMemo(() => {
    if (!data) return [] as (StatementEntry & { running: number })[];
    let running = 0;
    return data.entries.map((e) => {
      running += e.kind === "purchase" ? e.amount : -e.amount;
      return { ...e, running };
    });
  }, [data]);

  const outstanding = rows.length > 0 ? rows[rows.length - 1].running : 0;

  const done = async (msg: string) => {
    setPayBill(null); setPayingVendor(false); setApplying(null); setAddingOpening(false);
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
    await load();
    await onChanged();
  };
  const balanceOf = (p: PurchaseRow) => Math.max(0, p.totalAmount - p.amountPaid - p.paymentsTotal);
  const unpaid = bills.filter((p) => balanceOf(p) > 0).sort((x, y) => (x.purchaseDate || x.createdAt).localeCompare(y.purchaseDate || y.createdAt));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-950/40 backdrop-blur-sm" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-ivory-50 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-ivory-50 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Vendor Statement</p>
            <h3 className="text-lg font-bold text-ink-900">{vendorName}</h3>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
        </header>

        <div className="px-5 py-4">
          {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">{error}</p>}
          {!data && !error ? <p className="py-16 text-center text-sm text-ink-400">Loading this vendor&apos;s bills…</p> : <>
          <div className="mb-4 flex items-center justify-between rounded-xl bg-ink-900/5 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">Current outstanding</span>
            <span className={cn("text-lg font-bold tabular-nums", outstanding > 0 ? "text-danger" : "text-ink-900")}>{formatINR(outstanding)}</span>
          </div>

          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Unpaid bills</h4>
              <div className="flex items-center gap-3">
                {unpaid.length > 0 && (
                  <button onClick={() => setPayingVendor(true)} className="rounded-lg bg-gold-500 px-3 py-1 text-xs font-bold text-ink-900 hover:bg-gold-400">Pay vendor</button>
                )}
                {isAdmin && (
                  <button onClick={() => setAddingOpening(true)} className="text-xs font-semibold text-gold-600 hover:underline">+ Opening balance</button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {unpaid.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{b.openingBranch ? `Opening balance · ${branchLabel(b.openingBranch)}` : b.invoiceNo || b.id}</p>
                    <p className="text-[11px] text-ink-400">{b.purchaseDate || b.createdAt.slice(0, 10)} · total {formatINR(b.totalAmount)}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-danger">{formatINR(balanceOf(b))}</span>
                  <button onClick={() => setPayBill(b)} className="inline-flex items-center gap-1 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-ink-800">
                    <Receipt className="h-3.5 w-3.5" /> Pay
                  </button>
                </div>
              ))}
              {unpaid.length === 0 && <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-400">No unpaid bills.</p>}
            </div>
            <p className="mt-2 text-[11px] text-ink-400">Pay one bill with its Pay button, or use Pay vendor to spread one amount over the oldest bills. Either way each payment lands on a bill, so every invoice shows what is still owed on it.</p>
          </div>

          {loose.length > 0 && (
            <div className="mb-5 rounded-xl border border-gold-500/40 bg-gold-500/5 p-3">
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-ink-600">Payments not against a bill</h4>
              <p className="mb-2 text-[11px] text-ink-500">Paid to the vendor before payments had to name a bill.{isAdmin ? " Apply each one to the bills it settled." : " An admin can apply them to bills."}</p>
              <div className="space-y-1.5">
                {loose.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 text-xs">
                    <span className="flex-1 text-ink-700">{l.paidAt.slice(0, 10)} · {branchLabel(l.branch)} · {l.mode || "—"}</span>
                    <b className="tabular-nums text-ink-900">{formatINR(l.amount)}</b>
                    {isAdmin && <button onClick={() => setApplying(l)} className="rounded-lg border border-ink-200 px-2.5 py-1 font-semibold text-ink-700 hover:bg-ink-900/5">Apply to bills</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">Ledger</h4>
          <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[9px] font-semibold uppercase tracking-wider text-ink-400">
                  <th className="px-3 py-2">Date</th>
                  <th>Entry</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th className="pr-3 text-right">Running</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {rows.map((r) => (
                  <tr key={r.id} className="text-ink-700">
                    <td className="px-3 py-2 text-ink-500">{r.at.slice(0, 10)}</td>
                    <td>
                      <p className="font-medium text-ink-900">{r.kind === "purchase" ? `Purchase ${r.id}` : `Payment${r.mode ? ` · ${r.mode}` : ""}`}</p>
                      <p className="text-[10px] text-ink-400">{branchLabel(r.branch)}{r.invoiceNo ? ` · Inv ${r.invoiceNo}` : ""}{r.reference ? ` · ${r.reference}` : ""}</p>
                      {r.lines && r.lines.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-[10px] text-ink-500">
                          {r.lines.map((l, i) => (
                            <li key={i}>
                              {l.productName}{l.variant ? ` (${l.variant})` : ""} — {l.quantity} × {formatINR(l.unitCost)}
                              <span className="text-ink-400"> · {branchLabel(l.branch)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{r.kind === "purchase" ? formatINR(r.amount) : "—"}</td>
                    <td className="text-right tabular-nums text-success">{r.kind === "payment" ? formatINR(r.amount) : "—"}</td>
                    <td className={cn("pr-3 text-right font-semibold tabular-nums", r.running > 0 ? "text-danger" : "text-ink-500")}>{formatINR(r.running)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-ink-400">No ledger entries yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>}
        </div>
        {payingVendor && <PayVendorDialog vendorId={vendorId} vendorName={vendorName} bills={bills} onClose={() => setPayingVendor(false)} onDone={done} />}
        {payBill && <PaymentDialog purchase={payBill} vendorName={vendorName} onClose={() => setPayBill(null)} onDone={done} />}
        {addingOpening && <OpeningBalanceDialog vendorId={vendorId} onClose={() => setAddingOpening(false)} onDone={done} />}
        {applying && <ApplyPaymentDialog payment={applying} bills={bills} onClose={() => setApplying(null)} onDone={done} />}
        {toast && <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>}
      </aside>
    </div>
  );
}
