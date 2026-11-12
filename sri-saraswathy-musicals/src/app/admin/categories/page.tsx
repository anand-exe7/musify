"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePOS, useInventory, productStock, type InvProduct } from "@/lib/store/pos";
import { fetchJson, errMsg } from "@/lib/client/api";
import { formatINR, cn } from "@/lib/utils";
import { AdminStat, type StatDetail } from "@/components/admin/AdminStat";
import { GroupDetailModal } from "@/components/admin/GroupDetailModal";
import { LoadingInline } from "@/components/admin/LoadState";
import { Plus, Pencil, Trash2, Check, X, Tags, Search, Boxes, Layers, Maximize2 } from "lucide-react";

// Opened only when a product inside a group is edited.
const ProductModal = dynamic(() => import("@/components/admin/ProductModal").then((m) => m.ProductModal), { ssr: false });

type Show = "all" | "on" | "off";
type Kind = "category" | "department";

/** Rupees without the trailing ".00" — a stock value has to fit its box without being cut off. */
const money = (paise: number) => formatINR(paise).replace(/\.00$/, "");

/**
 * INV-01 / INV-02: the one screen where the catalogue's groups are managed — categories, and the departments
 * above them. Creating, renaming, switching off and deleting work the same way for both. Switching a group off
 * keeps its products exactly as they are; it is simply no longer offered when filing a new product.
 */
export default function CategoriesPage() {
  const categories = usePOS((s) => s.categories);
  const categoryActive = usePOS((s) => s.categoryActive);
  const departments = usePOS((s) => s.departments);
  const departmentActive = usePOS((s) => s.departmentActive);
  const invProducts = useInventory();

  const addCategory = usePOS((s) => s.addCategory);
  const renameCategory = usePOS((s) => s.renameCategory);
  const deleteCategory = usePOS((s) => s.deleteCategory);
  const setCategoryActive = usePOS((s) => s.setCategoryActive);
  const addDepartment = usePOS((s) => s.addDepartment);
  const renameDepartment = usePOS((s) => s.renameDepartment);
  const deleteDepartment = usePOS((s) => s.deleteDepartment);
  const setDepartmentActive = usePOS((s) => s.setDepartmentActive);

  const [kind, setKind] = useState<Kind>("category");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null); // the group whose window is open
  const [editProd, setEditProd] = useState<InvProduct | null>(null);
  const [backTo, setBackTo] = useState<string | null>(null); // the group window to reopen after editing
  const [opening, setOpening] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // One set of handlers, whichever kind is on screen.
  const isCat = kind === "category";
  const names = isCat ? categories : departments;
  const activeMap = isCat ? categoryActive : departmentActive;
  const add = (n: string) => (isCat ? addCategory(n) : addDepartment(n));
  const rename = (from: string, to: string) => (isCat ? renameCategory(from, to) : renameDepartment(from, to));
  const remove = (n: string) => (isCat ? deleteCategory(n) : deleteDepartment(n));
  const setActive = (n: string, a: boolean) => (isCat ? setCategoryActive(n, a) : setDepartmentActive(n, a));
  const groupOf = (p: InvProduct) => (isCat ? p.category : p.department);
  const noun = isCat ? "category" : "department";

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; units: number; value: number }>();
    names.forEach((n) => map.set(n, { count: 0, units: 0, value: 0 }));
    invProducts.forEach((p) => {
      const key = groupOf(p);
      const s = map.get(key) ?? { count: 0, units: 0, value: 0 };
      const units = productStock(p);
      map.set(key, { count: s.count + 1, units: s.units + units, value: s.value + units * p.basePrice });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, invProducts, kind]);

  const productsByGroup = useMemo(() => {
    const map = new Map<string, InvProduct[]>();
    names.forEach((n) => map.set(n, []));
    invProducts.forEach((p) => {
      const key = groupOf(p);
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    });
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, invProducts, kind]);

  const isOn = (n: string) => activeMap[n] !== false;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .filter((n) => (show === "all" ? true : show === "on" ? isOn(n) : !isOn(n)))
      .filter((n) => !q || n.toLowerCase().includes(q) || (productsByGroup.get(n) ?? []).some((p) => p.name.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, activeMap, query, show, productsByGroup]);

  const totals = useMemo(() => {
    let units = 0, value = 0;
    for (const n of names) {
      const s = stats.get(n);
      if (s) { units += s.units; value += s.value; }
    }
    return { units, value, off: names.filter((n) => !isOn(n)).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, stats, activeMap]);

  /** Open one product from inside a group window, in the same editor the Inventory screen uses. */
  const editProduct = async (prod: InvProduct) => {
    setOpening(prod.name);
    // The group window steps aside while the editor is open, and comes back when it closes.
    const from = detail;
    setDetail(null);
    try {
      setEditProd(await fetchJson<InvProduct>(`/api/pos/inventory/${prod.id}`));
      setBackTo(from);
    } catch (e) {
      setNotice(`Couldn't open ${prod.name} (${errMsg(e)})`);
      setDetail(from);
    } finally {
      setOpening(null);
    }
  };

  const byName = useMemo(() => [...names].sort((a, b) => a.localeCompare(b)), [names]);

  const submitNew = () => { const v = newName.trim(); if (v) { add(v); setNewName(""); } };
  const saveRename = (from: string) => { const to = editVal.trim(); if (to && to !== from) rename(from, to); setEditing(null); };
  const switchKind = (k: Kind) => { setKind(k); setEditing(null); setQuery(""); setShow("all"); setNewName(""); };

  const chip = (active: boolean) => cn("h-8 rounded-lg px-3 text-xs font-semibold transition-colors", active ? "bg-ink-900 text-ivory-50" : "text-ink-600 hover:text-ink-900");

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="border-l-4 border-ink-900 pl-4">
          <h1 className="text-2xl font-bold text-ink-900">Categories &amp; departments</h1>
          <p className="mt-1 text-sm text-ink-500">
            A department groups categories — a product is filed as department → category. Renaming one moves every product in it.
          </p>
        </div>
        <div className="flex h-10 w-full max-w-md gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNew()}
            placeholder={`New ${noun} name…`}
            className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm focus:border-gold-500 focus:outline-none"
          />
          <button onClick={submitNew} disabled={!newName.trim()} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-ivory-50 hover:bg-ink-800 disabled:opacity-40">
            <Plus className="h-4 w-4" /> Add {noun}
          </button>
        </div>
      </div>

      {/* Which list */}
      <div className="mb-5 flex w-fit items-center gap-1 rounded-xl bg-ink-900/[0.04] p-1">
        <button onClick={() => switchKind("category")} className={cn("inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors", isCat ? "bg-ink-900 text-ivory-50" : "text-ink-600 hover:text-ink-900")}>
          <Tags className="h-4 w-4" /> Categories <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", isCat ? "bg-ivory-50/20" : "bg-ink-900/10")}>{categories.length}</span>
        </button>
        <button onClick={() => switchKind("department")} className={cn("inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors", !isCat ? "bg-ink-900 text-ivory-50" : "text-ink-600 hover:text-ink-900")}>
          <Layers className="h-4 w-4" /> Departments <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", !isCat ? "bg-ivory-50/20" : "bg-ink-900/10")}>{departments.length}</span>
        </button>
      </div>

      {/* Summary — every box opens with the lines it is made of. */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AdminStat
          label={isCat ? "Categories" : "Departments"}
          value={String(names.length)}
          hint="Tap for the full list"
          accent="ink"
          details={byName.map((n) => ({ label: n, value: `${stats.get(n)?.count ?? 0} product${(stats.get(n)?.count ?? 0) === 1 ? "" : "s"}`, tone: isOn(n) ? undefined : "muted" }))}
          note={`A ${noun} with a grey figure is switched off — its products are untouched, it is simply not offered for new ones.`}
        />
        <AdminStat
          label="Switched on"
          value={`${names.length - totals.off}`}
          hint={totals.off > 0 ? `${totals.off} switched off` : "All of them"}
          accent="green"
          details={byName.map((n) => ({ label: n, value: isOn(n) ? "On" : "Off", tone: isOn(n) ? "plus" : "muted" }))}
        />
        <AdminStat
          label="Units in stock"
          value={String(totals.units)}
          hint="Across every branch"
          accent="gold"
          details={[
            ...byName.filter((n) => (stats.get(n)?.units ?? 0) > 0).map((n) => ({ label: n, value: String(stats.get(n)?.units ?? 0) })),
            { label: "Total", value: String(totals.units), tone: "total" as const },
          ]}
        />
        <AdminStat
          label="Stock value"
          value={money(totals.value)}
          hint="Units × base price"
          accent="violet"
          details={[
            ...byName.filter((n) => (stats.get(n)?.value ?? 0) > 0).map((n) => ({ label: n, value: money(stats.get(n)?.value ?? 0) })),
            { label: "Total", value: money(totals.value), tone: "total" as const },
          ]}
        />
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search a ${noun} or product…`} className="w-full bg-transparent text-sm focus:outline-none" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search" className="text-ink-400 hover:text-ink-700"><X className="h-3.5 w-3.5" /></button>}
        </div>
      </div>

      {/* Cards */}
      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((n) => {
          const s = stats.get(n) ?? { count: 0, units: 0, value: 0 };
          const list = productsByGroup.get(n) ?? [];
          const isEditing = editing === n;
          const on = isOn(n);
          return (
            <div key={n} className={cn("flex flex-col rounded-2xl border bg-ivory-50", on ? "border-ink-100" : "border-dashed border-ink-200")}>
              {/* name + actions */}
              <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
                <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", on ? "bg-gold-100 text-gold-600" : "bg-ink-100 text-ink-400")}>
                  {isCat ? <Tags className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                </div>
                {isEditing ? (
                  <input
                    autoFocus
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveRename(n); if (e.key === "Escape") setEditing(null); }}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2 text-sm font-semibold focus:border-gold-500 focus:outline-none"
                  />
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-bold", on ? "text-ink-900" : "text-ink-500")} title={n}>{n}</p>
                    {!on && <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Switched off</p>}
                  </div>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  {isEditing ? (
                    <>
                      <button onClick={() => saveRename(n)} aria-label="Save name" className="grid h-8 w-8 place-items-center rounded-lg text-success hover:bg-success/10"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setEditing(null)} aria-label="Cancel" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setActive(n, !on)}
                        title={on ? `Switch off — it stays, but isn't offered for new products` : "Switch back on"}
                        aria-pressed={on}
                        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-success" : "bg-ink-300")}
                      >
                        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} />
                      </button>
                      <button onClick={() => setDetail(n)} aria-label={`Open ${n}`} title="Open and see everything" className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5 hover:text-gold-600"><Maximize2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { setEditing(n); setEditVal(n); }} aria-label={`Rename ${n}`} className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5 hover:text-gold-600"><Pencil className="h-3.5 w-3.5" /></button>
                      <button
                        onClick={() => s.count === 0 && setConfirmDel(n)}
                        disabled={s.count > 0}
                        aria-label={`Delete ${n}`}
                        title={s.count > 0 ? "Move its products out first" : "Delete"}
                        className={cn("grid h-8 w-8 place-items-center rounded-lg", s.count > 0 ? "cursor-not-allowed text-ink-200" : "text-danger hover:bg-danger/10")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* figures — counts side by side, the money on its own line so it is never cut off.
                  The whole block opens the group window, where every figure is shown in full. */}
              <button onClick={() => setDetail(n)} className="group/fig text-left transition-colors hover:bg-ink-900/[0.02]" title={`Open ${n}`}>
                <div className="grid grid-cols-2 divide-x divide-ink-100 border-b border-ink-100">
                  <div className="px-3 py-3 text-center">
                    <p className="text-lg font-bold tabular-nums text-ink-900">{s.count}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Products</p>
                  </div>
                  <div className="px-3 py-3 text-center">
                    <p className="text-lg font-bold tabular-nums text-ink-900">{s.units}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Units</p>
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 px-4 py-2.5">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Stock value</p>
                  <p className="whitespace-nowrap text-base font-bold tabular-nums text-ink-900">{money(s.value)}</p>
                </div>
              </button>

              {/* products */}
              <div className="px-4 py-3">
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-ink-400">Products in this {noun}</p>
                {list.length === 0 ? (
                  <p className="flex items-center gap-2 py-2 text-xs italic text-ink-400"><Boxes className="h-3.5 w-3.5" /> No products yet.</p>
                ) : (
                  <ul className="max-h-44 space-y-0.5 overflow-y-auto pr-1 text-xs">
                    {list.slice(0, 6).map((p) => (
                      <li key={p.id}>
                        <button onClick={() => setDetail(n)} className="flex w-full items-baseline justify-between gap-3 rounded-lg px-1 py-1 text-left hover:bg-ink-900/[0.04]">
                          <span className="flex min-w-0 items-baseline gap-1.5 text-ink-700">
                            <span className={cn("h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full", p.active ? "bg-success" : "bg-ink-300")} />
                            <span className="truncate" title={p.name}>{p.name}</span>
                          </span>
                          <span className="shrink-0 whitespace-nowrap tabular-nums text-ink-500">{productStock(p)} <span className="text-ink-300">·</span> {money(p.basePrice)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button onClick={() => setDetail(n)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white py-2 text-[11px] font-bold uppercase tracking-wider text-ink-600 hover:border-gold-500 hover:text-gold-600">
                  <Maximize2 className="h-3.5 w-3.5" />
                  {list.length > 6 ? `Open · ${list.length} products` : "Open and see everything"}
                </button>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-ink-200 bg-ivory-50 px-4 py-14 text-center text-sm text-ink-400">
            {isCat ? <Tags className="mx-auto mb-2 h-6 w-6 text-ink-300" /> : <Layers className="mx-auto mb-2 h-6 w-6 text-ink-300" />}
            {names.length === 0 ? `No ${noun === "category" ? "categories" : "departments"} yet — add the first one above.` : "Nothing matches these filters."}
          </div>
        )}
      </div>

      {/* Everything inside one group */}
      {detail && (
        <GroupDetailModal
          kind={kind}
          name={detail}
          products={productsByGroup.get(detail) ?? []}
          active={isOn(detail)}
          onToggle={() => setActive(detail, !isOn(detail))}
          onEditProduct={(prod) => void editProduct(prod)}
          onClose={() => setDetail(null)}
        />
      )}
      {opening && (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-ink-950/40 backdrop-blur-sm">
          <div className="rounded-2xl bg-ivory-50 px-6 py-5 shadow-2xl"><LoadingInline label={`Opening ${opening}…`} /></div>
        </div>
      )}
      {editProd && (
        <ProductModal
          product={editProd}
          onClose={() => { setEditProd(null); setDetail(backTo); setBackTo(null); }}
        />
      )}
      {notice && (
        <div className="fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink-900 px-5 py-3 text-sm text-ivory-50 shadow-lg">
          {notice}
          <button onClick={() => setNotice(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4 backdrop-blur-sm" onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink-900">Delete this {noun}?</h3>
            <p className="mt-2 text-sm text-ink-500">&ldquo;{confirmDel}&rdquo; has no products in it, so nothing else changes. To keep it but stop offering it, switch it off instead.</p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
              <button onClick={() => { remove(confirmDel); setConfirmDel(null); }} className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
