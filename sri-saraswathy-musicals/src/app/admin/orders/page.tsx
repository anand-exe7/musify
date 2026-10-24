"use client";
import { Pager } from "@/components/ui/Pager";
import { usePaged } from "@/lib/client/usePaged";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/store/auth";
import { usePOS } from "@/lib/store/pos";
import { useOrderAlerts } from "@/lib/store/orderAlerts";
import { inPeriod, type Period, type Source } from "@/lib/store/pos";
import { useAllSales } from "@/lib/client/sales";
import type { Invoice } from "@/types";
import { formatINR, cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { ShoppingCart, Trash2, Download, ExternalLink, Eye, Truck } from "lucide-react";
import { branchLabel } from "@/lib/stock";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** What a row's status pill says: an online order's real stage, otherwise whether the bill is settled. */
function statusPill(b: { source: string; status: string; fulfilment?: string }): { label: string; tone: string; dot: string } {
  if (b.source === "online" && b.fulfilment) {
    const m: Record<string, { label: string; tone: string; dot: string }> = {
      processing: { label: "Processing", tone: "bg-warning/20 text-warning", dot: "bg-warning" },
      shipped: { label: "Shipped", tone: "bg-info/15 text-info", dot: "bg-info" },
      delivered: { label: "Delivered", tone: "bg-success/15 text-success", dot: "bg-success" },
      cancelled: { label: "Cancelled", tone: "bg-danger/15 text-danger", dot: "bg-danger" },
    };
    if (m[b.fulfilment]) return m[b.fulfilment];
  }
  return b.status === "pending"
    ? { label: "Payment due", tone: "bg-warning/20 text-warning", dot: "bg-warning" }
    : { label: "Completed", tone: "bg-success/15 text-success", dot: "bg-success" };
}

export default function OrdersPage() {
  // A new online order (or one being shipped from elsewhere) bumps this, and the list re-reads itself.
  const orderVersion = useOrderAlerts((s) => s.version);
  const { sales, loading, error: loadFailed, errorMessage } = useAllSales(orderVersion);
  const deleteBill = usePOS((s) => s.deleteBill);
  // Deleting a bill is for the full admin only; branch users never see the button.
  const isFullAdmin = useAuth((s) => s.adminAccess === "all");

  // Tax invoices keyed by the order/bill/ticket id they were raised for, so each
  // row can show its sequential GST number and link straight to it.
  const [invByRef, setInvByRef] = useState<Record<string, Invoice>>({});
  useEffect(() => {
    let alive = true;
    fetch("/api/invoices")
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((data: Invoice[]) => {
        if (!alive || !Array.isArray(data)) return;
        const m: Record<string, Invoice> = {};
        for (const inv of data) if (inv.refId) m[inv.refId] = inv;
        setInvByRef(m);
      });
    return () => {
      alive = false;
    };
  }, [orderVersion]);

  // What a row is called on screen: its sequential branch reference (INV-2026-P0001) once an invoice exists,
  // the underlying id only until then.
  const refOf = (id: string) => invByRef[id]?.reference || id;

  const [type, setType] = useState<Source | "all">("all");
  const [date, setDate] = useState<Period>("all");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"new" | "old" | "high" | "low">("new");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const rows = useMemo(() => {
    let list = sales.filter(
      (b) =>
        (type === "all" || b.source === type) &&
        inPeriod(b.createdAt, date, new Date(), custom) &&
        (query.trim() === "" ||
          b.id.toLowerCase().includes(query.toLowerCase()) ||
          refOf(b.id).toLowerCase().includes(query.toLowerCase()) ||
          (invByRef[b.id]?.number ?? "").toLowerCase().includes(query.toLowerCase()) ||
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
  }, [sales, type, date, custom, query, sort, invByRef]);
  const pg = usePaged(rows, `${query}|${sort}`);

  const exportCSV = () => {
    // Money columns are exported in rupees (paise ÷ 100) at 2 decimals.
    const r2 = (paise: number) => (paise / 100).toFixed(2);
    const head = ["Invoice", "Tax invoice no.", "Customer", "Phone", "Type", "Branch", "Coupon", "Discount", "Delivery", "Total", "Date", "Status"];
    const body = rows.map((b) => [refOf(b.id), invByRef[b.id]?.number ?? "", b.customerName, b.phone, b.source, branchLabel(b.branch), b.coupon ?? "", r2(b.discount), r2(b.delivery), r2(b.total), fmtDate(b.createdAt), b.status]);
    downloadCsv(`orders-${Date.now()}.csv`, [head, ...body]);
  };

  const chip = (active: boolean) =>
    cn("rounded-full px-4 py-1.5 text-xs font-semibold transition-all", active ? "bg-ink-900 text-ivory-50" : "bg-ivory-50 text-ink-600 ring-1 ring-ink-100 hover:text-ink-900");

  return (
    <div className="p-5 md:p-8">
      {/* Confirm modal */}
      {confirmId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4 backdrop-blur-sm" onClick={() => setConfirmId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink-900">Delete POS bill?</h3>
            <p className="mt-2 text-sm text-ink-500">{confirmId} will be removed and its revenue/coupon impact will disappear from Analytics. This cannot be undone.</p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmId(null)} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
              <button onClick={() => { deleteBill(confirmId); setConfirmId(null); }} className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Order Management</h1>
          <p className="mt-1 text-sm text-ink-500">Online storefront orders and in-store POS bills together — one view.</p>
        </div>
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
              {([["all", "All Orders"], ["offline", "In-store (POS)"], ["online", "Online"], ["service", "Service"]] as const).map(([k, l]) => (
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
        <p className="text-sm text-ink-500">{loading ? "Loading orders…" : `${rows.length} result(s)`}</p>
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

      {/* Table — generous cell padding + two-line Order / Customer cells so the
          row reads like a card instead of a crammed grid. */}
      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50 shadow-[0_1px_2px_rgba(10,9,8,0.03)]">
        <table className="w-full min-w-[1120px] text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-[#F4F1EA]/60 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500 [&>th]:px-4 [&>th]:py-3.5">
              <th className="!pl-6">Order</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Tax Invoice</th>
              <th>Coupon</th>
              <th className="text-right">Discount</th>
              <th className="text-right">Delivery</th>
              <th className="text-right">Total</th>
              <th>Status</th>
              <th className="!pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100/70">
            {pg.items.map((b) => (
              <tr key={b.id} className="text-ink-800 transition-colors hover:bg-[#FAF7EF]/70 [&>td]:px-4 [&>td]:py-4 [&>td]:align-middle">
                {/* Order id — the id is primary, date lives right under it so
                    the "Date" column doesn't need its own cramped slot. */}
                <td className="!pl-6">
                  <p className="font-semibold tracking-tight text-ink-900">{refOf(b.id).toUpperCase()}</p>
                  <p className="mt-0.5 text-[11px] text-ink-400">{fmtDate(b.createdAt)}</p>
                </td>
                {/* Customer + phone stacked — reads at a glance. */}
                <td>
                  <p className="font-medium text-ink-900">{b.customerName}</p>
                  <p className="mt-0.5 text-[11px] text-ink-500">{b.phone || "—"}</p>
                </td>
                <td>
                  <span className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                    b.source === "online"
                      ? "bg-success/15 text-success"
                      : b.source === "service"
                        ? "bg-[#8B5CF6]/15 text-[#6D28D9]"
                        : "bg-gold-100 text-gold-700",
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full",
                      b.source === "online" ? "bg-success" : b.source === "service" ? "bg-[#8B5CF6]" : "bg-gold-500",
                    )} />
                    {b.source === "online" ? "Online" : b.source === "service" ? "Service" : "In-store"}
                  </span>
                </td>
                <td>
                  {invByRef[b.id] ? (
                    <Link
                      href={`/admin/invoices/${invByRef[b.id].id}`}
                      target="_blank"
                      title="Open GST tax invoice"
                      className="inline-flex items-center gap-1 font-semibold text-gold-700 hover:text-gold-800"
                    >
                      {invByRef[b.id].number}
                      <ExternalLink className="h-3 w-3 text-ink-300" />
                    </Link>
                  ) : (
                    <span className="text-ink-300">—</span>
                  )}
                </td>
                <td className="text-gold-700">{b.coupon || <span className="text-ink-300">—</span>}</td>
                <td className="text-right tabular-nums text-ink-600">
                  {b.discount ? formatINR(b.discount) : <span className="text-ink-300">—</span>}
                </td>
                <td className="text-right tabular-nums text-ink-600">
                  {b.delivery ? formatINR(b.delivery) : <span className="text-ink-300">—</span>}
                </td>
                <td className="text-right text-base font-bold tabular-nums tracking-tight text-ink-900">
                  {formatINR(b.total)}
                </td>
                <td>
                  {(() => {
                    const st = statusPill(b);
                    return (
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", st.tone)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
                        {st.label}
                      </span>
                    );
                  })()}
                </td>
                {/* Actions — icon buttons grouped in a soft hairline pill so
                    hovering a row doesn't light up unrelated areas. */}
                <td className="!pr-6">
                  <div className="flex items-center justify-end gap-1">
                    {b.source === "online" && (
                      <Link
                        href={`/admin/orders/${encodeURIComponent(b.id)}`}
                        title="Open order — status, courier and tracking"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gold-500/50 bg-gold-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gold-800 transition-colors hover:bg-gold-100"
                      >
                        <Truck className="h-3.5 w-3.5" /> Manage
                      </Link>
                    )}
                    <Link
                      href={`/invoice/${b.id}`}
                      target="_blank"
                      title="View invoice"
                      className="group/btn inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ivory-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-700 transition-colors hover:border-gold-500 hover:bg-gold-50 hover:text-gold-700"
                    >
                      <Eye className="h-3.5 w-3.5" /> Invoice
                      <ExternalLink className="h-3 w-3 text-ink-300 group-hover/btn:text-gold-500" />
                    </Link>
                    {b.source === "offline" && isFullAdmin ? (
                      <button
                        onClick={() => setConfirmId(b.id)}
                        title="Delete POS bill"
                        aria-label="Delete bill"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-transparent text-ink-400 transition-colors hover:border-danger/30 hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="h-8 w-8" aria-hidden />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && loadFailed && (
              <tr><td colSpan={10} className="px-5 py-10 text-center text-sm font-semibold text-danger">{errorMessage ?? "Couldn't load orders."} The list below may be incomplete — don&apos;t read it as &ldquo;no orders&rdquo;.</td></tr>
            )}
            {!loading && !loadFailed && rows.length === 0 && (
              <tr><td colSpan={10} className="px-5 py-16 text-center text-sm text-ink-400">No orders match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager className="mt-4" {...pg.pager} />
    </div>
  );
}
