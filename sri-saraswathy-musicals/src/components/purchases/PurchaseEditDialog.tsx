"use client";
import { useState } from "react";
import { formatINR, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { computePurchaseTax, checkPurchaseTax, computeInclusiveTax, exclusiveCost, inclusiveCost } from "@/lib/gst/purchaseTax";
import { branchLabel } from "@/lib/stock";
import { BranchPayTable, enteredPay, overBranches, overMessage, type BranchPayRow } from "./BranchPayTable";
import { allocList, sumAlloc, type PaymentAlloc } from "@/lib/paymentAlloc";
import { splitByWeights } from "@/lib/vendorPayPlan";
import { PAY_MODES, receivingBranches, type PurchaseRow } from "./types";

const GST_RATES = [0, 5, 12, 18, 28];

/**
 * Edit a saved purchase invoice: header details, each line's cost and GST %, the
 * GST amounts and what was paid. Quantities and products are fixed here — they
 * have already moved stock, so a wrong one is fixed with a stock adjustment.
 */
export function PurchaseEditDialog({
  purchase, onClose, onDone,
}: {
  purchase: PurchaseRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [invoiceNo, setInvoiceNo] = useState(purchase.invoiceNo);
  const [purchaseDate, setPurchaseDate] = useState(purchase.purchaseDate);
  const [lines, setLines] = useState(() => purchase.lines.map((l) => ({ id: l.id, name: l.productName, variant: l.variant, branch: l.branch, quantity: l.quantity, unitCost: l.unitCost, gst: l.gst })));
  const [interState, setInterState] = useState(purchase.igst > 0);
  /** Show and type each cost with GST included (the stored cost is always before GST). */
  const [inclusive, setInclusive] = useState(true);
  const [cgst, setCgst] = useState(purchase.cgst);
  const [sgst, setSgst] = useState(purchase.sgst);
  const [igst, setIgst] = useState(purchase.igst);
  const receiving = receivingBranches(purchase);
  const [payAlloc, setPayAlloc] = useState<PaymentAlloc>(() => {
    if (purchase.paidAllocations) return purchase.paidAllocations;
    if (purchase.amountPaid <= 0) return {};
    // An older purchase with no split on record: show what the system had been assuming (by goods taken).
    const goods = Object.fromEntries(receiving.map((b) => [b, purchase.lines.filter((l) => l.branch === b).reduce((n, l) => n + l.quantity * l.unitCost, 0)]));
    return splitByWeights(purchase.amountPaid, goods);
  });
  const [notes, setNotes] = useState(purchase.notes);
  const [paymentMode, setPaymentMode] = useState(purchase.paymentMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLines = lines.length > 0;
  const subtotal = hasLines ? lines.reduce((n, l) => n + l.quantity * l.unitCost, 0) : purchase.subtotal;
  const tax = cgst + sgst + igst;
  const total = subtotal + tax;
  const taxProblem = hasLines ? checkPurchaseTax(lines.map((l) => ({ quantity: l.quantity, unitCost: l.unitCost, gst: l.gst })), { cgst, sgst, igst }) : null;
  const later = purchase.paymentsTotal;
  // Each branch's part of the (edited) total, by the goods it took; it can't have paid more than that.
  const goodsBy = Object.fromEntries(receiving.map((b) => [b, lines.filter((l) => l.branch === b).reduce((n, l) => n + l.quantity * l.unitCost, 0)]));
  const qtyBy = Object.fromEntries(receiving.map((b) => [b, lines.filter((l) => l.branch === b).reduce((n, l) => n + l.quantity, 0) || 1]));
  const shares = splitByWeights(total, Object.values(goodsBy).some((g) => g > 0) ? goodsBy : qtyBy);
  const payRows: BranchPayRow[] = receiving.map((b) => {
    const laterB = purchase.paidLater?.[b] ?? 0;
    return { branch: b, value: shares[b] || 0, paid: laterB, max: Math.max(0, (shares[b] || 0) - laterB) };
  });
  const paidSplit = enteredPay(payRows, payAlloc);
  const payOver = overBranches(payRows, paidSplit);
  const amountPaid = sumAlloc(paidSplit);

  /** Recompute the GST amounts from the lines (and set them; they can still be typed over for rounding). */
  const retax = (next: typeof lines, inter: boolean) => {
    const t = inclusive
      ? computeInclusiveTax(next.map((l) => ({ quantity: l.quantity, unitCost: inclusiveCost(l.unitCost, l.gst), gst: l.gst })), inter)
      : computePurchaseTax(next.map((l) => ({ quantity: l.quantity, unitCost: l.unitCost, gst: l.gst })), inter);
    setCgst(t.cgst); setSgst(t.sgst); setIgst(t.igst);
  };
  const editLine = (id: string, patch: Partial<(typeof lines)[number]>) => {
    const next = lines.map((l) => (l.id === id ? { ...l, ...patch } : l));
    setLines(next);
    retax(next, interState);
  };

  const submit = async () => {
    if (taxProblem) { setError(taxProblem); return; }
    if (payOver.length > 0) { setError(overMessage(payOver)); return; }
    if (amountPaid + later > total) { setError("Amount paid can't exceed the total."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/purchases/${purchase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNo, purchaseDate, cgst, sgst, igst, amountPaid, paymentMode, notes,
          ...(amountPaid > 0 ? { paidAllocations: allocList(paidSplit) } : {}),
          lines: lines.map((l) => ({ id: l.id, unitCost: l.unitCost, gst: l.gst })),
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(typeof b?.error === "string" ? b.error : "Save failed.");
      }
      onDone(`Updated ${purchase.invoiceNo || purchase.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setSaving(false);
    }
  };

  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";
  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const cell = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gold-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-3xl rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink-900">Edit purchase invoice</h3>
        <p className="mt-1 text-xs text-ink-500">{purchase.id}</p>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={label}>Vendor Invoice No</label><input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={field} /></div>
            <div><label className={label}>Purchase Date</label><input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={field} /></div>
          </div>

          {hasLines && (
            <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                    <th className="px-3 py-2">Item</th>
                    <th>Branch</th>
                    <th className="text-right">Qty</th>
                    <th className="w-32 px-2">{inclusive ? "Cost incl. GST ₹" : "Cost excl. GST ₹"}</th>
                    <th className="w-24 px-2">GST %</th>
                    <th className="pr-3 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2"><p className="font-medium text-ink-900">{l.name}</p>{l.variant && <p className="text-[11px] text-ink-400">{l.variant}</p>}</td>
                      <td className="text-xs text-ink-600">{branchLabel(l.branch)}</td>
                      <td className="text-right tabular-nums text-ink-600">{l.quantity}</td>
                      <td className="px-2"><MoneyInput value={inclusive ? inclusiveCost(l.unitCost, l.gst) : l.unitCost} onChange={(v) => editLine(l.id, { unitCost: inclusive ? exclusiveCost(v, l.gst) : v })} className={cell} /></td>
                      <td className="px-2">
                        <select value={l.gst} onChange={(e) => editLine(l.id, { gst: Number(e.target.value) })} className={cell}>
                          {[...new Set([...GST_RATES, l.gst])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td className="pr-3 text-right tabular-nums text-ink-700">{formatINR(l.quantity * (inclusive ? inclusiveCost(l.unitCost, l.gst) : l.unitCost))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-ink-100 px-3 py-2 text-[11px] text-ink-400">Quantity and product can&apos;t be changed here because the stock has already been received. Use a stock adjustment to correct them.</p>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-ink-600">
            <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} />
            Prices include GST
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-600">
            <input type="checkbox" checked={interState} onChange={(e) => { setInterState(e.target.checked); retax(lines, e.target.checked); }} />
            Inter-state purchase (IGST instead of CGST + SGST)
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={label}>CGST (₹)</label><MoneyInput value={cgst} onChange={setCgst} className={field + " text-right tabular-nums"} /></div>
            <div><label className={label}>SGST (₹)</label><MoneyInput value={sgst} onChange={setSgst} className={field + " text-right tabular-nums"} /></div>
            <div><label className={label}>IGST (₹)</label><MoneyInput value={igst} onChange={setIgst} className={field + " text-right tabular-nums"} /></div>
          </div>
          {taxProblem && <p className="text-xs font-semibold text-danger">{taxProblem}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={label}>Payment Mode</label>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={field}>
                {PAY_MODES.map((m) => <option key={m || "none"} value={m}>{m || "—"}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Paid at purchase — each branch pays its own part</label>
            <BranchPayTable rows={payRows} value={paidSplit} onChange={setPayAlloc} valueLabel="Its bill" payLabel="Paid at purchase" />
            {payOver.length > 0 && <p className="mt-1.5 text-[11px] font-semibold text-danger">{overMessage(payOver)}</p>}
          </div>
          <div><label className={label}>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(field, "resize-none")} /></div>
          <div className="rounded-lg bg-ink-900/5 px-3 py-2 text-xs">
            <span className="text-ink-500">Goods:</span> <span className="font-bold tabular-nums text-ink-900">{formatINR(subtotal)}</span>
            <span className="mx-2 text-ink-300">·</span>
            <span className="text-ink-500">GST:</span> <span className="font-bold tabular-nums text-ink-900">{formatINR(tax)}</span>
            <span className="mx-2 text-ink-300">·</span>
            <span className="text-ink-500">Grand total:</span> <span className="font-bold tabular-nums text-ink-900">{formatINR(total)}</span>
            <span className="mx-2 text-ink-300">·</span>
            <span className="text-ink-500">Balance:</span> <span className="font-bold tabular-nums text-ink-900">{formatINR(Math.max(0, total - amountPaid - later))}</span>
          </div>
          {error && <p className="text-xs font-semibold text-danger">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
            <button onClick={submit} disabled={saving || !!taxProblem || payOver.length > 0} className="flex-1 rounded-xl bg-ink-900 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800 disabled:opacity-60">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
