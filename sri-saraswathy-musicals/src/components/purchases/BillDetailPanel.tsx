"use client";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Receipt, Trash2, BarChart3, Loader2 } from "lucide-react";
import { formatINR, cn } from "@/lib/utils";
import { BRANCH_KEYS, branchLabel } from "@/lib/stock";
import type { BranchBill } from "@/lib/billShares";
import type { BillPayment } from "@/lib/db/queries/purchaseBills";
import type { PurchaseRow } from "./types";
import { LoadingInline } from "@/components/admin/LoadState";

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
  id, version, canEdit, onPay, onEdit, onDeleted, onLinkChange,
}: {
  id: string;
  /** Changes whenever something was paid or edited, so the panel reloads. */
  version: number;
  canEdit: boolean;
  onPay: (d: BillDetail) => void;
  onEdit: (d: BillDetail) => void;
  onDeleted: () => void;
  /** Told when "Subtract in analytics" is switched, so the bill's line can show it. */
  onLinkChange?: (on: boolean) => void;
}) {
  const [d, setD] = useState<BillDetail | null>(null);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState("");
  /** Whether deleting the bill also takes its stock back out; leaving stock alone is the safe default. */
  const [stockMode, setStockMode] = useState<"keep" | "reverse">("keep");
  const [linking, setLinking] = useState(false);
  const [tab, setTab] = useState<"branches" | "items" | "payments">("branches");

  /** EXP-01: link / unlink this vendor bill to the analytics deduction. */
  const toggleAnalytics = async () => {
    if (!d) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/purchases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inAnalytics: !d.inAnalytics }) });
      if (res.ok) { setD({ ...d, inAnalytics: !d.inAnalytics }); onLinkChange?.(!d.inAnalytics); }
      else alert("Couldn't change the analytics link.");
    } finally {
      setLinking(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    setDelError("");
    try {
      const res = await fetch(`/api/purchases/${id}?stock=${stockMode}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setDelError(body.error || body.message || "Couldn't delete this bill. Try again.");
        return;
      }
      onDeleted();
    } catch {
      setDelError("Couldn't reach the server. Try again.");
    } finally {
      setDeleting(false);
    }
  };

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
  if (!d) return <div className="border-t border-ink-100 px-4 py-6 text-center"><LoadingInline label="Loading the bill…" /></div>;

  const branches = d.branches;
  const paidAll = d.amountPaid + d.paymentsTotal;
  const left = Math.max(0, d.totalAmount - paidAll);
  const showBranchCols = BRANCH_KEYS.filter((b) => items.some((i) => (i.byBranch[b] ?? 0) > 0));
  const th = "px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400";
  const gstTotal = d.tax || d.cgst + d.sgst + d.igst;

  const atPurchase = branches.filter((b) => b.paidAtPurchase > 0).map((b) => ({ key: `ap-${b.branch}`, at: d.purchaseDate || d.createdAt.slice(0, 10), branch: b.branch, mode: d.paymentMode || "—", ref: "At purchase", amount: b.paidAtPurchase }));
  const later = d.payments.map((p) => ({ key: p.id, at: p.paidAt, branch: p.branch, mode: p.mode || "—", ref: p.reference || "", amount: p.amount }));
  const history = [...atPurchase, ...later];

  const tabs = [
    ["branches", "Branches", branches.length],
    ...(!d.openingBranch ? [["items", "Items", items.length] as const] : []),
    ["payments", "Payments", history.length],
  ] as const;
  const shownTab = tabs.some(([k]) => k === tab) ? tab : "branches";

  return (
    <div className="border-t border-ink-100 bg-[#FAF7EF] px-4 py-4 md:px-5">
      {/* Bill at a glance */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fig k="Bill total" v={formatINR(d.totalAmount)} />
        <Fig k="GST" v={gstTotal > 0 ? formatINR(gstTotal) : "—"} sub={d.igst > 0 ? "IGST" : gstTotal > 0 ? "CGST + SGST" : undefined} />
        <Fig k="Paid" v={formatINR(paidAll)} tone="text-success" sub={d.paymentMode ? `At purchase: ${d.paymentMode}` : undefined} />
        <Fig k="Left to pay" v={left > 0 ? formatINR(left) : "Nothing"} tone={left > 0 ? "text-danger" : "text-success"} />
      </div>

      {/* One section at a time, so an open bill stays short */}
      <div className="mt-4 flex items-center gap-1 border-b border-ink-100">
        {tabs.map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition-colors", shownTab === k ? "border-gold-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900")}>
            {l} <span className={cn("ml-1 rounded-full px-1.5 py-0.5 text-[10px]", shownTab === k ? "bg-gold-500/15 text-gold-800" : "bg-ink-900/5 text-ink-500")}>{n}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-ink-100 bg-white">
        {shownTab === "branches" && (
          <table className="w-full min-w-[520px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-ink-100 text-left">
                <th className={th}>Branch</th>
                {!d.openingBranch && <th className={cn(th, "text-right")}>Pcs</th>}
                {!d.openingBranch && <th className={cn(th, "text-right")}>Goods + GST</th>}
                <th className={cn(th, "text-right")}>Its bill</th>
                <th className={cn(th, "text-right")}>Paid</th>
                <th className={cn(th, "pr-4 text-right")}>Has to pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {branches.map((b) => (
                <tr key={b.branch} className="text-ink-800">
                  <td className="px-3 py-2 font-semibold text-ink-900">{branchLabel(b.branch)}</td>
                  {!d.openingBranch && <td className="px-3 text-right tabular-nums">{b.qty}</td>}
                  {!d.openingBranch && <td className="px-3 text-right text-xs tabular-nums text-ink-500">{formatINR(b.goods)} + {formatINR(b.gst)}</td>}
                  <td className="px-3 text-right font-semibold tabular-nums">{formatINR(b.bill)}</td>
                  <td className="px-3 text-right tabular-nums text-success">
                    {formatINR(b.paid)}
                    {b.over > 0 && <span className="block text-[10px] font-semibold text-danger">{formatINR(b.over)} over its share</span>}
                  </td>
                  <td className={cn("pr-4 text-right font-bold tabular-nums", b.left > 0 ? "text-danger" : "text-success")}>{b.left > 0 ? formatINR(b.left) : "✓ Paid"}</td>
                </tr>
              ))}
              {branches.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-ink-400">No branch is linked to this bill.</td></tr>}
            </tbody>
          </table>
        )}

        {shownTab === "items" && (
          <table className="w-full min-w-[520px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-ink-100 text-left">
                <th className={th}>Item</th>
                {showBranchCols.map((b) => <th key={b} className={cn(th, "text-right")}>{branchLabel(b)}</th>)}
                <th className={cn(th, "text-right")}>Qty</th>
                <th className={cn(th, "text-right")}>Rate</th>
                <th className={cn(th, "pr-4 text-right")}>Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {items.map((i, k) => (
                <tr key={k} className="text-ink-800">
                  <td className="max-w-[16rem] px-3 py-2"><span className="block truncate font-medium text-ink-900">{i.name}</span>{i.variant && <span className="block truncate text-[11px] text-ink-400">{i.variant}{i.gst ? ` · GST ${i.gst}%` : ""}</span>}</td>
                  {showBranchCols.map((b) => <td key={b} className="px-3 text-right tabular-nums text-ink-500">{i.byBranch[b] ?? "—"}</td>)}
                  <td className="px-3 text-right font-semibold tabular-nums">{i.qty}</td>
                  <td className="px-3 text-right tabular-nums">{formatINR(i.unitCost)}</td>
                  <td className="pr-4 text-right tabular-nums">{formatINR(i.qty * i.unitCost)}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-xs text-ink-400">No items linked to this bill.</td></tr>}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="border-t border-ink-100 bg-ink-900/[0.03] text-xs text-ink-600">
                  <td colSpan={showBranchCols.length + 4} className="px-3 py-2 text-right">
                    Goods {formatINR(d.subtotal)} {d.igst > 0 ? <>· IGST {formatINR(d.igst)}</> : <>· CGST {formatINR(d.cgst)} · SGST {formatINR(d.sgst)}</>}
                  </td>
                  <td className="pr-4 text-right font-bold tabular-nums text-ink-900">{formatINR(d.totalAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {shownTab === "payments" && (history.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-ink-400">Nothing paid on this bill yet.</p>
        ) : (
          <table className="w-full min-w-[460px] text-sm">
            <tbody className="divide-y divide-ink-50">
              {history.map((h) => (
                <tr key={h.key} className="text-ink-800">
                  <td className="px-3 py-2 text-xs text-ink-500">{day(h.at)}</td>
                  <td className="px-3 font-medium text-ink-900">{branchLabel(h.branch)}</td>
                  <td className="px-3"><span className="rounded bg-ink-900/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-600">{h.mode}</span>{h.ref && <span className="ml-1.5 text-xs text-ink-400">{h.ref}</span>}</td>
                  <td className="pr-4 text-right font-semibold tabular-nums text-success">{formatINR(h.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      {shownTab === "branches" && branches.some((b) => b.over > 0) && (
        <p className="mt-1.5 text-[11px] text-ink-500">A branch paid more than its share, so the bill itself has only {formatINR(left)} left.</p>
      )}

      {d.notes && <p className="mt-3 truncate text-xs text-ink-500" title={d.notes}><b className="text-ink-700">Notes:</b> {d.notes}</p>}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => onPay(d)} disabled={left <= 0} className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3.5 py-2 text-xs font-semibold text-ivory-50 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40">
          <Receipt className="h-3.5 w-3.5" /> {left > 0 ? `Pay ${formatINR(left)}` : "Fully paid"}
        </button>
        {canEdit && (
          <button
            onClick={() => void toggleAnalytics()}
            disabled={linking}
            role="switch"
            aria-checked={!!d.inAnalytics}
            title="Subtract the payments on this bill from the sales analytics, under their payment mode"
            className={cn("inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50", d.inAnalytics ? "border-danger/40 bg-danger/[0.07] text-danger" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-900/5")}
          >
            {linking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
            {d.inAnalytics ? "Subtracted in analytics · on" : "Subtract in analytics · off"}
          </button>
        )}
        <span className="flex-1" />
        {canEdit && (
          <button onClick={() => onEdit(d)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-900/5">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        )}
        {canEdit && !confirming && (
          <button onClick={() => { setConfirming(true); setDelError(""); }} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/10">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm">
          <p className="font-semibold text-ink-900">Delete this {d.openingBranch ? "old balance" : "bill"}?</p>
          {d.openingBranch ? (
            <p className="mt-1 text-xs text-ink-600">It disappears from the vendor&apos;s balance. It never touched stock, so nothing else changes.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {([
                ["keep", "Delete the bill only — keep the stock",
                  `The bill, its items and what the branches owe on it are removed from the vendor's account. The ${items.reduce((n, i) => n + i.qty, 0)} pcs it brought in stay on the shelves exactly as they are, so inventory does not change. Choose this when the goods really arrived and only the paperwork is wrong or duplicated.`],
                ["reverse", "Delete the bill and take its stock back out",
                  "The bill is removed and the pieces it added are subtracted from each branch's stock, as if it was never received. Choose this when the goods never came in (a mistaken or cancelled purchase). If any of those pieces have already been sold or moved, this is refused and nothing changes."],
              ] as const).map(([k, title, text]) => (
                <label key={k} className={cn("flex cursor-pointer gap-2.5 rounded-lg border bg-white p-3", stockMode === k ? "border-danger/60" : "border-ink-100")}>
                  <input type="radio" name={`stock-${id}`} checked={stockMode === k} onChange={() => setStockMode(k)} className="mt-0.5 accent-danger" />
                  <span><b className="block text-xs text-ink-900">{title}</b><span className="mt-0.5 block text-[11px] leading-relaxed text-ink-600">{text}</span></span>
                </label>
              ))}
            </div>
          )}
          {paidAll > 0 && <p className="mt-2 text-xs text-ink-600">Money already paid against this bill is not lost: payments recorded later stay on the vendor&apos;s account as unassigned payments you can apply to another bill.</p>}
          {delError && <p className="mt-2 text-xs font-semibold text-danger">{delError}</p>}
          <div className="mt-3 flex gap-2">
            <button disabled={deleting} onClick={() => setConfirming(false)} className="rounded-lg border border-ink-200 px-4 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-900/5">Keep it</button>
            <button disabled={deleting} onClick={() => void remove()} className="rounded-lg bg-danger px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">{deleting ? "Deleting…" : "Yes, delete"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One figure in the bill's at-a-glance strip. */
function Fig({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-100 bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{k}</p>
      <p className={cn("truncate text-base font-bold tabular-nums text-ink-900", tone)}>{v}</p>
      {sub && <p className="truncate text-[10px] text-ink-400">{sub}</p>}
    </div>
  );
}
