"use client";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Receipt } from "lucide-react";
import { formatINR, cn } from "@/lib/utils";
import { BRANCH_KEYS, branchLabel } from "@/lib/stock";
import type { BranchBill } from "@/lib/billShares";
import type { BillPayment } from "@/lib/db/queries/purchaseBills";
import type { PurchaseRow } from "./types";

export type BillDetail = PurchaseRow & { branches: BranchBill[]; payments: BillPayment[] };

const day = (d: string) => {
  const x = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return isNaN(+x) ? d : x.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * What opens under a bill line: what each branch has to pay, the items bought (per branch), the GST,
 * and every payment. Loaded only when the line is opened.
 */
export function BillDetailPanel({
  id, version, canEdit, onPay, onEdit,
}: {
  id: string;
  /** Changes whenever something was paid or edited, so the panel reloads. */
  version: number;
  canEdit: boolean;
  onPay: (d: BillDetail) => void;
  onEdit: (d: BillDetail) => void;
}) {
  const [d, setD] = useState<BillDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/purchases/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<BillDetail>) : Promise.reject(new Error(String(r.status)))))
      .then((x) => { if (alive) { setD(x); setError(false); } })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [id, version]);

  // The same item bought in several branches is one line with a quantity per branch.
  const items = useMemo(() => {
    const m = new Map<string, { name: string; variant: string; unitCost: number; gst: number; byBranch: Record<string, number>; qty: number }>();
    for (const l of d?.lines ?? []) {
      const k = `${l.productName}|${l.variant}|${l.unitCost}|${l.gst}`;
      const e = m.get(k) ?? { name: l.productName, variant: l.variant, unitCost: l.unitCost, gst: l.gst, byBranch: {}, qty: 0 };
      e.byBranch[l.branch] = (e.byBranch[l.branch] ?? 0) + l.quantity;
      e.qty += l.quantity;
      m.set(k, e);
    }
    return [...m.values()];
  }, [d]);

  if (error) return <p className="px-4 py-5 text-sm text-danger">Couldn&apos;t load this bill. Close it and open it again.</p>;
  if (!d) return <p className="px-4 py-5 text-sm text-ink-400">Loading the bill…</p>;

  const branches = d.branches;
  const sum = (f: (b: BranchBill) => number) => branches.reduce((n, b) => n + f(b), 0);
  const paidAll = d.amountPaid + d.paymentsTotal;
  const left = Math.max(0, d.totalAmount - paidAll);
  const showBranchCols = BRANCH_KEYS.filter((b) => items.some((i) => (i.byBranch[b] ?? 0) > 0));
  const th = "px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400";
  const gstTotal = d.tax || d.cgst + d.sgst + d.igst;

  const atPurchase = branches.filter((b) => b.paidAtPurchase > 0).map((b) => ({ key: `ap-${b.branch}`, at: d.purchaseDate || d.createdAt.slice(0, 10), branch: b.branch, mode: d.paymentMode || "—", ref: "At purchase", amount: b.paidAtPurchase }));
  const later = d.payments.map((p) => ({ key: p.id, at: p.paidAt, branch: p.branch, mode: p.mode || "—", ref: p.reference || "", amount: p.amount }));
  const history = [...atPurchase, ...later];

  return (
    <div className="space-y-5 border-t border-ink-100 bg-[#FAF7EF] px-4 py-5 md:px-6">
      {/* What each branch has to pay */}
      <section>
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-500">What each branch has to pay</h4>
        <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left">
                <th className={th}>Branch</th>
                {!d.openingBranch && <th className={cn(th, "text-right")}>Bought</th>}
                {!d.openingBranch && <th className={cn(th, "text-right")}>Goods</th>}
                {!d.openingBranch && <th className={cn(th, "text-right")}>GST</th>}
                <th className={cn(th, "text-right")}>Its bill</th>
                <th className={cn(th, "text-right")}>Paid</th>
                <th className={cn(th, "pr-4 text-right")}>Has to pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {branches.map((b) => (
                <tr key={b.branch} className="text-ink-800">
                  <td className="px-3 py-2.5 font-semibold text-ink-900">{branchLabel(b.branch)}</td>
                  {!d.openingBranch && <td className="px-3 text-right tabular-nums">{b.qty} pcs</td>}
                  {!d.openingBranch && <td className="px-3 text-right tabular-nums">{formatINR(b.goods)}</td>}
                  {!d.openingBranch && <td className="px-3 text-right tabular-nums">{formatINR(b.gst)}</td>}
                  <td className="px-3 text-right font-semibold tabular-nums">{formatINR(b.bill)}</td>
                  <td className="px-3 text-right tabular-nums text-success">
                    {formatINR(b.paid)}
                    {b.over > 0 && <span className="block text-[10px] font-semibold text-danger">{formatINR(b.over)} over its share</span>}
                  </td>
                  <td className={cn("pr-4 text-right font-bold tabular-nums", b.left > 0 ? "text-danger" : "text-success")}>{b.left > 0 ? formatINR(b.left) : "✓ paid"}</td>
                </tr>
              ))}
              {branches.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-xs text-ink-400">No branch is linked to this bill.</td></tr>}
            </tbody>
            {branches.length > 1 && (
              <tfoot>
                <tr className="border-t border-ink-100 bg-ink-900/5 text-xs font-bold text-ink-900">
                  <td className="px-3 py-2">Whole bill</td>
                  {!d.openingBranch && <td className="px-3 text-right tabular-nums">{sum((b) => b.qty)} pcs</td>}
                  {!d.openingBranch && <td className="px-3 text-right tabular-nums">{formatINR(sum((b) => b.goods))}</td>}
                  {!d.openingBranch && <td className="px-3 text-right tabular-nums">{formatINR(sum((b) => b.gst))}</td>}
                  <td className="px-3 text-right tabular-nums">{formatINR(sum((b) => b.bill))}</td>
                  <td className="px-3 text-right tabular-nums">{formatINR(sum((b) => b.paid))}</td>
                  <td className="pr-4 text-right tabular-nums">{formatINR(sum((b) => b.left))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {branches.some((b) => b.over > 0) && (
          <p className="mt-1.5 text-[11px] text-ink-500">A branch paid more than its share, so the bill itself has only {formatINR(left)} left — less than the branches&apos; &ldquo;has to pay&rdquo; add up to.</p>
        )}
      </section>

      {/* Items */}
      {!d.openingBranch && (
        <section>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-500">What was bought</h4>
          <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left">
                  <th className={th}>Item</th>
                  {showBranchCols.map((b) => <th key={b} className={cn(th, "text-right")}>{branchLabel(b)}</th>)}
                  <th className={cn(th, "text-right")}>Qty</th>
                  <th className={cn(th, "text-right")}>Rate</th>
                  <th className={cn(th, "text-right")}>GST</th>
                  <th className={cn(th, "pr-4 text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {items.map((i, k) => (
                  <tr key={k} className="text-ink-800">
                    <td className="px-3 py-2.5"><span className="font-medium text-ink-900">{i.name}</span>{i.variant && <span className="block text-[11px] text-ink-400">{i.variant}</span>}</td>
                    {showBranchCols.map((b) => <td key={b} className="px-3 text-right tabular-nums">{i.byBranch[b] ?? "—"}</td>)}
                    <td className="px-3 text-right font-semibold tabular-nums">{i.qty}</td>
                    <td className="px-3 text-right tabular-nums">{formatINR(i.unitCost)}</td>
                    <td className="px-3 text-right tabular-nums">{i.gst ? `${i.gst}%` : "—"}</td>
                    <td className="pr-4 text-right tabular-nums">{formatINR(i.qty * i.unitCost)}</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-ink-400">No items linked to this bill.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-500">
            Goods {formatINR(d.subtotal)}
            {d.igst > 0 ? <> · IGST {formatINR(d.igst)}</> : <> · CGST {formatINR(d.cgst)} · SGST {formatINR(d.sgst)}</>}
            {gstTotal > 0 && <> (GST {formatINR(gstTotal)})</>} · <b className="text-ink-900">Total {formatINR(d.totalAmount)}</b>
          </p>
        </section>
      )}

      {/* Payments */}
      <section>
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-500">Payments</h4>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 px-3 py-3 text-center text-xs text-ink-400">Nothing paid on this bill yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
            <table className="w-full min-w-[460px] text-sm">
              <tbody className="divide-y divide-ink-50">
                {history.map((h) => (
                  <tr key={h.key} className="text-ink-800">
                    <td className="px-3 py-2 text-xs text-ink-500">{day(h.at)}</td>
                    <td className="px-3 font-medium text-ink-900">{branchLabel(h.branch)}</td>
                    <td className="px-3 text-xs text-ink-500">{h.mode}{h.ref ? ` · ${h.ref}` : ""}</td>
                    <td className="px-3 text-right font-semibold tabular-nums text-success">{formatINR(h.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {d.notes && <p className="text-xs text-ink-500"><b className="text-ink-700">Notes:</b> {d.notes}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onPay(d)} disabled={left <= 0} className="inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-ivory-50 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40">
          <Receipt className="h-4 w-4" /> {left > 0 ? `Pay (${formatINR(left)} left)` : "Fully paid"}
        </button>
        {canEdit && (
          <button onClick={() => onEdit(d)} className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">
            <Pencil className="h-4 w-4" /> Edit bill
          </button>
        )}
      </div>
    </div>
  );
}
