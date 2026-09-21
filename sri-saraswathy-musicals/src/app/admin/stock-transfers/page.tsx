"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Search, X, ArrowRight } from "lucide-react";
import { usePOS, productStockAt, variantStockAt, type Branch, type InvProduct } from "@/lib/store/pos";
import { useBranchScope, effectiveBranch } from "@/lib/store/branch";
import { genDocId } from "@/lib/ids";
import { cn } from "@/lib/utils";

interface TransferRow {
  id: string;
  productName: string;
  variant: string;
  quantity: number;
  fromBranch: string;
  toBranch: string;
  note: string;
  transferredAt: string;
}

function fmt(d: string) {
  const x = new Date(d);
  return isNaN(+x) ? d : x.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const OTHER_BRANCH: Record<Branch, Branch> = { "Branch 1": "Branch 2", "Branch 2": "Branch 1" };

export default function StockTransfersPage() {
  const invProducts = usePOS((s) => s.invProducts);
  const hydratePOS = usePOS((s) => s.hydrate);
  const canSwitch = useBranchScope((s) => s.canSwitch);
  const scopeAccess = useBranchScope((s) => s.access);
  const scopeSelected = useBranchScope((s) => s.selected);
  // Branch users are pinned as source; admins pick either direction.
  const lockedSource: Branch | null =
    !canSwitch && (scopeAccess === "Branch 1" || scopeAccess === "Branch 2") ? scopeAccess : null;

  const [fromBranch, setFromBranch] = useState<Branch>(lockedSource ?? effectiveBranch(scopeSelected));
  const [toBranch, setToBranch] = useState<Branch>(OTHER_BRANCH[lockedSource ?? effectiveBranch(scopeSelected)]);
  const [product, setProduct] = useState<InvProduct | null>(null);
  const [productTerm, setProductTerm] = useState("");
  const [variantIndex, setVariantIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);

  useEffect(() => {
    setFromBranch(lockedSource ?? effectiveBranch(scopeSelected));
    setToBranch(OTHER_BRANCH[lockedSource ?? effectiveBranch(scopeSelected)]);
  }, [lockedSource, scopeSelected]);

  useEffect(() => {
    void loadTransfers();
  }, []);

  const loadTransfers = async () => {
    try {
      const res = await fetch("/api/stock-transfers", { cache: "no-store" });
      if (res.ok) setTransfers((await res.json()) as TransferRow[]);
    } catch {
      /* ignore */
    }
  };

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };

  const productMatches = useMemo(
    () =>
      productTerm.trim()
        ? invProducts.filter((p) => p.name.toLowerCase().includes(productTerm.toLowerCase())).slice(0, 8)
        : [],
    [invProducts, productTerm],
  );

  const pickProduct = (p: InvProduct) => {
    setProduct(p);
    setProductTerm("");
    setVariantIndex(0);
    setQty(1);
  };

  const activeVariant = product?.variants[variantIndex];
  const sourceOnHand = activeVariant ? variantStockAt(activeVariant, fromBranch) : 0;
  const destOnHand = activeVariant ? variantStockAt(activeVariant, toBranch) : 0;

  const submit = async () => {
    if (!product) return notify("Pick a product first.");
    if (fromBranch === toBranch) return notify("Source and destination must differ.");
    if (qty <= 0) return notify("Quantity must be at least 1.");
    if (qty > sourceOnHand) return notify(`Only ${sourceOnHand} on hand at ${fromBranch}.`);
    setSaving(true);
    try {
      const res = await fetch("/api/stock-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: genDocId("TRF"),
          productId: product.id,
          variantIndex,
          quantity: qty,
          fromBranch,
          toBranch,
          note,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "save failed");
      }
      await hydratePOS();
      await loadTransfers();
      notify(`Transferred ${qty} × ${product.name}`);
      setProduct(null);
      setQty(1);
      setNote("");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Couldn't record the transfer.");
    } finally {
      setSaving(false);
    }
  };

  const swapDirection = () => {
    if (lockedSource) return;
    setFromBranch(toBranch);
    setToBranch(fromBranch);
  };

  const field =
    "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="p-5 md:p-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>
      )}

      <div className="mb-6 border-l-4 border-ink-900 pl-4">
        <h1 className="text-2xl font-bold text-ink-900">Stock Transfers</h1>
        <p className="mt-1 text-sm text-ink-500">Move goods between branches — updates both on-hand buckets in one step.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Form */}
        <section className="space-y-5 rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
          {/* Direction */}
          <div>
            <label className={label}>Direction</label>
            <div className="flex items-center gap-2">
              <select value={fromBranch} onChange={(e) => setFromBranch(e.target.value as Branch)} disabled={!!lockedSource} className={cn(field, "disabled:cursor-not-allowed disabled:opacity-70")}>
                <option>Branch 1</option>
                <option>Branch 2</option>
              </select>
              <button
                onClick={swapDirection}
                disabled={!!lockedSource}
                title="Swap direction"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-ink-200 bg-ivory-50 text-ink-500 hover:bg-ink-900/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </button>
              <select value={toBranch} onChange={(e) => setToBranch(e.target.value as Branch)} className={field}>
                <option>Branch 1</option>
                <option>Branch 2</option>
              </select>
            </div>
            {fromBranch === toBranch && (
              <p className="mt-1 text-[11px] text-warning">Pick different source and destination branches.</p>
            )}
          </div>

          {/* Product lookup */}
          <div>
            <label className={label}>Product to transfer</label>
            {product ? (
              <div className="flex items-center justify-between rounded-lg border border-gold-300 bg-gold-50/60 px-3 py-2.5">
                <span className="text-sm font-semibold text-ink-900">
                  {product.name}
                  <span className="ml-2 text-xs font-normal text-ink-500">
                    · {productStockAt(product, fromBranch)} at {fromBranch}
                  </span>
                </span>
                <button onClick={() => setProduct(null)} className="grid h-6 w-6 place-items-center rounded text-ink-400 hover:bg-ink-900/5 hover:text-ink-900">
                  <X className="h-4 w-4" />
                </button>
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
                        <span className="text-xs text-ink-400">
                          {productStockAt(p, fromBranch)} at {fromBranch}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Variant + qty */}
          {product && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={label}>Variant</label>
                <select value={variantIndex} onChange={(e) => setVariantIndex(Number(e.target.value))} className={field}>
                  {product.variants.map((v, i) => (
                    <option key={i} value={i}>
                      {v.attr}{v.finish ? ` · ${v.finish}` : ""} — {variantStockAt(v, fromBranch)} at {fromBranch}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Quantity</label>
                <input type="number" min={1} max={sourceOnHand} value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} className={field} />
                <p className="mt-1 text-[11px] text-ink-400">
                  {sourceOnHand} at {fromBranch} → {destOnHand} at {toBranch}
                </p>
              </div>
              <div>
                <label className={label}>After transfer</label>
                <p className="rounded-lg border border-ink-100 bg-ivory-100/60 px-3 py-2.5 text-sm text-ink-700">
                  {Math.max(0, sourceOnHand - qty)} → {destOnHand + qty}
                </p>
              </div>
              <div className="col-span-2">
                <label className={label}>Note (optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this moving?" className={field} />
              </div>
            </div>
          )}

          <div className="flex justify-end border-t border-ink-100 pt-4">
            <button
              onClick={submit}
              disabled={saving || !product || qty <= 0 || qty > sourceOnHand || fromBranch === toBranch}
              className="flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
            >
              <ArrowRight className="h-4 w-4" /> {saving ? "Transferring…" : "Transfer stock"}
            </button>
          </div>
        </section>

        {/* Recent transfers */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-500">Recent transfers</h2>
          <div className="overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-4 py-3">When</th>
                  <th>Product</th>
                  <th>Direction</th>
                  <th className="text-right pr-4">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {transfers.map((r) => (
                  <tr key={r.id} className="text-ink-700">
                    <td className="px-4 py-3 text-xs text-ink-500">{fmt(r.transferredAt)}</td>
                    <td>
                      <p className="font-medium text-ink-900">{r.productName}</p>
                      {r.variant && <p className="text-[11px] text-ink-400">{r.variant}</p>}
                    </td>
                    <td className="text-xs text-ink-600">
                      {r.fromBranch} → {r.toBranch}
                      {r.note && <div className="text-[10px] text-ink-400">{r.note}</div>}
                    </td>
                    <td className="pr-4 text-right font-semibold tabular-nums">+{r.quantity}</td>
                  </tr>
                ))}
                {transfers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-sm text-ink-400">No transfers yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
