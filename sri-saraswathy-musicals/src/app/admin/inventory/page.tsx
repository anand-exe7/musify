"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LoadErrorBanner } from "@/components/admin/LoadState";
import { usePOS, productsChanged, type InvProduct } from "@/lib/store/pos";
import { Pager } from "@/components/ui/Pager";
import { fetchJson, errMsg, readError } from "@/lib/client/api";
import { downloadCsv, stamp } from "@/lib/csv";
import { stockRows } from "@/lib/reports/inventory";
import { formatINR, cn } from "@/lib/utils";
import { BRANCH_KEYS, branchLabel } from "@/lib/stock";
import { Bell, Plus, Pencil, Trash2, AlertTriangle, X, Download, FileClock, ChevronDown, ChevronRight } from "lucide-react";
import type { InvPage, InvRow, InvVariantRow, StockAlert } from "@/lib/db/queries/inventoryPage";
import type { HistoryJob } from "./HistoryExport";

// The product editor and the CSV history builder are big and only needed on demand, so they load when first used.
const ProductModal = dynamic(() => import("@/components/admin/ProductModal").then((m) => m.ProductModal), { ssr: false });
const HistoryExport = dynamic(() => import("./HistoryExport").then((m) => m.HistoryExport), { ssr: false });

const PAGE_SIZES = [10, 25, 50, 100];

const STATUS_META = {
  in: { label: "In Stock", badge: "bg-success/15 text-success" },
  low: { label: "Low Stock", badge: "bg-warning/20 text-warning" },
  out: { label: "Out Of Stock", badge: "bg-danger/15 text-danger" },
} as const;

const variantState = (qty: number, lowAt: number): keyof typeof STATUS_META => (qty <= 0 ? "out" : qty <= lowAt ? "low" : "in");

/**
 * Inventory reads the catalogue one page at a time from the server (`/api/inventory`): a row is a product with
 * its per-branch totals, and its variants are fetched only when the row is opened. Nothing here loads the whole
 * catalogue; only the CSV exports do, and only when asked.
 */
export default function InventoryPage() {
  const loadError = usePOS((s) => s.loadError);
  const invVersion = usePOS((s) => s.invVersion);

  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "out">("all");
  const [category, setCategory] = useState("all");
  const [dept, setDept] = useState("all");
  const [sort, setSort] = useState<"name" | "price" | "stock">("name");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [data, setData] = useState<InvPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);

  const [editing, setEditing] = useState<InvProduct | null>(null);
  const [adding, setAdding] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<InvRow | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [job, setJob] = useState<HistoryJob | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // opened rows → their variants (loaded the first time a row is opened)
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [variants, setVariants] = useState<Record<string, InvVariantRow[] | "loading" | "error">>({});

  // Typing in the search box waits for a pause before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Any change to the filters or the page size starts again from the first page.
  useEffect(() => { setPage(1); }, [statusFilter, category, dept, sort, search, pageSize]);

  const filterQS = useMemo(() => {
    const sp = new URLSearchParams();
    if (search.trim()) sp.set("q", search.trim());
    if (category !== "all") sp.set("category", category);
    if (dept !== "all") sp.set("department", dept);
    if (statusFilter !== "all") sp.set("status", statusFilter);
    sp.set("sort", sort);
    return sp.toString();
  }, [search, category, dept, statusFilter, sort]);

  // One page of rows. A newer request supersedes an older one, so a slow reply can't overwrite a fresher list.
  const latest = useRef(0);
  useEffect(() => {
    const n = ++latest.current;
    setLoading(true);
    fetchJson<InvPage>(`/api/inventory?${filterQS}&page=${page}&pageSize=${pageSize}`)
      .then((d) => {
        if (n !== latest.current) return;
        setData(d);
        setError(null);
        if (d.page !== page) setPage(d.page);
      })
      .catch((e) => { if (n === latest.current) setError(`Couldn't load inventory (${errMsg(e)})`); })
      .finally(() => { if (n === latest.current) setLoading(false); });
  }, [filterQS, page, pageSize, invVersion]);

  // A product was saved or removed, or stock moved elsewhere: opened rows must be read again.
  useEffect(() => { setVariants({}); }, [invVersion]);

  useEffect(() => {
    fetchJson<StockAlert[]>("/api/inventory?view=alerts")
      .then((a) => setAlerts(Array.isArray(a) ? a : []))
      .catch(() => {});
  }, [invVersion]);

  const loadVariants = useCallback((id: string) => {
    setVariants((v) => ({ ...v, [id]: "loading" }));
    fetchJson<InvVariantRow[]>(`/api/inventory/${id}/variants`)
      .then((rows) => setVariants((v) => ({ ...v, [id]: rows })))
      .catch(() => setVariants((v) => ({ ...v, [id]: "error" })));
  }, []);

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      const cur = variants[id];
      if (!cur || cur === "error") loadVariants(id);
    }
    setOpen(next);
  };
  // After a refresh the rows that stay open fetch their variants again.
  useEffect(() => {
    for (const id of open) if (variants[id] === undefined) loadVariants(id);
  }, [variants, open, loadVariants]);

  const openEditor = async (row: InvRow) => {
    setOpening(row.id);
    try {
      setEditing(await fetchJson<InvProduct>(`/api/pos/inventory/${row.id}`));
    } catch (e) {
      setNotice(`Couldn't open ${row.name} (${errMsg(e)})`);
    } finally {
      setOpening(null);
    }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    setDelError(null);
    try {
      const res = await fetch(`/api/pos/inventory/${confirmDel.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Couldn't delete this product."));
      setConfirmDel(null);
      productsChanged();
    } catch (e) {
      setDelError(errMsg(e, "Couldn't delete this product."));
    }
  };

  // Stock CSV: the products matching the current filters, with every variant and branch.
  const exportStock = async () => {
    setExportOpen(false);
    try {
      const [ids, all] = await Promise.all([
        fetchJson<string[]>(`/api/inventory?view=ids&${filterQS}`),
        fetchJson<InvProduct[]>("/api/pos/inventory"),
      ]);
      const want = new Set(ids);
      downloadCsv(`stock-inventory-${stamp()}`, stockRows(all.filter((p) => want.has(p.id))));
    } catch (e) {
      setNotice(`Couldn't export stock (${errMsg(e)})`);
    }
  };
  const startJob = (j: HistoryJob) => { setExportOpen(false); setNotice("Preparing the export…"); setJob(j); };

  const outCount = alerts.filter((a) => a.state === "out").length;
  const lowCount = alerts.filter((a) => a.state === "low").length;
  const items = data?.items ?? [];
  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? from + items.length - (from ? 1 : 0) : 0;
  const cols = 7 + BRANCH_KEYS.length;

  const chip = (active: boolean) => cn("rounded-full px-4 py-2 text-xs font-semibold transition-all", active ? "bg-ink-900 text-ivory-50" : "bg-ivory-50 text-ink-600 ring-1 ring-ink-100 hover:text-ink-900");
  const selCls = "rounded-full border border-ink-200 bg-ivory-50 px-3 py-2 text-xs font-medium focus:outline-none";

  return (
    <div className="p-5 md:p-8">
      <LoadErrorBanner message={error ?? loadError} onRetry={() => { productsChanged(); void usePOS.getState().hydrate(); }} />
      {(editing || adding) && <ProductModal product={editing} onClose={() => { setEditing(null); setAdding(false); }} />}
      {job && (
        <HistoryExport
          job={job}
          range={range}
          onDone={() => { setJob(null); setNotice(null); }}
          onError={(m) => { setJob(null); setNotice(m); }}
        />
      )}

      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-gold-500/30 bg-gold-50 px-4 py-2.5 text-sm text-ink-700">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-ink-400 hover:text-ink-700"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Alerts modal */}
      {alertsOpen && (
        <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain bg-ink-950/50 p-4 backdrop-blur-sm" onClick={() => setAlertsOpen(false)}>
          <div className="my-auto w-full max-w-md rounded-2xl bg-ivory-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b border-ink-100 p-5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warning/20 text-warning"><AlertTriangle className="h-5 w-5" /></div>
              <div className="flex-1"><h3 className="text-lg font-bold text-ink-900">Stock Alert</h3><p className="text-sm text-ink-500">{alerts.length} variant(s) need attention</p></div>
              <button onClick={() => setAlertsOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto p-4">
              {alerts.map((a, i) => (
                <div key={i} className={cn("flex items-center justify-between gap-3 rounded-xl border p-3", a.state === "out" ? "border-danger/30 bg-danger/[0.04]" : "border-warning/30 bg-warning/[0.06]")}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-900">{a.productName}</p>
                    <p className="text-xs text-ink-500">{a.category} · {a.variant} · <span className={cn("font-bold", a.state === "out" ? "text-danger" : "text-warning")}>{a.stock} Units left</span></p>
                  </div>
                  <button
                    onClick={() => {
                      setAlertsOpen(false);
                      void openEditor({ id: a.productId, name: a.productName } as InvRow);
                    }}
                    className="shrink-0 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-ink-800"
                  >Edit</button>
                </div>
              ))}
              {alerts.length === 0 && <p className="py-8 text-center text-sm text-ink-400">Everything is well stocked.</p>}
            </div>
            <div className="border-t border-ink-100 p-3"><button onClick={() => setAlertsOpen(false)} className="w-full rounded-xl border border-ink-200 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Dismiss</button></div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain bg-ink-950/50 p-4 backdrop-blur-sm" onClick={() => { setConfirmDel(null); setDelError(null); }}>
          <div className="my-auto w-full max-w-sm rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink-900">Delete product?</h3>
            <p className="mt-2 text-sm text-ink-500">&quot;{confirmDel.name}&quot; will be removed from the catalog.</p>
            {delError && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">{delError}</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={() => { setConfirmDel(null); setDelError(null); }} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
              <button onClick={() => void doDelete()} className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Inventory</h1>
          <p className="mt-1 text-sm text-ink-500">{data ? `${data.total} product${data.total === 1 ? "" : "s"}` : "Loading…"} · same catalog customers see</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAlertsOpen(true)} className="relative flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600">
            <Bell className="h-4 w-4" /> Alerts
            {alerts.length > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{alerts.length}</span>}
          </button>
          <div className="relative">
            <button onClick={() => setExportOpen((o) => !o)} className="flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600">
              <Download className="h-4 w-4" /> Export CSV <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-ink-100 bg-ivory-50 p-3 shadow-xl">
                  <button onClick={() => void exportStock()} className="w-full rounded-lg px-3 py-2 text-left hover:bg-ink-900/5"><p className="text-sm font-semibold text-ink-900">Stock &amp; inventory</p><p className="text-xs text-ink-500">Per-variant, per-branch on-hand · {data?.total ?? 0} filtered products</p></button>
                  <div className="my-2 border-t border-ink-100" />
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-400">History period (optional)</p>
                  <div className="mt-1.5 flex items-center gap-2 px-3">
                    <input type="date" value={range.from ?? ""} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value || undefined }))} className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1 text-xs" />
                    <span className="text-xs text-ink-400">to</span>
                    <input type="date" value={range.to ?? ""} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value || undefined }))} className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1 text-xs" />
                  </div>
                  <button onClick={() => startJob({ kind: "items", query: filterQS })} className="mt-2 w-full rounded-lg px-3 py-2 text-left hover:bg-ink-900/5"><p className="text-sm font-semibold text-ink-900">Item purchase &amp; sales history</p><p className="text-xs text-ink-500">Every purchase and sale, per item (filtered products)</p></button>
                  <button onClick={() => startJob({ kind: "category" })} className="w-full rounded-lg px-3 py-2 text-left hover:bg-ink-900/5"><p className="text-sm font-semibold text-ink-900">Category-wise purchase &amp; sales</p><p className="text-xs text-ink-500">Units and value per category</p></button>
                </div>
              </>
            )}
          </div>
          <button onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800"><Plus className="h-4 w-4" /> Add Product</button>
        </div>
      </div>

      {/* Banner */}
      {alerts.length > 0 && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/[0.08] px-4 py-3 text-sm text-ink-700">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          <span><b className="text-ink-900">{outCount}</b> variants out of stock · <b className="text-ink-900">{lowCount}</b> running low — restock soon.</span>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-ink-100 bg-ivory-50 p-3">
        <button onClick={() => setStatusFilter("all")} className={chip(statusFilter === "all")}>All</button>
        <button onClick={() => setStatusFilter("low")} className={chip(statusFilter === "low")}>Low Stock</button>
        <button onClick={() => setStatusFilter("out")} className={chip(statusFilter === "out")}>Out Of Stock</button>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selCls}><option value="all">All Categories</option>{(data?.categories ?? []).map((c) => <option key={c}>{c}</option>)}</select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={selCls}><option value="all">All Depts</option>{(data?.departments ?? []).map((d) => <option key={d}>{d}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selCls}><option value="name">Name A–Z</option><option value="price">Price high→low</option><option value="stock">Stock high→low</option></select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="ml-auto rounded-full border border-ink-200 bg-ivory-50 px-4 py-2 text-sm focus:border-gold-500 focus:outline-none" />
      </div>

      {/* List */}
      <div className={cn("overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50 transition-opacity", loading && data && "opacity-60")}>
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              <th className="px-4 py-3">Product</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Dept</th>
              <th className="px-3 py-3 text-right">Price</th>
              {BRANCH_KEYS.map((b) => <th key={b} className="px-3 py-3 text-right">{branchLabel(b)}</th>)}
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const meta = STATUS_META[p.state];
              const isOpen = open.has(p.id);
              const vs = variants[p.id];
              return (
                <Fragment key={p.id}>
                  <tr className="border-b border-ink-100 last:border-0 hover:bg-ink-900/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggle(p.id)}
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Hide" : "Show"} variants of ${p.name}`}
                          title={isOpen ? "Hide variants" : "Show variants and stock"}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-ink-200 text-ink-500 hover:border-gold-500 hover:text-gold-600"
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ink-100">{p.photo && <img src={p.photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}</div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-900">{p.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <button type="button" onClick={() => toggle(p.id)} className="text-[11px] font-medium text-ink-500 hover:text-gold-600">
                              {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}
                            </button>
                            {!p.active && <span className="rounded bg-ink-900/85 px-1.5 py-0.5 text-[9px] font-bold uppercase text-ivory-50">Hidden</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-600">{p.category}</td>
                    <td className="px-3 py-3 text-ink-600">{p.department}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink-900">{formatINR(p.basePrice)}</td>
                    {BRANCH_KEYS.map((b) => <td key={b} className="px-3 py-3 text-right tabular-nums">{p.stockByBranch[b] ?? 0}</td>)}
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-ink-900">{p.total}</td>
                    <td className="px-3 py-3">
                      <span className={cn("whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", meta.badge)}>{meta.label}</span>
                      {p.state === "low" && <p className="mt-0.5 text-[10px] text-warning">reorder @ {p.lowStockAt}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button title="Export purchase & sales history" onClick={() => startJob({ kind: "one", id: p.id, name: p.name })} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-ink-700 hover:text-gold-600"><FileClock className="h-3.5 w-3.5" /></button>
                        <button title="Edit" disabled={opening === p.id} onClick={() => void openEditor(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-ink-700 hover:text-gold-600 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /></button>
                        <button title="Delete" onClick={() => { setDelError(null); setConfirmDel(p); }} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-danger hover:bg-danger hover:text-white"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-ink-100 bg-ink-900/[0.025]">
                      <td colSpan={cols} className="px-4 py-3 pl-14">
                        {(vs === undefined || vs === "loading") && <p className="py-3 text-xs text-ink-400">Loading variants…</p>}
                        {vs === "error" && (
                          <p className="py-3 text-xs text-danger">Couldn&apos;t load the variants. <button onClick={() => loadVariants(p.id)} className="font-semibold underline">Try again</button></p>
                        )}
                        {Array.isArray(vs) && vs.length === 0 && <p className="py-3 text-xs text-ink-400">This product has no variants.</p>}
                        {Array.isArray(vs) && vs.length > 0 && (
                          <table className="w-full min-w-[560px] text-xs">
                            <thead>
                              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                                <th className="py-1.5 pr-3">Variant</th>
                                <th className="px-3 py-1.5 text-right">Price</th>
                                {BRANCH_KEYS.map((b) => <th key={b} className="px-3 py-1.5 text-right">{branchLabel(b)}</th>)}
                                <th className="px-3 py-1.5 text-right">Total</th>
                                <th className="py-1.5 pl-3">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vs.map((v) => {
                                const st = variantState(v.total, p.lowStockAt);
                                return (
                                  <tr key={v.id} className={cn("border-t border-ink-100", v.disabled && "opacity-55")}>
                                    <td className="py-2 pr-3">
                                      <div className="flex items-center gap-2">
                                        {v.photo ? <img src={v.photo} alt="" loading="lazy" decoding="async" className="h-7 w-7 shrink-0 rounded-md object-cover" /> : <span className="h-7 w-7 shrink-0 rounded-md bg-ink-100" />}
                                        <span className="font-semibold text-ink-900">{v.attr || "Standard"}{v.finish ? ` · ${v.finish}` : ""}</span>
                                        {v.disabled && <span className="rounded bg-ink-900/85 px-1.5 py-0.5 text-[9px] font-bold uppercase text-ivory-50">Off</span>}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-ink-700">{formatINR(v.price)}</td>
                                    {BRANCH_KEYS.map((b) => <td key={b} className={cn("px-3 py-2 text-right tabular-nums", (v.stockByBranch[b] ?? 0) <= 0 ? "text-ink-300" : "text-ink-700")}>{v.stockByBranch[b] ?? 0}</td>)}
                                    <td className="px-3 py-2 text-right font-bold tabular-nums text-ink-900">{v.total}</td>
                                    <td className="py-2 pl-3">
                                      {v.disabled
                                        ? <span className="text-[10px] text-ink-400">Not for sale</span>
                                        : <span className={cn("whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", STATUS_META[st].badge)}>{STATUS_META[st].label}</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!data && loading && <tr><td colSpan={cols + 0} className="py-16 text-center text-sm text-ink-400">Loading inventory…</td></tr>}
            {data && items.length === 0 && <tr><td colSpan={cols} className="py-16 text-center text-sm text-ink-400">No products match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager className="mt-4" page={data.page} pages={data.pages} total={data.total} from={from} to={to} onPage={setPage} pageSize={pageSize} pageSizes={PAGE_SIZES} onPageSize={setPageSize} />}
    </div>
  );
}
