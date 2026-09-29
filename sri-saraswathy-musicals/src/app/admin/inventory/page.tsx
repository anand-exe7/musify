"use client";
import { useEffect, useMemo, useState } from "react";
import { usePOS, productStock, productStockAt, stockState, variantStock, type InvProduct } from "@/lib/store/pos";
import { ProductModal } from "@/components/admin/ProductModal";
import { useVendors } from "@/lib/store/vendors";
import { useAllSales } from "@/lib/client/sales";
import { downloadCsv, stamp } from "@/lib/csv";
import { stockRows, itemHistoryRows, categoryHistoryRows, type PurchaseRecord } from "@/lib/reports/inventory";
import { formatINR, cn } from "@/lib/utils";
import { Bell, Plus, Pencil, Trash2, AlertTriangle, X, Download, FileClock, ChevronDown } from "lucide-react";

const STATUS_META = {
  in: { label: "In Stock", badge: "bg-success/15 text-success" },
  low: { label: "Low Stock", badge: "bg-warning/20 text-warning" },
  out: { label: "Out Of Stock", badge: "bg-danger/15 text-danger" },
} as const;

export default function InventoryPage() {
  const invProducts = usePOS((s) => s.invProducts);
  const deleteProduct = usePOS((s) => s.deleteProduct);

  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "out">("all");
  const [category, setCategory] = useState("all");
  const [dept, setDept] = useState("all");
  const [sort, setSort] = useState<"name" | "price" | "stock">("name");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<InvProduct | null>(null);
  const [adding, setAdding] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<InvProduct | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [inwards, setInwards] = useState<PurchaseRecord[]>([]);
  const { sales } = useAllSales();
  const vendors = useVendors((s) => s.vendors);
  const hydrateVendors = useVendors((s) => s.hydrate);

  useEffect(() => {
    void hydrateVendors();
    fetch("/api/stock-inward", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setInwards(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [hydrateVendors]);

  const categories = useMemo(() => [...new Set(invProducts.map((p) => p.category))], [invProducts]);
  const depts = useMemo(() => [...new Set(invProducts.map((p) => p.department))], [invProducts]);

  const alerts = useMemo(() => {
    const list: { product: InvProduct; variant: string; stock: number; state: "low" | "out" }[] = [];
    invProducts.forEach((p) => p.variants.filter((v) => !v.disabled).forEach((v) => {
      const stock = variantStock(v);
      if (stock <= 0) list.push({ product: p, variant: `${v.attr} · ${v.finish}`, stock: 0, state: "out" });
      else if (stock <= p.lowStockAt) list.push({ product: p, variant: `${v.attr} · ${v.finish}`, stock, state: "low" });
    }));
    return list;
  }, [invProducts]);
  const outCount = alerts.filter((a) => a.state === "out").length;
  const lowCount = alerts.filter((a) => a.state === "low").length;

  const filtered = useMemo(() => {
    let list = invProducts.filter((p) => {
      const st = stockState(p);
      if (statusFilter === "low" && st !== "low") return false;
      if (statusFilter === "out" && st !== "out") return false;
      if (category !== "all" && p.category !== category) return false;
      if (dept !== "all" && p.department !== dept) return false;
      if (query.trim() && !p.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "price") return b.basePrice - a.basePrice;
      if (sort === "stock") return productStock(b) - productStock(a);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [invProducts, statusFilter, category, dept, sort, query]);

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;
  const exportStock = () => downloadCsv(`stock-inventory-${stamp()}`, stockRows(filtered));
  const exportItemHistory = () => downloadCsv(`item-purchase-sales-history-${stamp()}`, itemHistoryRows(invProducts, inwards, sales, vendorName, range, new Set(filtered.map((p) => p.id))));
  const exportOneItem = (p: InvProduct) => downloadCsv(`history-${p.name.replace(/[^\w]+/g, "-").toLowerCase()}-${stamp()}`, itemHistoryRows(invProducts, inwards, sales, vendorName, range, new Set([p.id])));
  const exportCategoryHistory = () => downloadCsv(`category-purchase-sales-${stamp()}`, categoryHistoryRows(invProducts, inwards, sales, vendorName, range));

  const chip = (active: boolean) => cn("rounded-full px-4 py-2 text-xs font-semibold transition-all", active ? "bg-ink-900 text-ivory-50" : "bg-ivory-50 text-ink-600 ring-1 ring-ink-100 hover:text-ink-900");
  const selCls = "rounded-full border border-ink-200 bg-ivory-50 px-3 py-2 text-xs font-medium focus:outline-none";

  return (
    <div className="p-5 md:p-8">
      {(editing || adding) && <ProductModal product={editing} onClose={() => { setEditing(null); setAdding(false); }} />}

      {/* Alerts modal */}
      {alertsOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4 backdrop-blur-sm" onClick={() => setAlertsOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-ivory-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b border-ink-100 p-5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warning/20 text-warning"><AlertTriangle className="h-5 w-5" /></div>
              <div className="flex-1"><h3 className="text-lg font-bold text-ink-900">Stock Alert</h3><p className="text-sm text-ink-500">{alerts.length} variant(s) need attention</p></div>
              <button onClick={() => setAlertsOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto p-4">
              {alerts.map((a, i) => (
                <div key={i} className={cn("flex items-center justify-between gap-3 rounded-xl border p-3", a.state === "out" ? "border-danger/30 bg-danger/[0.04]" : "border-warning/30 bg-warning/[0.06]")}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-900">{a.product.name}</p>
                    <p className="text-xs text-ink-500">{a.product.category} · {a.variant} · <span className={cn("font-bold", a.state === "out" ? "text-danger" : "text-warning")}>{a.stock} Units left</span></p>
                  </div>
                  <button onClick={() => { setAlertsOpen(false); setEditing(a.product); }} className="shrink-0 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-ink-800">Edit</button>
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4 backdrop-blur-sm" onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink-900">Delete product?</h3>
            <p className="mt-2 text-sm text-ink-500">&quot;{confirmDel.name}&quot; will be removed from the catalog.</p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
              <button onClick={() => { deleteProduct(confirmDel.id); setConfirmDel(null); }} className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Inventory</h1>
          <p className="mt-1 text-sm text-ink-500">{invProducts.length} products · same catalog customers see</p>
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
                  <button onClick={() => { exportStock(); setExportOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left hover:bg-ink-900/5"><p className="text-sm font-semibold text-ink-900">Stock &amp; inventory</p><p className="text-xs text-ink-500">Per-variant, per-branch on-hand · {filtered.length} filtered products</p></button>
                  <div className="my-2 border-t border-ink-100" />
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-400">History period (optional)</p>
                  <div className="mt-1.5 flex items-center gap-2 px-3">
                    <input type="date" value={range.from ?? ""} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value || undefined }))} className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1 text-xs" />
                    <span className="text-xs text-ink-400">to</span>
                    <input type="date" value={range.to ?? ""} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value || undefined }))} className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1 text-xs" />
                  </div>
                  <button onClick={() => { exportItemHistory(); setExportOpen(false); }} className="mt-2 w-full rounded-lg px-3 py-2 text-left hover:bg-ink-900/5"><p className="text-sm font-semibold text-ink-900">Item purchase &amp; sales history</p><p className="text-xs text-ink-500">Every purchase and sale, per item (filtered products)</p></button>
                  <button onClick={() => { exportCategoryHistory(); setExportOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left hover:bg-ink-900/5"><p className="text-sm font-semibold text-ink-900">Category-wise purchase &amp; sales</p><p className="text-xs text-ink-500">Units and value per category</p></button>
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
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selCls}><option value="all">All Categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={selCls}><option value="all">All Depts</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selCls}><option value="name">Name A–Z</option><option value="price">Price high→low</option><option value="stock">Stock high→low</option></select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="ml-auto rounded-full border border-ink-200 bg-ivory-50 px-4 py-2 text-sm focus:border-gold-500 focus:outline-none" />
      </div>

      {/* List */}
      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              <th className="px-4 py-3">Product</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Dept</th>
              <th className="px-3 py-3 text-right">Price</th>
              <th className="px-3 py-3 text-right">Branch 1</th>
              <th className="px-3 py-3 text-right">Branch 2</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const st = stockState(p);
              const meta = STATUS_META[st];
              return (
                <tr key={p.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-900/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ink-100">{p.photo && <img src={p.photo} alt="" className="h-full w-full object-cover" />}</div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900">{p.name}</p>
                        {!p.active && <span className="rounded bg-ink-900/85 px-1.5 py-0.5 text-[9px] font-bold uppercase text-ivory-50">Hidden</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-ink-600">{p.category}</td>
                  <td className="px-3 py-3 text-ink-600">{p.department}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink-900">{formatINR(p.basePrice)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{productStockAt(p, "Branch 1")}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{productStockAt(p, "Branch 2")}</td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums text-ink-900">{productStock(p)}</td>
                  <td className="px-3 py-3">
                    <span className={cn("whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", meta.badge)}>{meta.label}</span>
                    {st === "low" && <p className="mt-0.5 text-[10px] text-warning">reorder @ {p.lowStockAt}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button title="Export purchase & sales history" onClick={() => exportOneItem(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-ink-700 hover:text-gold-600"><FileClock className="h-3.5 w-3.5" /></button>
                      <button title="Edit" onClick={() => setEditing(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-ink-700 hover:text-gold-600"><Pencil className="h-3.5 w-3.5" /></button>
                      <button title="Delete" onClick={() => setConfirmDel(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 text-danger hover:bg-danger hover:text-white"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={9} className="py-16 text-center text-sm text-ink-400">No products match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
