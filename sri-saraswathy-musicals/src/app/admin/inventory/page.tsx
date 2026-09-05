"use client";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { products } from "@/lib/data/products";
import { vendors } from "@/lib/data/invoices";
import { formatINR } from "@/lib/utils";
import { ProductImage } from "@/components/ui/ProductImage";
import { Search, Plus, ArrowUpCircle, ArrowDownCircle, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function InventoryPage() {
  const [tab, setTab] = useState<"stock" | "vendors" | "movements">("stock");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q) return products;
    const s = q.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(s) || p.brand.toLowerCase().includes(s) || p.hsn.includes(s));
  }, [q]);

  const totalValue = products.reduce((n, p) => n + p.price * p.stock, 0);
  const outOfStock = products.filter(p => p.stock === 0).length;
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= 3).length;

  return (
    <div className="p-5 md:p-10">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1 className="heading-serif mt-3 text-display-md text-ink-900">Stock <em>& movements</em></h1>
          <p className="mt-2 text-sm text-ink-500">Track opening stock, purchases, sales, and adjustments — branch-wise.</p>
        </div>
        <button className="btn-gold-solid"><Plus className="h-3.5 w-3.5" /> Purchase entry</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MiniStat label="Inventory value" value={formatINR(totalValue)} icon={Package} />
        <MiniStat label="SKUs in stock" value={String(products.filter(p => p.stock > 0).length)} icon={ArrowUpCircle} />
        <MiniStat label="Low stock" value={String(lowStock)} icon={AlertTriangle} color="warning" />
        <MiniStat label="Out of stock" value={String(outOfStock)} icon={ArrowDownCircle} color="danger" />
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-6 border-b border-ink-100">
        {(["stock", "vendors", "movements"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("relative pb-3 text-xs font-semibold uppercase tracking-[0.2em] transition-colors",
              tab === t ? "text-ink-900" : "text-ink-400 hover:text-ink-700")}>
            {t === "stock" ? "Stock ledger" : t === "vendors" ? "Vendors" : "Movements"}
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-gold-500" />}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <>
          <div className="my-6 max-w-sm relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, brand or HSN"
              className="w-full border border-ink-200 bg-ivory-50 py-2.5 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none" />
          </div>
          <div className="overflow-x-auto border border-ink-100 bg-ivory-50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ivory-100 text-left text-[10px] uppercase tracking-[0.16em] text-ink-500">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">HSN</th>
                  <th className="px-4 py-3">GST</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((p, i) => (
                  <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: i * 0.02 }}
                    className="hover:bg-ivory-100/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden bg-ink-100"><ProductImage product={p} sizes="40px" /></div>
                        <div>
                          <p className="text-ink-900">{p.name}</p>
                          <p className="text-xs text-ink-400">{p.brand}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular text-ink-600">{p.hsn}</td>
                    <td className="px-4 py-3 tabular text-ink-600">{p.gstRate}%</td>
                    <td className="px-4 py-3 tabular text-right text-ink-900">{formatINR(p.price)}</td>
                    <td className="px-4 py-3 tabular text-right font-medium text-ink-900">{p.stock}</td>
                    <td className="px-4 py-3 tabular text-right text-ink-600">{formatINR(p.price * p.stock)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-1 text-[10px] font-semibold uppercase tracking-widest",
                        p.stock === 0 ? "bg-danger/10 text-danger" : p.stock <= 3 ? "bg-warning/10 text-warning" : "bg-success/10 text-success",
                      )}>
                        {p.stock === 0 ? "Out" : p.stock <= 3 ? "Low" : "OK"}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "vendors" && (
        <div className="mt-6 overflow-x-auto border border-ink-100 bg-ivory-50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ivory-100 text-left text-[10px] uppercase tracking-[0.16em] text-ink-500">
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">GSTIN</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3 text-right">Total purchases</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {vendors.map((v) => (
                <tr key={v.id} className="hover:bg-ivory-100/50">
                  <td className="px-4 py-3 text-ink-900">{v.name}</td>
                  <td className="px-4 py-3 tabular text-xs text-ink-500">{v.gst}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-ink-700">{v.phone}</p>
                    <p className="text-xs text-ink-400">{v.email}</p>
                  </td>
                  <td className="px-4 py-3 tabular text-right text-ink-900">{formatINR(v.totalPurchases)}</td>
                  <td className={cn("px-4 py-3 tabular text-right font-medium", v.outstanding > 0 ? "text-warning" : "text-success")}>
                    {v.outstanding > 0 ? formatINR(v.outstanding) : "Cleared"}
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-[10px] uppercase tracking-widest text-gold-600 hover:underline">Details →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "movements" && (
        <div className="mt-6 space-y-3">
          {[
            { d: "2026-09-05 09:14", type: "sale", item: "Saraswathi Veena", qty: -1, ref: "SSM/26-27/0142", branch: "Branch 1" },
            { d: "2026-09-05 08:44", type: "purchase", item: "Bansuri Set (5)", qty: 12, ref: "PO-2026-089", branch: "Branch 1" },
            { d: "2026-09-04 18:22", type: "sale", item: "Ming Jiang Zhu 907", qty: -1, ref: "SSM/26-27/0141", branch: "Branch 1" },
            { d: "2026-09-04 15:10", type: "adjustment", item: "Kanailal Sitar", qty: -1, ref: "Damage · humidity", branch: "Branch 2" },
            { d: "2026-09-04 11:32", type: "sale", item: "Concert Tabla Set × 3", qty: -3, ref: "SSM/26-27/0140", branch: "Branch 2" },
            { d: "2026-09-03 16:00", type: "return", item: "Harmonium", qty: 1, ref: "RTN-002 · tone", branch: "Branch 1" },
          ].map((m, i) => (
            <div key={i} className="flex items-center gap-4 border border-ink-100 bg-ivory-50 p-4">
              <div className={cn("grid h-10 w-10 place-items-center rounded-full",
                m.type === "sale" && "bg-info/10 text-info",
                m.type === "purchase" && "bg-success/10 text-success",
                m.type === "adjustment" && "bg-danger/10 text-danger",
                m.type === "return" && "bg-warning/10 text-warning",
              )}>
                {m.type === "sale" && <ArrowDownCircle className="h-4 w-4" />}
                {m.type === "purchase" && <ArrowUpCircle className="h-4 w-4" />}
                {m.type === "adjustment" && <AlertTriangle className="h-4 w-4" />}
                {m.type === "return" && <ArrowUpCircle className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-900">{m.item}</p>
                <p className="text-xs text-ink-500">{m.ref} · {m.branch}</p>
              </div>
              <div className="text-right">
                <p className={cn("tabular font-medium", m.qty > 0 ? "text-success" : "text-danger")}>
                  {m.qty > 0 ? "+" : ""}{m.qty}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-ink-400">{m.d}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color?: "warning" | "danger" }) {
  return (
    <div className="border border-ink-100 bg-ivory-50 p-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">{label}</p>
        <Icon className={cn("h-4 w-4", color === "warning" ? "text-warning" : color === "danger" ? "text-danger" : "text-gold-600")} />
      </div>
      <p className="tabular mt-3 font-display text-2xl text-ink-900 md:text-3xl">{value}</p>
    </div>
  );
}
