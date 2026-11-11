"use client";
import { useMemo, useState } from "react";
import { X, Plus, Check, Pencil } from "lucide-react";
import { useExpenses, EXPENSE_CATEGORIES, PAYMENT_MODES } from "@/lib/store/expenses";
import { useSettings } from "@/lib/store/settings";
import { PAY_MODE_LABEL } from "@/lib/billing/repairPayments";
import { cn } from "@/lib/utils";

/** Every category in play: the managed list, the presets and anything already used on an expense. */
export function useExpenseCategoryList() {
  const managed = useSettings((s) => s.expenseCategories);
  const expenses = useExpenses((s) => s.expenses);
  return useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of EXPENSE_CATEGORIES) m.set(c, true);
    for (const e of expenses) if (!m.has(e.category)) m.set(e.category, true);
    for (const c of managed ?? []) m.set(c.name, c.active);
    return [...m.entries()].map(([name, active]) => ({ name, active })).sort((a, b) => a.name.localeCompare(b.name));
  }, [managed, expenses]);
}

/**
 * EXP-04: create, rename and enable / disable expense categories.
 * EXP-01: choose which payment modes' linked expenses are subtracted in analytics.
 */
export function ExpenseCategoriesModal({ onClose }: { onClose: () => void }) {
  const list = useExpenseCategoryList();
  const renameCategory = useExpenses((s) => s.renameCategory);
  const setSettings = useSettings((s) => s.set);
  const deductModes = useSettings((s) => s.expenseDeductModes);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = (next: { name: string; active: boolean }[]) => setSettings({ expenseCategories: next.sort((a, b) => a.name.localeCompare(b.name)) });

  const add = () => {
    const name = newName.trim();
    if (!name || list.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    save([...list, { name, active: true }]);
    setNewName("");
  };
  const toggle = (name: string) => save(list.map((c) => (c.name === name ? { ...c, active: !c.active } : c)));
  const rename = async () => {
    if (!editing) return;
    const to = editing.to.trim();
    if (!to || to === editing.from) return setEditing(null);
    setBusy(true);
    const ok = await renameCategory(editing.from, to);
    setBusy(false);
    if (ok) {
      // the server already moved the managed entry; mirror it locally
      save([...list.filter((c) => c.name !== editing.from && c.name !== to), { name: to, active: list.find((c) => c.name === editing.from)?.active ?? true }]);
      setEditing(null);
    }
  };
  const toggleMode = (m: string) => {
    const next = deductModes.includes(m) ? deductModes.filter((x) => x !== m) : [...deductModes, m];
    setSettings({ expenseDeductModes: next });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain bg-ink-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-auto w-full max-w-lg rounded-2xl bg-ivory-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-ink-100 p-5">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-ink-900">Expense settings</h3>
            <p className="text-sm text-ink-500">Categories, and what is subtracted in analytics.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">Categories</p>
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New category name" className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
            <button onClick={add} disabled={!newName.trim()} className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-2 text-xs font-bold uppercase tracking-wider text-ivory-50 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add</button>
          </div>
          <ul className="mt-3 max-h-72 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-100 bg-white">
            {list.map((c) => (
              <li key={c.name} className="flex items-center gap-2 px-3 py-2">
                {editing?.from === c.name ? (
                  <>
                    <input autoFocus value={editing.to} onChange={(e) => setEditing({ ...editing, to: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void rename()} className="w-full rounded-md border border-gold-500 px-2 py-1 text-sm focus:outline-none" />
                    <button onClick={() => void rename()} disabled={busy} aria-label="Save name" className="grid h-7 w-7 place-items-center rounded-md bg-success/15 text-success"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setEditing(null)} aria-label="Cancel" className="grid h-7 w-7 place-items-center rounded-md text-ink-400 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
                  </>
                ) : (
                  <>
                    <span className={cn("flex-1 text-sm", c.active ? "text-ink-900" : "text-ink-400 line-through")}>{c.name}</span>
                    <button onClick={() => setEditing({ from: c.name, to: c.name })} aria-label={`Rename ${c.name}`} className="grid h-7 w-7 place-items-center rounded-md text-ink-500 hover:bg-ink-900/5"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => toggle(c.name)} className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", c.active ? "bg-success/15 text-success" : "bg-ink-100 text-ink-500")}>
                      {c.active ? "Enabled" : "Disabled"}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-400">Renaming moves every expense filed under the old name. A disabled category is hidden when adding new expenses; old entries keep it.</p>

          <p className="mb-2 mt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">Subtract in analytics — by payment mode</p>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_MODES.map((m) => {
              const on = deductModes.includes(m);
              return (
                <button key={m} onClick={() => toggleMode(m)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold ring-1", on ? "bg-ink-900 text-ivory-50 ring-ink-900" : "bg-white text-ink-500 ring-ink-200")}>
                  {on ? "✓ " : ""}{PAY_MODE_LABEL[m] ?? m}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-ink-400">Only expenses and vendor bills marked &ldquo;Subtract in analytics&rdquo; and paid by a selected mode are deducted on the Analytics page.</p>
        </div>
      </div>
    </div>
  );
}
