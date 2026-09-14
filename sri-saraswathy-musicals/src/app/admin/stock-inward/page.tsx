"use client";
import { useEffect, useMemo, useState } from "react";
import { PackagePlus, Search, Check, X, Truck } from "lucide-react";
import { usePOS, productStock, type InvProduct } from "@/lib/store/pos";
import { useVendors, vendorMatches } from "@/lib/store/vendors";
import { useBranchScope, effectiveBranch } from "@/lib/store/branch";
import { genDocId } from "@/lib/ids";
import type { Vendor } from "@/types";
import { formatINR, cn } from "@/lib/utils";

interface InwardRow {
  id: string;
  vendorId: string;
  productName: string;
  variant: string;
  quantity: number;
  unitCost: number;
  branch: string;
  inwardAt: string;
}

function fmt(d: string) {
  const x = new Date(d);
  return isNaN(+x) ? d : x.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function StockInwardPage() {
  const invProducts = usePOS((s) => s.invProducts);
  const hydratePOS = usePOS((s) => s.hydrate);
  const vendors = useVendors((s) => s.vendors);
  const hydrateVendors = useVendors((s) => s.hydrate);

  const canSwitch = useBranchScope((s) => s.canSwitch);
  const scopeAccess = useBranchScope((s) => s.access);
  const scopeSelected = useBranchScope((s) => s.selected);
  const lockedBranch = !canSwitch && (scopeAccess === "Branch 1" || scopeAccess === "Branch 2") ? scopeAccess : null;

  const [branch, setBranch] = useState(lockedBranch ?? effectiveBranch(scopeSelected));
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [vendorTerm, setVendorTerm] = useState("");
  const [product, setProduct] = useState<InvProduct | null>(null);
  const [productTerm, setProductTerm] = useState("");
  const [variantIndex, setVariantIndex] = useState(0);
  const [qty, setQty] = useState<number>(1);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [inwards, setInwards] = useState<InwardRow[]>([]);

  useEffect(() => {
    void hydrateVendors();
    void loadInwards();
  }, [hydrateVendors]);

  useEffect(() => {
    setBranch(lockedBranch ?? effectiveBranch(scopeSelected));
  }, [lockedBranch, scopeSelected]);

  const loadInwards = async () => {
    try {
      const res = await fetch("/api/stock-inward", { cache: "no-store" });
      if (res.ok) setInwards((await res.json()) as InwardRow[]);
    } catch {
      /* ignore */
    }
  };

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };

  const vendorMatchesList = useMemo(
    () => (vendorTerm.trim() ? vendors.filter((v) => vendorMatches(v, vendorTerm)).slice(0, 6) : []),
    [vendors, vendorTerm],
  );
  const productMatches = useMemo(
    () => (productTerm.trim() ? invProducts.filter((p) => p.name.toLowerCase().includes(productTerm.toLowerCase())).slice(0, 8) : []),
    [invProducts, productTerm],
  );

  const pickProduct = (p: InvProduct) => {
    setProduct(p);
    setProductTerm("");
    setVariantIndex(0);
    setUnitCost(p.cost && p.cost > 0 ? p.cost : 0);
  };

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;

  const submit = async () => {
    if (!vendor) return notify("Pick a vendor first.");
    if (!product) return notify("Pick a product to receive.");
    if (qty <= 0) return notify("Quantity must be at least 1.");
    setSaving(true);
    try {
      const res = await fetch("/api/stock-inward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: genDocId("INW"),
          vendorId: vendor.id,
          productId: product.id,
          variantIndex,
          quantity: qty,
          unitCost,
          branch,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      await hydratePOS(); // reflect the bumped on-hand + cost
      await loadInwards();
      notify(`Received ${qty} × ${product.name} into ${branch}`);
      setProduct(null);
      setQty(1);
      setUnitCost(0);
    } catch {
      notify("Couldn't record the inward. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="p-5 md:p-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>
      )}

      <div className="mb-6 border-l-4 border-ink-900 pl-4">
        <h1 className="text-2xl font-bold text-ink-900">Stock Inward</h1>
        <p className="mt-1 text-sm text-ink-500">Receive goods from a vendor — updates on-hand stock &amp; cost</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Form */}
        <section className="space-y-5 rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
          {/* Vendor lookup */}
          <div>
            <label className={label}>Vendor — search name / phone / code</label>
            {vendor ? (
              <div className="flex items-center justify-between rounded-lg border border-gold-300 bg-gold-50/60 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink-900"><Truck className="h-4 w-4 text-gold-600" />{vendor.name}{vendor.code ? ` · ${vendor.code}` : ""}</span>
                <button onClick={() => setVendor(null)} className="grid h-6 w-6 place-items-center rounded text-ink-400 hover:bg-ink-900/5 hover:text-ink-900"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2.5 focus-within:border-gold-500">
                  <Search className="h-4 w-4 shrink-0 text-ink-400" />
                  <input value={vendorTerm} onChange={(e) => setVendorTerm(e.target.value)} placeholder="Start typing…" className="w-full bg-transparent text-sm focus:outline-none" />
                </div>
                {vendorMatchesList.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-ink-100 bg-white shadow-lg">
                    {vendorMatchesList.map((v) => (
                      <button key={v.id} onClick={() => { setVendor(v); setVendorTerm(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gold-50">
                        <span className="font-medium text-ink-900">{v.name}</span>
                        <span className="text-xs text-ink-400">{v.code || v.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
                {vendorTerm.trim() && vendorMatchesList.length === 0 && (
                  <p className="mt-1 text-[11px] text-ink-400">No vendor found. Add them on the Vendors page first.</p>
                )}
              </div>
            )}
          </div>

          {/* Product lookup */}
          <div>
            <label className={label}>Product to receive</label>
            {product ? (
              <div className="flex items-center justify-between rounded-lg border border-gold-300 bg-gold-50/60 px-3 py-2.5">
                <span className="text-sm font-semibold text-ink-900">{product.name}</span>
                <button onClick={() => setProduct(null)} className="grid h-6 w-6 place-items-center rounded text-ink-400 hover:bg-ink-900/5 hover:text-ink-900"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2.5 focus-within:border-gold-500">
                  <Search className="h-4 w-4 shrink-0 text-ink-400" />
                  <input value={productTerm} onChange={(e) => setProductTerm(e.target.value)} placeholder="Search inventory…" className="w-full bg-transparent text-sm focus:outline-none" />
                </div>
                {productMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-ink-100 bg-white shadow-lg">
                    {productMatches.map((p) => (
                      <button key={p.id} onClick={() => pickProduct(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gold-50">
                        <span className="font-medium text-ink-900">{p.name}</span>
                        <span className="text-xs text-ink-400">{productStock(p)} in stock</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Variant + qty + cost — only once a product is chosen */}
          {product && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={label}>Variant</label>
                <select value={variantIndex} onChange={(e) => setVariantIndex(Number(e.target.value))} className={field}>
                  {product.variants.map((v, i) => (
                    <option key={i} value={i}>{v.attr}{v.finish ? ` · ${v.finish}` : ""} — {v.stock} in stock</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Quantity received</label>
                <input type="number" min={1} value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} className={field} />
              </div>
              <div>
                <label className={label}>Unit cost (₹)</label>
                <input type="number" min={0} value={unitCost || ""} onChange={(e) => setUnitCost(Number(e.target.value))} className={field} placeholder="Purchase price" />
              </div>
            </div>
          )}

          {/* Branch + submit */}
          <div className="flex items-end justify-between gap-3 border-t border-ink-100 pt-4">
            <div>
              <label className={label}>Into branch</label>
              <select value={branch} onChange={(e) => setBranch(e.target.value as typeof branch)} disabled={!!lockedBranch} className={cn(field, "w-auto disabled:cursor-not-allowed disabled:opacity-70")}>
                <option>Branch 1</option>
                <option>Branch 2</option>
              </select>
            </div>
            <button onClick={submit} disabled={saving || !vendor || !product} className="flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-ink-800 disabled:opacity-50">
              <PackagePlus className="h-4 w-4" /> {saving ? "Receiving…" : "Receive Stock"}
            </button>
          </div>
        </section>

        {/* Recent inwards */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-500">Recent Inwards</h2>
          <div className="overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-4 py-3">When</th><th>Product</th><th>Vendor</th><th className="text-right">Qty</th><th className="text-right pr-4">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {inwards.map((r) => (
                  <tr key={r.id} className="text-ink-700">
                    <td className="px-4 py-3 text-xs text-ink-500">{fmt(r.inwardAt)}<div className="text-[10px] text-ink-400">{r.branch}</div></td>
                    <td><p className="font-medium text-ink-900">{r.productName}</p>{r.variant && <p className="text-[11px] text-ink-400">{r.variant}</p>}</td>
                    <td className="text-xs">{vendorName(r.vendorId)}</td>
                    <td className="text-right font-semibold tabular-nums text-success">+{r.quantity}</td>
                    <td className="pr-4 text-right tabular-nums">{formatINR(r.unitCost)}</td>
                  </tr>
                ))}
                {inwards.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-ink-400">No stock received yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
