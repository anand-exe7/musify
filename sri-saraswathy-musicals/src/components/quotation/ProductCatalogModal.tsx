"use client";
import { useMemo, useState } from "react";
import { Search, X, Plus, Minus, Trash2, ChevronDown, Package, Check, Loader2 } from "lucide-react";
import { useInventory, usePOS, type InvProduct } from "@/lib/store/pos";
import { variantKey, variantLabel } from "@/lib/catalog/variants";
import { variantStockAt, branchLabel, type Branch } from "@/lib/stock";
import { cn, formatINR } from "@/lib/utils";
import type { PickedLine } from "@/components/quotation/LineProductPicker";

const enabled = (p: InvProduct) => p.variants.map((v, i) => ({ v, i })).filter(({ v }) => !v.disabled);

/** The quotation line a catalogue product + variant becomes — named exactly as the billing counter names it. */
export function pickedLineFor(p: InvProduct, vi: number): PickedLine {
  const v = p.variants[vi];
  const rate = v.price > 0 ? v.price : p.basePrice;
  return {
    name: enabled(p).length > 1 ? `${p.name} — ${v.attr}${v.finish ? ` · ${v.finish}` : ""}` : p.name,
    hsn: p.hsn ?? "",
    rate,
    mrp: Math.max(p.mrp || 0, rate),
    gst: p.isGstApplicable === false ? 0 : (p.gstRate ?? 18),
    productId: p.id,
    variantKey: variantKey(v),
  };
}

/**
 * Browse the catalogue in a pop-up and add products to a quotation: category chips, search, photos, every variant
 * with its price and stock at the quotation's branch, and − qty + buttons once something is added.
 *
 * `qtyOf` / `onChange` let the modal show and change what is already on the quotation, so it can stay open while
 * several products are added. In `single` mode (filling one empty line) the first pick closes it.
 */
export function ProductCatalogModal({
  branch,
  qtyOf,
  onChange,
  onClose,
  single,
}: {
  branch: string;
  qtyOf: (productId: string, variantKey: string) => number;
  /** Set the quantity of a product + variant on the quotation (0 removes it). */
  onChange: (line: PickedLine, qty: number) => void;
  onClose: () => void;
  single?: boolean;
}) {
  const products = useInventory();
  const loaded = usePOS((s) => s.invLoaded);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const active = useMemo(() => products.filter((p) => p.active && enabled(p).length > 0), [products]);
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of active) m.set(p.category || "Other", (m.get(p.category || "Other") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [active]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return active
      .filter((p) => (cat === "all" || (p.category || "Other") === cat) && (!needle || `${p.brand ?? ""} ${p.name} ${p.category}`.toLowerCase().includes(needle)))
      .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
  }, [active, q, cat]);

  const set = (p: InvProduct, vi: number, qty: number) => {
    onChange(pickedLineFor(p, vi), Math.max(0, qty));
    if (single && qty > 0) onClose();
  };
  const totalAdded = active.reduce((n, p) => n + enabled(p).reduce((m, { v }) => m + qtyOf(p.id, variantKey(v)), 0), 0);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-ivory-50 shadow-xl sm:max-w-3xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-ink-100 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-ink-900">{single ? "Choose a product" : "Add products"}</h3>
              <p className="text-xs text-ink-500">Stock shown for {branchLabel(branch)} · tap a product to add it</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5"><X className="h-5 w-5" /></button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand or category…" className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none" />
          </div>
          {categories.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[["all", active.length] as const, ...categories].map(([c, n]) => (
                <button key={c} onClick={() => setCat(c)} className={cn("rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors", cat === c ? "bg-ink-900 text-ivory-50" : "bg-white text-ink-600 ring-1 ring-ink-100 hover:text-ink-900")}>
                  {c === "all" ? "All" : c} <span className="opacity-60">{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Products */}
        <div className="flex-1 overflow-y-auto p-4">
          {!loaded ? (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin text-gold-500" /> Loading products…</p>
          ) : shown.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-400">No product matches{q ? ` “${q}”` : ""}.</p>
          ) : (
            <div className="grid items-start gap-2.5 sm:grid-cols-2">
              {shown.map((p) => {
                const vars = enabled(p);
                const multi = vars.length > 1;
                const onHand = vars.reduce((n, { v }) => n + variantStockAt(v, branch as Branch), 0);
                const added = vars.reduce((n, { v }) => n + qtyOf(p.id, variantKey(v)), 0);
                const prices = vars.map(({ v }) => (v.price > 0 ? v.price : p.basePrice));
                const lo = Math.min(...prices), hi = Math.max(...prices);
                const one = vars[0];
                const isOpen = openId === p.id;
                return (
                  <div key={p.id} className={cn("rounded-xl border bg-white transition-colors", added > 0 ? "border-gold-500/60" : "border-ink-100")}>
                    <div className="flex items-center gap-3 p-2.5">
                      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-ivory-100">
                        {p.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-5 w-5 text-ink-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-900">{p.name}</p>
                        <p className="truncate text-[11px] text-ink-500">{[p.brand, p.category].filter(Boolean).join(" · ")}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-[11px]">
                          <span className="font-semibold text-ink-800">{lo === hi ? formatINR(lo) : `${formatINR(lo)} – ${formatINR(hi)}`}</span>
                          <span className={onHand > 0 ? "text-success" : "text-danger"}>{onHand > 0 ? `${onHand} in stock` : "Out of stock here"}</span>
                        </p>
                      </div>
                      {multi ? (
                        <button onClick={() => setOpenId(isOpen ? null : p.id)} className={cn("flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider", added > 0 ? "border-gold-500 bg-gold-50 text-gold-800" : "border-ink-200 text-ink-700 hover:border-gold-500")}>
                          {added > 0 ? <><Check className="h-3.5 w-3.5" /> {added}</> : `${vars.length} options`}
                          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                        </button>
                      ) : (
                        <Stepper qty={qtyOf(p.id, variantKey(one.v))} onSet={(n) => set(p, one.i, n)} />
                      )}
                    </div>
                    {multi && isOpen && (
                      <ul className="divide-y divide-ink-50 border-t border-ink-100">
                        {vars.map(({ v, i }) => {
                          const stock = variantStockAt(v, branch as Branch);
                          return (
                            <li key={i} className="flex items-center gap-3 px-3 py-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-medium text-ink-800">{variantLabel(v) || "Standard"}</p>
                                <p className="text-[11px]">
                                  <span className="font-semibold text-ink-700">{formatINR(v.price > 0 ? v.price : p.basePrice)}</span>
                                  <span className={cn("ml-2", stock > 0 ? "text-success" : "text-danger")}>{stock > 0 ? `${stock} in stock` : "None here"}</span>
                                </p>
                              </div>
                              <Stepper qty={qtyOf(p.id, variantKey(v))} onSet={(n) => set(p, i, n)} />
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!single && (
          <div className="flex items-center justify-between gap-3 border-t border-ink-100 p-4">
            <p className="text-sm text-ink-600">{totalAdded > 0 ? <><span className="font-bold text-ink-900">{totalAdded}</span> item{totalAdded === 1 ? "" : "s"} on this quotation</> : "Nothing added yet"}</p>
            <button onClick={onClose} className="rounded-xl bg-ink-900 px-6 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** + to add; once added, − qty + (the − becomes a bin at 1). Quotations can quote more than is in stock. */
function Stepper({ qty, onSet }: { qty: number; onSet: (n: number) => void }) {
  if (qty <= 0) {
    return (
      <button onClick={() => onSet(1)} aria-label="Add" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-900 text-ivory-50 hover:bg-gold-500 hover:text-ink-900">
        <Plus className="h-4 w-4" />
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center rounded-lg border border-gold-500/60 bg-gold-50">
      <button onClick={() => onSet(qty - 1)} aria-label={qty === 1 ? "Remove" : "One less"} className="grid h-8 w-8 place-items-center text-ink-700 hover:text-danger">
        {qty === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
      </button>
      <span className="min-w-[1.75rem] text-center text-sm font-bold tabular-nums text-ink-900">{qty}</span>
      <button onClick={() => onSet(qty + 1)} aria-label="One more" className="grid h-8 w-8 place-items-center text-ink-700 hover:text-gold-700">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
