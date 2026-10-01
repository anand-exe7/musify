"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Search, ArrowRight, Trash2 } from "lucide-react";
import { usePOS, productStockAt, variantStockAt, type Branch, type InvProduct } from "@/lib/store/pos";
import { useBranchScope, effectiveBranch } from "@/lib/store/branch";
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

/** One editable table line; the product is resolved live so stock stays fresh. */
interface Line {
  key: string;
  productId: string;
  variantIndex: number;
  qty: number;
}

const toInt = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

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
  const [productTerm, setProductTerm] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // One id per submission: if the request is retried (timeout, double-click) the
  // server recognises it and returns the original transfer instead of repeating it.
  const batchRef = useRef<string | null>(null);
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
    setTimeout(() => setToast(null), 3200);
  };

  const productMatches = useMemo(
    () =>
      productTerm.trim()
        ? invProducts.filter((p) => p.name.toLowerCase().includes(productTerm.toLowerCase())).slice(0, 8)
        : [],
    [invProducts, productTerm],
  );

  const addLine = (p: InvProduct) => {
    setLines((ls) => [...ls, { key: crypto.randomUUID(), productId: p.id, variantIndex: 0, qty: 1 }]);
    setProductTerm("");
  };
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const productOf = (l: Line) => invProducts.find((p) => p.id === l.productId);
  const onHandAt = (l: Line, branch: Branch) => {
    const v = productOf(l)?.variants[l.variantIndex];
    return v ? variantStockAt(v, branch) : 0;
  };

  // Combined demand per product/variant, so the same item on two rows can't
  // together exceed what the source branch holds.
  const demand = new Map<string, number>();
  for (const l of lines) {
    const k = `${l.productId}#${l.variantIndex}`;
    demand.set(k, (demand.get(k) ?? 0) + l.qty);
  }
  const lineError = (l: Line): string | null => {
    if (!productOf(l)) return "Product not found";
    if (l.qty < 1) return "Qty must be ≥ 1";
    const src = onHandAt(l, fromBranch);
    if (l.qty > src) return `Only ${src} at ${fromBranch}`;
    if ((demand.get(`${l.productId}#${l.variantIndex}`) ?? 0) > src) return `Rows together exceed ${src} at ${fromBranch}`;
    return null;
  };
  const totalQty = lines.reduce((n, l) => n + l.qty, 0);
  const canSubmit = !saving && lines.length > 0 && fromBranch !== toBranch && lines.every((l) => !lineError(l));

  const submit = async () => {
    if (fromBranch === toBranch) return notify("Source and destination must differ.");
    if (lines.length === 0) return notify("Add at least one product.");
    if (lines.some(lineError)) return notify("Fix the highlighted lines first.");
    setSaving(true);
    try {
      const batchId = (batchRef.current ??= crypto.randomUUID());
      const res = await fetch("/api/stock-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          fromBranch,
          toBranch,
          note,
          lines: lines.map((l) => ({ productId: l.productId, variantIndex: l.variantIndex, quantity: l.qty })),
        }),
      });
      if (!res.ok) {
        batchRef.current = null; // a refused request starts a fresh submission next time
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "save failed");
      }
      await hydratePOS();
      await loadTransfers();
      notify(`Transferred ${totalQty} unit${totalQty === 1 ? "" : "s"} across ${lines.length} product${lines.length === 1 ? "" : "s"}`);
      batchRef.current = null;
      setLines([]);
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
        <p className="mt-1 text-sm text-ink-500">Move several products between branches at once — updates both on-hand buckets.</p>
      </div>

      <div className="space-y-6">
        <section className="space-y-5 rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
          <div className="grid gap-5 md:grid-cols-2">
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

            {/* Product lookup — each pick adds a table line */}
            <div>
              <label className={label}>Add product to this transfer</label>
              <div className="relative">
                <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2.5 focus-within:border-gold-500">
                  <Search className="h-4 w-4 shrink-0 text-ink-400" />
                  <input value={productTerm} onChange={(e) => setProductTerm(e.target.value)} placeholder="Search inventory…" className="w-full bg-transparent text-sm focus:outline-none" />
                </div>
                {productMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-ink-100 bg-white shadow-lg">
                    {productMatches.map((p) => (
                      <button key={p.id} onClick={() => addLine(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gold-50">
                        <span className="font-medium text-ink-900">{p.name}</span>
                        <span className="text-xs text-ink-400">{productStockAt(p, fromBranch)} at {fromBranch}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Editable lines */}
          <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-3 py-3">#</th>
                  <th>Product</th>
                  <th>Variant</th>
                  <th className="w-28 pr-2 text-right">At {fromBranch}</th>
                  <th className="w-24 pr-2 text-right">Qty</th>
                  <th className="w-36 pr-2 text-right">After (src → dest)</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {lines.map((l, i) => {
                  const p = productOf(l);
                  const err = lineError(l);
                  const src = onHandAt(l, fromBranch);
                  const dst = onHandAt(l, toBranch);
                  return (
                    <tr key={l.key} className={cn("align-middle", err && "bg-danger/5")}>
                      <td className="px-3 py-2 text-xs text-ink-400">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <p className="font-medium text-ink-900">{p?.name ?? "—"}</p>
                        {err && <p className="text-[11px] text-danger">{err}</p>}
                      </td>
                      <td className="pr-2">
                        <select value={l.variantIndex} onChange={(e) => patch(l.key, { variantIndex: Number(e.target.value) })} className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-xs focus:outline-none">
                          {(p?.variants ?? []).map((v, vi) => (
                            <option key={vi} value={vi}>{v.attr}{v.finish ? ` · ${v.finish}` : ""}</option>
                          ))}
                        </select>
                      </td>
                      <td className="pr-2 text-right tabular-nums text-ink-600">{src}</td>
                      <td className="pr-2">
                        <input type="number" min={1} max={src} step={1} value={l.qty || ""} onChange={(e) => patch(l.key, { qty: toInt(e.target.value) })} className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gold-500 focus:outline-none" />
                      </td>
                      <td className="pr-2 text-right text-xs tabular-nums text-ink-600">{Math.max(0, src - l.qty)} → {dst + l.qty}</td>
                      <td className="pr-2">
                        <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line" className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-400">Search above to add products to this transfer.</td></tr>
                )}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr className="border-t border-ink-100 bg-[#FAF7EF] text-xs font-semibold text-ink-900">
                    <td colSpan={4} className="px-3 py-3 text-right uppercase tracking-wider text-ink-500">Total units</td>
                    <td className="pr-2 text-right tabular-nums">{totalQty}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="grid gap-3 border-t border-ink-100 pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className={label}>Note (optional, applies to all lines)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this moving?" className={field} />
            </div>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
            >
              <ArrowRight className="h-4 w-4" /> {saving ? "Transferring…" : "Transfer stock"}
            </button>
          </div>
        </section>

        {/* Recent transfers */}
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-500">Recent transfers</h2>
          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-4 py-3">When</th>
                  <th>Product</th>
                  <th>Direction</th>
                  <th className="pr-4 text-right">Qty</th>
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
                    <td className="pr-4 text-right font-semibold tabular-nums">{r.quantity}</td>
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
