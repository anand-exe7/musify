"use client";
import { useMemo, useState } from "react";
import { usePOS, productStock } from "@/lib/store/pos";
import { formatINR, cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, Check, X, Tags } from "lucide-react";

export default function CategoriesPage() {
  const categories = usePOS((s) => s.categories);
  const invProducts = usePOS((s) => s.invProducts);
  const addCategory = usePOS((s) => s.addCategory);
  const renameCategory = usePOS((s) => s.renameCategory);
  const deleteCategory = usePOS((s) => s.deleteCategory);

  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

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

  const add = () => { const v = newCat.trim(); if (v) { addCategory(v); setNewCat(""); } };
  const saveRename = (from: string) => { const to = editVal.trim(); if (to && to !== from) renameCategory(from, to); setEditing(null); };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Categories</h1>
        <p className="mt-1 text-sm text-ink-500">Group your catalog · renaming updates every product in the group</p>
      </div>

      <div className="mb-6 flex max-w-md gap-2">
        <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New category name…" className="w-full rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none" />
        <button onClick={add} className="flex shrink-0 items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800"><Plus className="h-4 w-4" /> Add</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => {
          const s = stats.get(c) ?? { count: 0, units: 0, value: 0 };
          const isEditing = editing === c;
          return (
            <div key={c} className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
              <div className="mb-4 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold-100 text-gold-600"><Tags className="h-4 w-4" /></div>
                  {isEditing ? (
                    <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveRename(c)} className="w-32 rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1 text-sm font-semibold focus:border-gold-500 focus:outline-none" />
                  ) : (
                    <p className="font-bold text-ink-900">{c}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {isEditing ? (
                    <>
                      <button onClick={() => saveRename(c)} className="grid h-7 w-7 place-items-center rounded text-success hover:bg-success/10"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setEditing(null)} className="grid h-7 w-7 place-items-center rounded text-ink-400 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditing(c); setEditVal(c); }} className="grid h-7 w-7 place-items-center rounded text-ink-500 hover:bg-ink-900/5 hover:text-gold-600"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => s.count === 0 && deleteCategory(c)} disabled={s.count > 0} title={s.count > 0 ? "Move products out first" : "Delete"} className={cn("grid h-7 w-7 place-items-center rounded", s.count > 0 ? "cursor-not-allowed text-ink-200" : "text-danger hover:bg-danger/10")}><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-ink-100 pt-4 text-center">
                <div><p className="text-lg font-bold tabular-nums text-ink-900">{s.count}</p><p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Products</p></div>
                <div><p className="text-lg font-bold tabular-nums text-ink-900">{s.units}</p><p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Units</p></div>
                <div><p className="text-sm font-bold tabular-nums text-ink-900">{formatINR(s.value)}</p><p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Value</p></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
