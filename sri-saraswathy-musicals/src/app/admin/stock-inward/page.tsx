"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PackagePlus, Search, X, Truck, Trash2, Plus } from "lucide-react";
import { usePOS, productStock, type InvProduct } from "@/lib/store/pos";
import { useVendors, vendorMatches } from "@/lib/store/vendors";
import { useBranchScope } from "@/lib/store/branch";
import type { Vendor } from "@/types";
import { formatINR, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { ProductModal } from "@/components/admin/ProductModal";
import { useAuth } from "@/lib/store/auth";

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

/** One editable table line. The setters keep `b1 + b2 === qty` true. */
interface Line {
  key: string;
  product: InvProduct;
  variantIndex: number;
  qty: number;
  b1: number;
  b2: number;
  unitCost: number; // paise
}

const toInt = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

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
  const lockedBranch = !canSwitch && (scopeAccess === "Branch 1" || scopeAccess === "Branch 2") ? scopeAccess : null;

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [vendorTerm, setVendorTerm] = useState("");
  const [productTerm, setProductTerm] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const isAdmin = useAuth((s) => s.isAdmin);
  // One id per submission: if the request is retried (timeout, double-click) the
  // server recognises it and returns the original inward instead of repeating it.
  const batchRef = useRef<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [inwards, setInwards] = useState<InwardRow[]>([]);

  useEffect(() => {
    void hydrateVendors();
    void loadInwards();
  }, [hydrateVendors]);

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
    setTimeout(() => setToast(null), 3200);
  };

  const vendorMatchesList = useMemo(
    () => (vendorTerm.trim() ? vendors.filter((v) => vendorMatches(v, vendorTerm)).slice(0, 6) : []),
    [vendors, vendorTerm],
  );
  const productMatches = useMemo(
    () => (productTerm.trim() ? invProducts.filter((p) => p.name.toLowerCase().includes(productTerm.toLowerCase())).slice(0, 8) : []),
    [invProducts, productTerm],
  );

  const addLine = (p: InvProduct) => {
    // Branch users receive everything into their own branch.
    setLines((ls) => [
      ...ls,
      {
        key: crypto.randomUUID(),
        product: p,
        variantIndex: 0,
        qty: 1,
        b1: lockedBranch === "Branch 2" ? 0 : 1,
        b2: lockedBranch === "Branch 2" ? 1 : 0,
        unitCost: p.cost && p.cost > 0 ? p.cost : 0,
      },
    ]);
    setProductTerm("");
  };

  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  // Total drives the split (B1 clamped, B2 = remainder); editing either branch
  // recomputes the other from the total, so a line is always balanced.
  const setQty = (l: Line, qty: number) => {
    const b1 = lockedBranch ? (lockedBranch === "Branch 1" ? qty : 0) : Math.min(l.b1, qty);
    patch(l.key, { qty, b1, b2: qty - b1 });
  };
  const setB1 = (l: Line, v: number) => {
    const b1 = Math.min(v, l.qty);
    patch(l.key, { b1, b2: l.qty - b1 });
  };
  const setB2 = (l: Line, v: number) => {
    const b2 = Math.min(v, l.qty);
    patch(l.key, { b2, b1: l.qty - b2 });
  };

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;

  const lineError = (l: Line): string | null => {
    if (l.qty < 1) return "Qty must be ≥ 1";
    if (l.b1 + l.b2 !== l.qty) return "Split doesn't match qty";
    return null;
  };
  const totals = lines.reduce(
    (t, l) => ({ qty: t.qty + l.qty, b1: t.b1 + l.b1, b2: t.b2 + l.b2, cost: t.cost + l.qty * l.unitCost }),
    { qty: 0, b1: 0, b2: 0, cost: 0 },
  );
  const canSubmit = !!vendor && lines.length > 0 && lines.every((l) => !lineError(l)) && !saving;

  const submit = async () => {
    if (!vendor) return notify("Pick a vendor first.");
    if (lines.length === 0) return notify("Add at least one product.");
    if (lines.some(lineError)) return notify("Fix the highlighted lines first.");
    setSaving(true);
    try {
      const batchId = (batchRef.current ??= crypto.randomUUID());
      const res = await fetch("/api/stock-inward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          vendorId: vendor.id,
          lines: lines.map((l) => ({
            productId: l.product.id,
            variantIndex: l.variantIndex,
            unitCost: l.unitCost,
            quantity: l.qty,
            allocations: [
              { branch: "Branch 1", quantity: l.b1 },
              { branch: "Branch 2", quantity: l.b2 },
            ],
          })),
        }),
      });
      if (!res.ok) {
        batchRef.current = null; // a refused request starts a fresh submission next time
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "");
      }
      await hydratePOS(); // reflect the bumped on-hand + cost
      await loadInwards();
      notify(`Received ${totals.qty} unit${totals.qty === 1 ? "" : "s"} across ${lines.length} product${lines.length === 1 ? "" : "s"}`);
      batchRef.current = null;
      setLines([]);
    } catch (e) {
      notify(e instanceof Error && e.message ? e.message : "Couldn't record the inward. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";
  const num =
    "w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gold-500 focus:outline-none disabled:opacity-60";

  return (
    <div className="p-5 md:p-8">
      {creating && (
        <ProductModal
          product={null}
          initialName={productTerm.trim()}
          onClose={() => setCreating(false)}
          onCreated={(p) => addLine(p)}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>
      )}

      <div className="mb-6 border-l-4 border-ink-900 pl-4">
        <h1 className="text-2xl font-bold text-ink-900">Stock Inward</h1>
        <p className="mt-1 text-sm text-ink-500">Receive several products from a vendor and split each between branches — updates on-hand stock &amp; cost</p>
      </div>

      <div className="space-y-6">
        <section className="space-y-5 rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
          <div className="grid gap-5 md:grid-cols-2">
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

            {/* Product lookup — each pick adds a table line */}
            <div>
              <label className={label}>Add product to this receipt</label>
              <div className="relative">
                <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2.5 focus-within:border-gold-500">
                  <Search className="h-4 w-4 shrink-0 text-ink-400" />
                  <input value={productTerm} onChange={(e) => setProductTerm(e.target.value)} placeholder="Search inventory…" className="w-full bg-transparent text-sm focus:outline-none" />
                </div>
                {productTerm.trim() && isAdmin && (
                  <button onClick={() => setCreating(true)} className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-gold-600 hover:underline">
                    <Plus className="h-3.5 w-3.5" /> Add &quot;{productTerm.trim()}&quot; as a new product
                  </button>
                )}
                {productMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-ink-100 bg-white shadow-lg">
                    {productMatches.map((p) => (
                      <button key={p.id} onClick={() => addLine(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gold-50">
                        <span className="font-medium text-ink-900">{p.name}</span>
                        <span className="text-xs text-ink-400">{productStock(p)} in stock</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Editable lines */}
          <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-3 py-3">#</th>
                  <th>Product</th>
                  <th>Variant</th>
                  <th className="w-28">Unit cost (₹)</th>
                  <th className="w-20 text-right pr-2">Total qty</th>
                  <th className="w-20 text-right pr-2">Branch 1</th>
                  <th className="w-20 text-right pr-2">Branch 2</th>
                  <th className="w-24 text-right pr-2">Line total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {lines.map((l, i) => {
                  const err = lineError(l);
                  return (
                    <tr key={l.key} className={cn("align-middle", err && "bg-danger/5")}>
                      <td className="px-3 py-2 text-xs text-ink-400">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <p className="font-medium text-ink-900">{l.product.name}</p>
                        {err && <p className="text-[11px] text-danger">{err}</p>}
                      </td>
                      <td className="pr-2">
                        <select value={l.variantIndex} onChange={(e) => patch(l.key, { variantIndex: Number(e.target.value) })} className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-xs focus:outline-none">
                          {l.product.variants.map((v, vi) => (
                            <option key={vi} value={vi}>{v.attr}{v.finish ? ` · ${v.finish}` : ""}</option>
                          ))}
                        </select>
                      </td>
                      <td className="pr-2"><MoneyInput value={l.unitCost} onChange={(paise) => patch(l.key, { unitCost: paise })} className={num} placeholder="0" /></td>
                      <td className="pr-2"><input type="number" min={1} step={1} value={l.qty || ""} onChange={(e) => setQty(l, toInt(e.target.value))} className={num} /></td>
                      <td className="pr-2"><input type="number" min={0} step={1} value={l.b1} disabled={!!lockedBranch} onChange={(e) => setB1(l, toInt(e.target.value))} className={num} /></td>
                      <td className="pr-2"><input type="number" min={0} step={1} value={l.b2} disabled={!!lockedBranch} onChange={(e) => setB2(l, toInt(e.target.value))} className={num} /></td>
                      <td className="pr-2 text-right tabular-nums text-ink-700">{formatINR(l.qty * l.unitCost)}</td>
                      <td className="pr-2">
                        <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line" className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-400">Search above to add products to this receipt.</td></tr>
                )}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr className="border-t border-ink-100 bg-[#FAF7EF] text-xs font-semibold text-ink-900">
                    <td colSpan={4} className="px-3 py-3 text-right uppercase tracking-wider text-ink-500">Totals</td>
                    <td className="pr-2 text-right tabular-nums">{totals.qty}</td>
                    <td className="pr-2 text-right tabular-nums">{totals.b1}</td>
                    <td className="pr-2 text-right tabular-nums">{totals.b2}</td>
                    <td className="pr-2 text-right tabular-nums">{formatINR(totals.cost)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
            <p className="text-xs text-ink-500">
              {lockedBranch ? `Stock is received into ${lockedBranch}.` : "Branch 1 + Branch 2 always add up to the total qty."}
            </p>
            <button onClick={submit} disabled={!canSubmit} className="flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-ink-800 disabled:opacity-50">
              <PackagePlus className="h-4 w-4" /> {saving ? "Receiving…" : "Receive Stock"}
            </button>
          </div>
        </section>

        {/* Recent inwards */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-500">Recent Inwards</h2>
          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
            <table className="w-full min-w-[560px] text-sm">
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
