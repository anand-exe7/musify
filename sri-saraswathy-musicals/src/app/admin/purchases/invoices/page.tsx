"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Receipt, Pencil, Download, ChevronDown, Plus } from "lucide-react";
import { useVendors } from "@/lib/store/vendors";
import { useBranchScope } from "@/lib/store/branch";
import { useAuth } from "@/lib/store/auth";
import { formatINR, cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { branchLabel } from "@/lib/stock";
import { PaymentDialog } from "@/components/purchases/PaymentDialog";
import { PurchaseEditDialog } from "@/components/purchases/PurchaseEditDialog";
import type { PurchaseRow } from "@/components/purchases/types";

function fmt(d: string) {
  const x = new Date(d);
  return isNaN(+x) ? d : x.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** yyyy-mm-dd the purchase counts for (the user-entered date, else when it was saved). */
const dayOf = (p: PurchaseRow) => p.purchaseDate || p.createdAt.slice(0, 10);

export default function PurchaseInvoicesPage() {
  const vendors = useVendors((s) => s.vendors);
  const hydrateVendors = useVendors((s) => s.hydrate);
  const allowed = useBranchScope((s) => s.allowed);
  const isAdmin = useAuth((s) => s.isAdmin);

  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branch, setBranch] = useState("all");
  const [paying, setPaying] = useState<PurchaseRow | null>(null);
  const [editing, setEditing] = useState<PurchaseRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/purchases", { cache: "no-store" });
      if (!res.ok) throw new Error("purchases");
      setPurchases((await res.json()) as PurchaseRow[]);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void hydrateVendors();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [hydrateVendors]);

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  };
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return purchases.filter((p) => {
      const day = dayOf(p);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (branch !== "all" && !p.lines.some((l) => l.branch === branch)) return false;
      if (!q) return true;
      return p.id.toLowerCase().includes(q) || p.invoiceNo.toLowerCase().includes(q) || vendorName(p.vendorId).toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, query, from, to, branch, vendors]);

  const totals = useMemo(
    () => filtered.reduce((t, p) => ({ total: t.total + p.totalAmount, paid: t.paid + p.amountPaid + p.paymentsTotal }), { total: 0, paid: 0 }),
    [filtered],
  );
  const hasFilter = !!(from || to || branch !== "all" || query.trim());

  const exportCSV = () => {
    const r2 = (paise: number) => (paise / 100).toFixed(2);
    const head = ["Date", "Purchase ID", "Vendor Invoice", "Vendor", "Branches", "Subtotal", "CGST", "SGST", "IGST", "Total", "Paid", "Balance", "Mode", "Notes"];
    const body = filtered.map((p) => [
      dayOf(p), p.id, p.invoiceNo, vendorName(p.vendorId),
      [...new Set(p.lines.map((l) => branchLabel(l.branch)))].join(" / "),
      r2(p.subtotal), r2(p.cgst), r2(p.sgst), r2(p.igst), r2(p.totalAmount),
      r2(p.amountPaid + p.paymentsTotal), r2(Math.max(0, p.totalAmount - p.amountPaid - p.paymentsTotal)),
      p.paymentMode, p.notes,
    ]);
    downloadCsv(`purchase-invoices-${Date.now()}.csv`, [head, ...body]);
  };

  const input = "rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none";

  return (
    <div className="p-5 md:p-8">
      {paying && (
        <PaymentDialog
          purchase={paying}
          vendorName={vendorName(paying.vendorId)}
          onClose={() => setPaying(null)}
          onDone={async (m) => { setPaying(null); notify(m); await load(); }}
        />
      )}
      {editing && (
        <PurchaseEditDialog
          purchase={editing}
          onClose={() => setEditing(null)}
          onDone={async (m) => { setEditing(null); notify(m); await load(); }}
        />
      )}
      {toast && <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-l-4 border-ink-900 pl-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Purchase Invoices</h1>
          <p className="mt-1 text-sm text-ink-500">Every vendor bill you&apos;ve recorded. Pay a bill, or edit its costs, GST and amount paid.</p>
        </div>
        <Link href="/admin/purchases" className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900">
          <Plus className="h-4 w-4" /> New purchase
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">From
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={cn(input, "mt-1 block")} />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">To
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cn(input, "mt-1 block")} />
        </label>
        {allowed.length > 1 && (
          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Branch
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={cn(input, "mt-1 block")}>
              <option value="all">All branches</option>
              {allowed.map((b) => <option key={b} value={b}>{branchLabel(b)}</option>)}
            </select>
          </label>
        )}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search purchase / invoice / vendor…" className={cn(input, "w-64")} />
        {hasFilter && (
          <button onClick={() => { setFrom(""); setTo(""); setBranch("all"); setQuery(""); }} className="text-xs font-semibold text-gold-600 hover:underline">Clear filters</button>
        )}
        <button onClick={exportCSV} disabled={filtered.length === 0} className="ml-auto flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-50">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>
      <p className="mb-3 text-xs text-ink-500">
        {filtered.length} invoice{filtered.length === 1 ? "" : "s"} · billed <b className="tabular-nums text-ink-900">{formatINR(totals.total)}</b> · paid <b className="tabular-nums text-ink-900">{formatINR(totals.paid)}</b> · balance <b className="tabular-nums text-ink-900">{formatINR(Math.max(0, totals.total - totals.paid))}</b>
      </p>

      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
        <table className="w-full min-w-[980px] whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              <th className="px-4 py-3">Date</th>
              <th>Purchase ID</th>
              <th>Vendor Invoice</th>
              <th>Vendor</th>
              <th>Branch</th>
              <th className="text-right">Goods</th>
              <th className="text-right">GST</th>
              <th className="text-right">Total</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
              <th className="pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            {filtered.map((p) => {
              const paidAll = p.amountPaid + p.paymentsTotal;
              const bal = Math.max(0, p.totalAmount - paidAll);
              const gstTotal = p.tax || p.cgst + p.sgst + p.igst;
              const branches = [...new Set(p.lines.map((l) => branchLabel(l.branch)))];
              return (
                <Fragment key={p.id}>
                  <tr className="text-ink-700">
                    <td className="px-4 py-3 text-xs text-ink-500">{dayOf(p)}<div className="text-[10px] text-ink-400">{fmt(p.createdAt)}</div></td>
                    <td className="font-semibold text-ink-900">
                      <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="inline-flex items-center gap-1 hover:text-gold-600" title="Show items bought">
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded === p.id && "rotate-180")} />
                        {p.id}
                      </button>
                      <div className="pl-5 text-[10px] font-normal text-ink-400">{p.lines.length} item{p.lines.length === 1 ? "" : "s"}</div>
                    </td>
                    <td className="text-ink-600">{p.invoiceNo || <span className="text-ink-300">—</span>}</td>
                    <td className="text-ink-700">{vendorName(p.vendorId)}</td>
                    <td className="text-xs text-ink-600">{branches.join(" · ") || "—"}</td>
                    <td className="text-right tabular-nums">{formatINR(p.subtotal)}</td>
                    <td className="text-right tabular-nums">{gstTotal ? formatINR(gstTotal) : "—"}</td>
                    <td className="text-right font-semibold tabular-nums text-ink-900">{formatINR(p.totalAmount)}</td>
                    <td className="text-right tabular-nums text-success">{formatINR(paidAll)}</td>
                    <td className={cn("text-right font-semibold tabular-nums", bal > 0 ? "text-danger" : "text-ink-400")}>{bal > 0 ? formatINR(bal) : "—"}</td>
                    <td className="pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setPaying(p)} disabled={bal <= 0} title={bal > 0 ? "Record a payment" : "Fully paid"} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-900/5 hover:text-gold-600 disabled:cursor-not-allowed disabled:opacity-40">
                          <Receipt className="h-3.5 w-3.5" /> Pay
                        </button>
                        {isAdmin && (
                          <button onClick={() => setEditing(p)} title="Edit purchase invoice" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-900/5 hover:text-gold-600">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === p.id && (
                    <tr className="bg-[#FAF7EF]">
                      <td colSpan={11} className="px-4 py-3">
                        <table className="w-full max-w-3xl text-xs">
                          <thead>
                            <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                              <th className="py-1">Item</th><th>Variant</th><th>Branch</th><th className="text-right">Qty</th><th className="text-right">Unit cost</th><th className="text-right">GST</th><th className="text-right">Line total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink-100">
                            {p.lines.map((l) => (
                              <tr key={l.id} className="text-ink-700">
                                <td className="py-1.5 font-medium text-ink-900">{l.productName}</td>
                                <td>{l.variant || "—"}</td>
                                <td>{branchLabel(l.branch)}</td>
                                <td className="text-right tabular-nums">{l.quantity}</td>
                                <td className="text-right tabular-nums">{formatINR(l.unitCost)}</td>
                                <td className="text-right tabular-nums">{l.gst ? `${l.gst}%` : "—"}</td>
                                <td className="text-right tabular-nums">{formatINR(l.quantity * l.unitCost)}</td>
                              </tr>
                            ))}
                            {p.lines.length === 0 && <tr><td colSpan={7} className="py-2 text-ink-400">No items linked to this purchase.</td></tr>}
                          </tbody>
                        </table>
                        {p.amountPaid > 0 && (
                          <p className="mt-2 text-[11px] text-ink-500">
                            Paid at purchase: {formatINR(p.amountPaid)}
                            {p.paidAllocations ? ` · ${Object.entries(p.paidAllocations).filter(([, v]) => v > 0).map(([b, v]) => `${branchLabel(b)} ${formatINR(v)}`).join(" · ")}` : ""}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-sm text-ink-400">{error ? "Couldn’t load purchases." : hasFilter ? "No purchases match these filters." : "No purchases yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
