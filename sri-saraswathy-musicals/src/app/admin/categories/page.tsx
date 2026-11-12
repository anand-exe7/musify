"use client";
import { useMemo, useState } from "react";
import { usePOS, useInventory, productStock } from "@/lib/store/pos";
import { formatINR, cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, Check, X, Tags, Search, Boxes } from "lucide-react";

type Show = "all" | "on" | "off";

/**
 * INV-01: the one place categories are created, renamed, switched off and removed. A disabled category keeps its
 * products exactly as they are — it is simply no longer offered when filing a new one.
 */
export default function CategoriesPage() {
  const categories = usePOS((s) => s.categories);
  const categoryActive = usePOS((s) => s.categoryActive);
  const invProducts = useInventory();
  const addCategory = usePOS((s) => s.addCategory);
  const renameCategory = usePOS((s) => s.renameCategory);
  const deleteCategory = usePOS((s) => s.deleteCategory);
  const setCategoryActive = usePOS((s) => s.setCategoryActive);

  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const isOn = (c: string) => categoryActive[c] !== false;

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; units: number; value: number }>();
    categories.forEach((c) => map.set(c, { count: 0, units: 0, value: 0 }));
    invProducts.forEach((p) => {
      const s = map.get(p.category) ?? { count: 0, units: 0, value: 0 };
      const units = productStock(p);
      map.set(p.category, { count: s.count + 1, units: s.units + units, value: s.value + units * p.basePrice });
    });
    return map;
  }, [categories, invProducts]);

  // Products grouped by their category label, alphabetically, so each card reads predictably.
  const productsByCategory = useMemo(() => {
    const map = new Map<string, typeof invProducts>();
    categories.forEach((c) => map.set(c, []));
    invProducts.forEach((p) => {
      const list = map.get(p.category);
      if (list) list.push(p);
      else map.set(p.category, [p]);
    });
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [categories, invProducts]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...categories]
      .sort((a, b) => a.localeCompare(b))
      .filter((c) => (show === "all" ? true : show === "on" ? isOn(c) : !isOn(c)))
      .filter((c) => !q || c.toLowerCase().includes(q) || (productsByCategory.get(c) ?? []).some((p) => p.name.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, categoryActive, query, show, productsByCategory]);

  const totals = useMemo(() => {
    let units = 0, value = 0;
    for (const c of categories) {
      const s = stats.get(c);
      if (s) { units += s.units; value += s.value; }
    }
    return { units, value, off: categories.filter((c) => !isOn(c)).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, stats, categoryActive]);

  const add = () => { const v = newCat.trim(); if (v) { addCategory(v); setNewCat(""); } };
  const saveRename = (from: string) => { const to = editVal.trim(); if (to && to !== from) renameCategory(from, to); setEditing(null); };

  const chip = (active: boolean) => cn("h-8 rounded-lg px-3 text-xs font-semibold transition-colors", active ? "bg-ink-900 text-ivory-50" : "text-ink-600 hover:text-ink-900");

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="border-l-4 border-ink-900 pl-4">
          <h1 className="text-2xl font-bold text-ink-900">Categories</h1>
          <p className="mt-1 text-sm text-ink-500">
            {categories.length} categor{categories.length === 1 ? "y" : "ies"}
            {totals.off > 0 && <> · {totals.off} switched off</>} · renaming one updates every product in it
          </p>
        </div>
        <div className="flex h-10 w-full max-w-md gap-2">
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="New category name…"
            className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm focus:border-gold-500 focus:outline-none"
          />
          <button onClick={add} disabled={!newCat.trim()} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-ivory-50 hover:bg-ink-800 disabled:opacity-40">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Categories", value: String(categories.length) },
          { label: "Switched on", value: String(categories.length - totals.off) },
          { label: "Units in stock", value: String(totals.units) },
          { label: "Stock value", value: formatINR(totals.value) },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-ink-100 bg-ivory-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">{s.label}</p>
            <p className="mt-1 truncate text-lg font-bold tabular-nums text-ink-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-ink-100 bg-ivory-50 p-3">
        <div className="flex items-center gap-1 rounded-xl bg-ink-900/[0.04] p-1">
          <button onClick={() => setShow("all")} className={chip(show === "all")}>All</button>
          <button onClick={() => setShow("on")} className={chip(show === "on")}>Switched on</button>
          <button onClick={() => setShow("off")} className={chip(show === "off")}>Switched off</button>
        </div>
        <div className="ml-auto flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 focus-within:border-gold-500 lg:max-w-sm">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a category or product…" className="w-full bg-transparent text-sm focus:outline-none" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search" className="text-ink-400 hover:text-ink-700"><X className="h-3.5 w-3.5" /></button>}
        </div>
      </div>

      {/* Cards */}
      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((c) => {
          const s = stats.get(c) ?? { count: 0, units: 0, value: 0 };
          const list = productsByCategory.get(c) ?? [];
          const isEditing = editing === c;
          const on = isOn(c);
          return (
            <div key={c} className={cn("flex flex-col rounded-2xl border bg-ivory-50", on ? "border-ink-100" : "border-dashed border-ink-200")}>
              {/* name + actions */}
              <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
                <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", on ? "bg-gold-100 text-gold-600" : "bg-ink-100 text-ink-400")}><Tags className="h-4 w-4" /></div>
                {isEditing ? (
                  <input
                    autoFocus
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveRename(c); if (e.key === "Escape") setEditing(null); }}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2 text-sm font-semibold focus:border-gold-500 focus:outline-none"
                  />
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-bold", on ? "text-ink-900" : "text-ink-500")} title={c}>{c}</p>
                    {!on && <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Switched off</p>}
                  </div>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  {isEditing ? (
                    <>
                      <button onClick={() => saveRename(c)} aria-label="Save name" className="grid h-8 w-8 place-items-center rounded-lg text-success hover:bg-success/10"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setEditing(null)} aria-label="Cancel" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setCategoryActive(c, !on)}
                        title={on ? "Switch off — it stays, but isn't offered for new products" : "Switch back on"}
                        aria-pressed={on}
                        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-success" : "bg-ink-300")}
                      >
                        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} />
                      </button>
                      <button onClick={() => { setEditing(c); setEditVal(c); }} aria-label={`Rename ${c}`} className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5 hover:text-gold-600"><Pencil className="h-3.5 w-3.5" /></button>
                      <button
                        onClick={() => s.count === 0 && setConfirmDel(c)}
                        disabled={s.count > 0}
                        aria-label={`Delete ${c}`}
                        title={s.count > 0 ? "Move its products out first" : "Delete"}
                        className={cn("grid h-8 w-8 place-items-center rounded-lg", s.count > 0 ? "cursor-not-allowed text-ink-200" : "text-danger hover:bg-danger/10")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* figures */}
              <div className="grid grid-cols-3 divide-x divide-ink-100 border-b border-ink-100">
                {[
                  { label: "Products", value: String(s.count) },
                  { label: "Units", value: String(s.units) },
                  { label: "Value", value: formatINR(s.value) },
                ].map((f) => (
                  <div key={f.label} className="px-2 py-3 text-center">
                    <p className="truncate text-sm font-bold tabular-nums text-ink-900" title={f.value}>{f.value}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">{f.label}</p>
                  </div>
                ))}
              </div>

              {/* products */}
              <div className="px-4 py-3">
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-ink-400">Products in this category</p>
                {list.length === 0 ? (
                  <p className="flex items-center gap-2 py-2 text-xs italic text-ink-400"><Boxes className="h-3.5 w-3.5" /> No products yet.</p>
                ) : (
                  <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1 text-xs">
                    {list.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-ink-700">
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", p.active ? "bg-success" : "bg-ink-300")} />
                          <span className="truncate" title={p.name}>{p.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-ink-500">{productStock(p)} <span className="text-ink-300">·</span> {formatINR(p.basePrice)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-ink-200 bg-ivory-50 px-4 py-14 text-center text-sm text-ink-400">
            <Tags className="mx-auto mb-2 h-6 w-6 text-ink-300" />
            {categories.length === 0 ? "No categories yet — add the first one above." : "Nothing matches these filters."}
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4 backdrop-blur-sm" onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink-900">Delete this category?</h3>
            <p className="mt-2 text-sm text-ink-500">&ldquo;{confirmDel}&rdquo; has no products in it, so nothing else changes. To keep it but stop offering it, switch it off instead.</p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
              <button onClick={() => { deleteCategory(confirmDel); setConfirmDel(null); }} className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
