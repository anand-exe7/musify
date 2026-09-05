"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePOS, inPeriod, type Period, type Source } from "@/lib/store/pos";
import { formatINR, cn } from "@/lib/utils";
import { ShoppingCart, Trash2, Download, ExternalLink } from "lucide-react";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export default function OrdersPage() {
  const bills = usePOS((s) => s.bills);
  const deleteBill = usePOS((s) => s.deleteBill);

  const [type, setType] = useState<Source | "all">("all");
  const [date, setDate] = useState<Period>("all");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"new" | "old" | "high" | "low">("new");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const rows = useMemo(() => {
    let list = bills.filter(
      (b) =>
        (type === "all" || b.source === type) &&
        inPeriod(b.createdAt, date, new Date(), custom) &&
        (query.trim() === "" ||
          b.id.toLowerCase().includes(query.toLowerCase()) ||
          b.customerName.toLowerCase().includes(query.toLowerCase()) ||
          b.phone.includes(query.trim())),
    );
    list = [...list].sort((a, b) => {
      if (sort === "new") return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sort === "old") return +new Date(a.createdAt) - +new Date(b.createdAt);
      if (sort === "high") return b.total - a.total;
      return a.total - b.total;
    });
    return list;
  }, [bills, type, date, custom, query, sort]);

  const exportCSV = () => {
    const head = ["Invoice", "Customer", "Phone", "Type", "Branch", "Coupon", "Discount", "Delivery", "Total", "Date", "Status"];
    const body = rows.map((b) => [b.id, b.customerName, b.phone, b.source, b.branch, b.coupon ?? "", b.discount, b.delivery, b.total, fmtDate(b.createdAt), b.status]);
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chip = (active: boolean) =>
    cn("rounded-full px-4 py-1.5 text-xs font-semibold transition-all", active ? "bg-ink-900 text-ivory-50" : "bg-ivory-50 text-ink-600 ring-1 ring-ink-100 hover:text-ink-900");

  return (
    <div className="p-5 md:p-8">
      {/* Confirm modal */}
      {confirmId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4 backdrop-blur-sm" onClick={() => setConfirmId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink-900">Delete invoice?</h3>
            <p className="mt-2 text-sm text-ink-500">{confirmId} will be removed and its revenue/coupon impact will disappear from Analytics. This cannot be undone.</p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmId(null)} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
              <button onClick={() => { deleteBill(confirmId); setConfirmId(null); }} className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">Order Management</h1>
        <Link href="/admin/billing" className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800">
          <ShoppingCart className="h-4 w-4" /> Open POS
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-ink-100 bg-ivory-50 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-12 text-[10px] font-bold uppercase tracking-wider text-ink-400">Type</span>
              {([["all", "All Bills"], ["offline", "Offline"], ["online", "Online"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setType(k)} className={chip(type === k)}>{l}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-12 text-[10px] font-bold uppercase tracking-wider text-ink-400">Date</span>
              {([["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["custom", "Custom Range"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setDate(date === k ? "all" : k)} className={chip(date === k)}>{l}</button>
              ))}
            </div>
            {date === "custom" && (
              <div className="flex flex-wrap items-center gap-2 pl-14">
                <input type="date" value={custom.from ?? ""} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
                <span className="text-ink-400">→</span>
                <input type="date" value={custom.to ?? ""} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
              </div>
            )}
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice, name, phone…" className="w-full rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none lg:w-72" />
        </div>
      </div>

      {/* Result bar */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-ink-500">{rows.length} result(s)</p>
        <div className="flex items-center gap-3">
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:outline-none">
            <option value="new">Newest First</option>
            <option value="old">Oldest First</option>
            <option value="high">Highest Total</option>
            <option value="low">Lowest Total</option>
          </select>
          <button onClick={exportCSV} className="flex items-center gap-2 text-sm font-semibold text-ink-700 hover:text-gold-600">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              <th className="px-5 py-4">Invoice No</th><th>Customer</th><th>Phone</th><th>Bill Type</th><th>Coupon</th><th className="text-right">Discount</th><th className="text-right">Delivery</th><th className="text-right">Total</th><th>Date</th><th>Status</th><th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            {rows.map((b) => (
              <tr key={b.id} className="text-ink-800">
                <td className="px-5 py-4"><span className="inline-flex items-center gap-1 font-semibold text-ink-900">{b.id}<ExternalLink className="h-3 w-3 text-ink-300" /></span></td>
                <td className="font-medium">{b.customerName}</td>
                <td className="text-ink-600">{b.phone || "—"}</td>
                <td><span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", b.source === "online" ? "bg-success/15 text-success" : "bg-gold-100 text-gold-700")}>{b.source}</span></td>
                <td className="text-gold-600">{b.coupon || "—"}</td>
                <td className="text-right tabular-nums">{b.discount ? formatINR(b.discount) : "—"}</td>
                <td className="text-right tabular-nums">{b.delivery ? formatINR(b.delivery) : "—"}</td>
                <td className="text-right font-bold tabular-nums text-ink-900">{formatINR(b.total)}</td>
                <td className="text-ink-600">{fmtDate(b.createdAt)}</td>
                <td><span className="rounded bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success">{b.status}</span></td>
                <td className="text-right"><button onClick={() => setConfirmId(b.id)} className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={11} className="px-5 py-16 text-center text-sm text-ink-400">No orders match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
