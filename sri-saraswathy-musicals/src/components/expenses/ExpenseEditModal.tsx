"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { useExpenses, PAYMENT_MODES, type Expense, type PaymentMode } from "@/lib/store/expenses";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useExpenseCategoryList } from "@/components/expenses/ExpenseCategoriesModal";
import { PAY_MODE_LABEL } from "@/lib/billing/repairPayments";

/** EXP-03: edit an existing expense (all fields, including "Subtract in analytics"). */
export function ExpenseEditModal({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const updateExpense = useExpenses((s) => s.updateExpense);
  const cats = useExpenseCategoryList();
  const [d, setD] = useState({ ...expense, notes: expense.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = "w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  const save = async () => {
    if (!d.title.trim()) return setErr("Enter what the expense is for.");
    if (!(d.amount > 0)) return setErr("Enter an amount greater than 0.");
    setBusy(true);
    const ok = await updateExpense(expense.id, {
      title: d.title.trim(),
      amount: d.amount,
      category: d.category.trim() || "Miscellaneous",
      paymentMode: d.paymentMode,
      expenseDate: d.expenseDate,
      notes: d.notes.trim() || null,
      inAnalytics: !!d.inAnalytics,
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain bg-ink-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-auto w-full max-w-md rounded-2xl bg-ivory-50 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-bold text-ink-900">Edit expense</h3>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div><label className={label}>What for?</label><input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} className={field} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Amount (₹)</label><MoneyInput value={d.amount} onChange={(paise) => setD({ ...d, amount: paise })} className={field} /></div>
            <div><label className={label}>Date</label><input type="date" value={d.expenseDate} onChange={(e) => setD({ ...d, expenseDate: e.target.value })} className={field} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Category</label>
              <input list="expense-edit-cats" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} className={field} />
              <datalist id="expense-edit-cats">{cats.filter((c) => c.active).map((c) => <option key={c.name} value={c.name} />)}</datalist>
            </div>
            <div>
              <label className={label}>Paid via</label>
              <select value={d.paymentMode} onChange={(e) => setD({ ...d, paymentMode: e.target.value as PaymentMode })} className={field}>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAY_MODE_LABEL[m] ?? m}</option>)}
              </select>
            </div>
          </div>
          <div><label className={label}>Notes</label><input value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} className={field} /></div>
          <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm text-ink-800 ring-1 ring-ink-100">
            <input type="checkbox" checked={!!d.inAnalytics} onChange={(e) => setD({ ...d, inAnalytics: e.target.checked })} className="h-4 w-4 accent-ink-900" />
            Subtract in analytics (net sales)
          </label>
          {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
            <button onClick={() => void save()} disabled={busy} className="flex-1 rounded-xl bg-ink-900 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800 disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
