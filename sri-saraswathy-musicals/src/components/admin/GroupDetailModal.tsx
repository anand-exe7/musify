"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, ChevronRight, ChevronDown, Tags, Layers, Pencil, Download } from "lucide-react";
import { productStock, productStockAt, variantStockAt, type InvProduct } from "@/lib/store/pos";
import { BRANCH_KEYS, branchLabel, type Branch } from "@/lib/stock";
import { downloadCsv, rupees, stamp } from "@/lib/csv";
import { cn, formatINR } from "@/lib/utils";

/** Rupees without a trailing ".00" — the same reading as the cards behind this window. */
const money = (paise: number) => formatINR(paise).replace(/\.00$/, "");

type Sort = "value" | "units" | "name";

/**
 * Everything inside one category or department, opened from its card: the figures in full, what each branch
 * holds, and every product in it — each of which opens to show its variants, or goes straight to the editor.
 */
export function GroupDetailModal({
  kind, name, products, active, onToggle, onEditProduct, onClose,
}: {
  kind: "category" | "department";
  name: string;
  products: InvProduct[];
  active: boolean;
  onToggle: () => void;
  onEditProduct: (p: InvProduct) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("value");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const valueOf = (p: InvProduct) => productStock(p) * p.basePrice;

  const stats = useMemo(() => {
    let units = 0, value = 0, out = 0, hidden = 0;
    const byBranch: Record<string, number> = {};
    for (const b of BRANCH_KEYS) byBranch[b] = 0;
    for (const p of products) {
      const s = productStock(p);
      units += s;
      value += s * p.basePrice;
      if (s <= 0) out += 1;
      if (!p.active) hidden += 1;
      for (const b of BRANCH_KEYS) byBranch[b] += productStockAt(p, b as Branch);
    }
    return { units, value, out, hidden, byBranch };
  }, [products]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.brand ?? "").toLowerCase().includes(q))
      .sort((a, b) =>
        sort === "name" ? a.name.localeCompare(b.name)
        : sort === "units" ? productStock(b) - productStock(a)
        : valueOf(b) - valueOf(a),
      );
  }, [products, query, sort]);

  const exportCsv = () =>
    downloadCsv(`${kind}-${name}-${stamp()}.csv`, [
      [kind === "category" ? "Category" : "Department", name],
      ["Products", String(products.length), "Units", String(stats.units), "Stock value", rupees(stats.value)],
      [],
      ["Product", "Variant", ...BRANCH_KEYS.map(branchLabel), "Units", "Price", "Value", "Visible"],
      ...products.flatMap((p) =>
        p.variants.map((v, i) => [
          i === 0 ? p.name : "",
          `${v.attr || "Standard"}${v.finish ? ` · ${v.finish}` : ""}${v.disabled ? " (off)" : ""}`,
          ...BRANCH_KEYS.map((b) => String(variantStockAt(v, b as Branch) || 0)),
          String(BRANCH_KEYS.reduce((n, b) => n + (variantStockAt(v, b as Branch) || 0), 0)),
          rupees(v.price || p.basePrice),
          i === 0 ? rupees(valueOf(p)) : "",
          i === 0 ? (p.active ? "Yes" : "Hidden") : "",
        ]),
      ),
    ]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-950/45 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${name} details`}
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-ivory-50 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="shrink-0 border-b border-ink-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", active ? "bg-gold-100 text-gold-600" : "bg-ink-100 text-ink-400")}>
              {kind === "category" ? <Tags className="h-5 w-5" /> : <Layers className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-400">{kind === "category" ? "Category" : "Department"}</p>
              <h3 className="truncate text-lg font-bold text-ink-900" title={name}>{name}</h3>
            </div>
            <button
              onClick={onToggle}
              title={active ? "Switch off" : "Switch on"}
              aria-pressed={active}
              className={cn("relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors", active ? "bg-success" : "bg-ink-300")}
            >
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", active ? "left-[22px]" : "left-0.5")} />
            </button>
            <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#FAF7EF] px-5 py-4">
          {/* the figures, in full */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Products", value: String(products.length), hint: stats.hidden > 0 ? `${stats.hidden} hidden` : "" },
              { label: "Units in stock", value: String(stats.units), hint: stats.out > 0 ? `${stats.out} out of stock` : "" },
              { label: "Stock value", value: money(stats.value), hint: "units × base price" },
              { label: "Average price", value: money(products.length ? Math.round(products.reduce((n, p) => n + p.basePrice, 0) / products.length) : 0), hint: "" },
            ].map((f) => (
              <div key={f.label} className="rounded-xl border border-ink-100 bg-ivory-50 px-3 py-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-400">{f.label}</p>
                <p className="mt-1 break-words text-base font-bold tabular-nums text-ink-900">{f.value}</p>
                {f.hint && <p className="text-[10px] text-ink-400">{f.hint}</p>}
              </div>
            ))}
          </div>

          {/* what each branch holds */}
          <div className="mt-3 grid grid-cols-3 divide-x divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-ivory-50">
            {BRANCH_KEYS.map((b) => (
              <div key={b} className="px-3 py-2.5 text-center">
                <p className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-ink-400">{branchLabel(b)}</p>
                <p className="mt-0.5 text-base font-bold tabular-nums text-ink-900">{stats.byBranch[b]}</p>
              </div>
            ))}
          </div>

          {/* products */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 focus-within:border-gold-500">
              <Search className="h-4 w-4 shrink-0 text-ink-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a product…" className="w-full bg-transparent text-sm focus:outline-none" />
              {query && <button onClick={() => setQuery("")} aria-label="Clear search" className="text-ink-400 hover:text-ink-700"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort products" className="h-9 rounded-xl border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 focus:border-gold-500 focus:outline-none">
              <option value="value">Highest value</option>
              <option value="units">Most units</option>
              <option value="name">Name A–Z</option>
            </select>
            <button onClick={exportCsv} disabled={products.length === 0} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600 disabled:opacity-50">
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-ink-100 bg-ivory-50">
            <ul className="divide-y divide-ink-50">
              {rows.map((p) => {
                const units = productStock(p);
                const isOpen = open === p.id;
                return (
                  <li key={p.id}>
                    <div className={cn("flex items-center gap-2 px-3 py-2.5", isOpen && "bg-ink-900/[0.03]")}>
                      <button
                        onClick={() => setOpen(isOpen ? null : p.id)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Hide" : "Show"} the variants of ${p.name}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-ink-200 text-ink-500 hover:border-gold-500 hover:text-gold-600"
                      >
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-900" title={p.name}>{p.name}</p>
                        <p className="truncate text-[11px] text-ink-500">
                          {kind === "department" ? `${p.category} · ` : ""}{p.variants.length} variant{p.variants.length === 1 ? "" : "s"}
                          {!p.active && <span className="ml-1.5 rounded bg-ink-900/85 px-1.5 py-0.5 text-[9px] font-bold uppercase text-ivory-50">Hidden</span>}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="text-sm font-semibold tabular-nums text-ink-900">{money(p.basePrice)}</p>
                        <p className="text-[10px] text-ink-400">price</p>
                      </div>
                      <div className="w-16 shrink-0 text-right">
                        <p className={cn("text-sm font-bold tabular-nums", units <= 0 ? "text-danger" : "text-ink-900")}>{units}</p>
                        <p className="text-[10px] text-ink-400">units</p>
                      </div>
                      <div className="w-24 shrink-0 text-right">
                        <p className="whitespace-nowrap text-sm font-bold tabular-nums text-ink-900">{money(units * p.basePrice)}</p>
                        <p className="text-[10px] text-ink-400">value</p>
                      </div>
                      <button
                        onClick={() => onEditProduct(p)}
                        title={`Edit ${p.name}`}
                        aria-label={`Edit ${p.name}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-ink-200 text-ink-600 hover:border-gold-500 hover:text-gold-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {isOpen && (
                      <div className="overflow-x-auto bg-ink-900/[0.02] px-3 pb-3 pl-12">
                        <table className="w-full min-w-[420px] text-xs">
                          <thead>
                            <tr className="text-left text-[9px] font-bold uppercase tracking-wider text-ink-400">
                              <th className="py-1.5 pr-3">Variant</th>
                              {BRANCH_KEYS.map((b) => <th key={b} className="whitespace-nowrap px-2 py-1.5 text-right">{branchLabel(b)}</th>)}
                              <th className="px-2 py-1.5 text-right">Units</th>
                              <th className="py-1.5 pl-2 text-right">Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.variants.map((v, i) => {
                              const total = BRANCH_KEYS.reduce((n, b) => n + (variantStockAt(v, b as Branch) || 0), 0);
                              return (
                                <tr key={v.id ?? i} className={cn("border-t border-ink-100", v.disabled && "opacity-55")}>
                                  <td className="py-1.5 pr-3 font-medium text-ink-800">
                                    {v.attr || "Standard"}{v.finish ? ` · ${v.finish}` : ""}
                                    {v.disabled && <span className="ml-1.5 rounded bg-ink-900/85 px-1 py-0.5 text-[8px] font-bold uppercase text-ivory-50">Off</span>}
                                  </td>
                                  {BRANCH_KEYS.map((b) => (
                                    <td key={b} className={cn("px-2 py-1.5 text-right tabular-nums", (variantStockAt(v, b as Branch) || 0) <= 0 ? "text-ink-300" : "text-ink-700")}>
                                      {variantStockAt(v, b as Branch) || 0}
                                    </td>
                                  ))}
                                  <td className="px-2 py-1.5 text-right font-bold tabular-nums text-ink-900">{total}</td>
                                  <td className="py-1.5 pl-2 text-right tabular-nums text-ink-700">{money(v.price || p.basePrice)}</td>
                                </tr>
                              );
                            })}
                            {p.variants.length === 0 && (
                              <tr><td colSpan={BRANCH_KEYS.length + 3} className="py-3 text-center text-[11px] text-ink-400">This product has no variants.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                );
              })}
              {rows.length === 0 && (
                <li className="px-4 py-12 text-center text-sm text-ink-400">
                  {products.length === 0 ? `No products in this ${kind} yet.` : "No product matches that search."}
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
