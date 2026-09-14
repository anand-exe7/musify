"use client";
import { useEffect, useMemo, useState } from "react";
import { Wallet, Plus, Trash2, TrendingUp, TrendingDown, Receipt, Tag, Search } from "lucide-react";
import {
  useExpenses,
  EXPENSE_CATEGORIES,
  PAYMENT_MODES,
  type Expense,
  type PaymentMode,
} from "@/lib/store/expenses";
import { inPeriod, type Period } from "@/lib/store/pos";
import { useBranchScope } from "@/lib/store/branch";
import type { Invoice } from "@/types";
import { formatINR, cn } from "@/lib/utils";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
];

type Sort = "date-desc" | "date-asc" | "amount-desc" | "amount-asc" | "title-asc" | "title-desc" | "category" | "payment";
const SORTS: { value: Sort; label: string }[] = [
  { value: "date-desc", label: "Date · Newest" },
  { value: "date-asc", label: "Date · Oldest" },
  { value: "amount-desc", label: "Amount · High" },
  { value: "amount-asc", label: "Amount · Low" },
  { value: "title-asc", label: "Title · A–Z" },
  { value: "title-desc", label: "Title · Z–A" },
  { value: "category", label: "Category · A–Z" },
  { value: "payment", label: "Payment · A–Z" },
];

const PAY_TONE: Record<PaymentMode, string> = {
  CASH: "bg-success/15 text-success",
  UPI: "bg-info/15 text-info",
  CARD: "bg-gold-100 text-gold-700",
  BANK: "bg-ink-900/10 text-ink-700",
  OTHER: "bg-ink-100 text-ink-500",
};

const today = () => new Date().toISOString().slice(0, 10);
const blankForm = () => ({ title: "", amount: "" as number | "", category: "", date: today(), paymentMode: "CASH" as PaymentMode, notes: "" });

export default function ExpensesPage() {
  const expensesAll = useExpenses((s) => s.expenses);
  const hydrate = useExpenses((s) => s.hydrate);
  const addExpense = useExpenses((s) => s.addExpense);
  const deleteExpense = useExpenses((s) => s.deleteExpense);

  const scopeSelected = useBranchScope((s) => s.selected);

  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("date-desc");
  const [form, setForm] = useState(blankForm());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
    (async () => {
      try {
        const res = await fetch("/api/invoices", { cache: "no-store" });
        if (res.ok) setInvoices((await res.json()) as Invoice[]);
      } catch {
        /* revenue card just shows 0 */
      }
    })();
  }, [hydrate]);

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const inScope = (branch: string) => scopeSelected === "all" || branch === scopeSelected;
  const inSelectedPeriod = (d: string) => inPeriod(d, period, new Date(), custom);

  // Period + branch scoped — drives KPIs, bars and the net-profit card.
  const periodExpenses = useMemo(
    () => expensesAll.filter((e) => inScope(e.branch) && inSelectedPeriod(e.expenseDate)),
    [expensesAll, scopeSelected, period, custom],
  );

  const totalExpenses = periodExpenses.reduce((n, e) => n + e.amount, 0);

  // Revenue from the sales/tax ledger, split GST vs non-GST.
  const { gstRevenue, nonGstRevenue } = useMemo(() => {
    let gst = 0;
    let non = 0;
    for (const inv of invoices) {
      if (inv.status === "cancelled") continue;
      if (!inScope(inv.branch) || !inSelectedPeriod(inv.date)) continue;
      const taxed = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0) > 0;
      if (taxed) gst += inv.total;
      else non += inv.total;
    }
    return { gstRevenue: gst, nonGstRevenue: non };
  }, [invoices, scopeSelected, period, custom]);

  const revenue = gstRevenue + nonGstRevenue;
  const netProfit = revenue - totalExpenses;

  // Category breakdown.
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of periodExpenses) m[e.category] = (m[e.category] || 0) + e.amount;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [periodExpenses]);
  const topCategory = byCategory[0]?.[0] ?? "—";

  // Ledger — period + search + category filter, sorted.
  const ledger = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = periodExpenses.filter((e) => {
      if (catFilter !== "all" && e.category !== catFilter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.notes ?? "").toLowerCase().includes(q)
      );
    });
    const cmp: Record<Sort, (a: Expense, b: Expense) => number> = {
      "date-desc": (a, b) => b.expenseDate.localeCompare(a.expenseDate),
      "date-asc": (a, b) => a.expenseDate.localeCompare(b.expenseDate),
      "amount-desc": (a, b) => b.amount - a.amount,
      "amount-asc": (a, b) => a.amount - b.amount,
      "title-asc": (a, b) => a.title.localeCompare(b.title),
      "title-desc": (a, b) => b.title.localeCompare(a.title),
      category: (a, b) => a.category.localeCompare(b.category),
      payment: (a, b) => a.paymentMode.localeCompare(b.paymentMode),
    };
    return [...list].sort(cmp[sort]);
  }, [periodExpenses, search, catFilter, sort]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(EXPENSE_CATEGORIES);
    for (const e of expensesAll) set.add(e.category);
    return [...set].sort();
  }, [expensesAll]);

  const submit = async () => {
    if (!form.title.trim()) return notify("Enter what the expense is for.");
    const amount = Number(form.amount) || 0;
    if (amount <= 0) return notify("Enter an amount greater than 0.");
    const expense: Expense = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      category: form.category.trim() || "Miscellaneous",
      amount,
      paymentMode: form.paymentMode,
      notes: form.notes.trim() || null,
      expenseDate: form.date || today(),
      createdAt: new Date().toISOString(),
      branch: scopeSelected === "all" ? "Branch 1" : scopeSelected,
    };
    const okSave = await addExpense(expense);
    if (!okSave) return notify("Couldn't save the expense.");
    setForm(blankForm());
    notify(`Added ${expense.title} · ${formatINR(expense.amount)}`);
  };

  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="p-5 md:p-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>
      )}

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="border-l-4 border-ink-900 pl-4">
          <h1 className="text-2xl font-bold text-ink-900">Expense Tracker</h1>
          <p className="mt-1 text-sm text-ink-500">Outgoings &amp; true net profit{scopeSelected !== "all" ? ` · ${scopeSelected}` : ""}</p>
        </div>
        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)} className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all", period === p.value ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900")}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {period === "custom" && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-ink-100 bg-ivory-50 p-3 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">From</span>
          <input type="date" value={custom.from ?? ""} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">To</span>
          <input type="date" value={custom.to ?? ""} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
        </div>
      )}

      {/* Net profit + KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cn("rounded-2xl border p-5", netProfit >= 0 ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5")}>
          <div className="flex items-center gap-2">
            {netProfit >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-danger" />}
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">Net Profit</p>
          </div>
          <p className={cn("mt-2 text-2xl font-bold tabular-nums", netProfit >= 0 ? "text-success" : "text-danger")}>{netProfit < 0 ? "-" : ""}{formatINR(Math.abs(netProfit))}</p>
          <p className="mt-1 text-[11px] text-ink-400">Revenue {formatINR(revenue)} − Expenses {formatINR(totalExpenses)}</p>
        </div>
        <KPI icon={<Wallet className="h-4 w-4 text-gold-600" />} label="Total Expenses" value={formatINR(totalExpenses)} />
        <KPI icon={<Receipt className="h-4 w-4 text-gold-600" />} label="Entries" value={String(periodExpenses.length)} />
        <KPI icon={<Tag className="h-4 w-4 text-gold-600" />} label="Top Category" value={topCategory} small />
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Add + breakdown */}
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2"><Plus className="h-4 w-4 text-gold-600" /><h2 className="text-sm font-bold uppercase tracking-wider text-ink-900">Add Expense</h2></div>
            <div className="space-y-4">
              <div><label className={label}>What for?</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. October Shop Rent" className={field} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Amount (₹)</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value === "" ? "" : Number(e.target.value) })} className={field} /></div>
                <div><label className={label}>Date</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={field} /></div>
              </div>
              <div>
                <label className={label}>Category</label>
                <input list="expense-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Pick or type a custom one" className={field} />
                <datalist id="expense-cats">{categoryOptions.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className={label}>Paid via</label>
                <select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value as PaymentMode })} className={field}>
                  {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div><label className={label}>Notes (optional)</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Supplier, bill no…" className={field} /></div>
              <button onClick={submit} className="w-full rounded-xl bg-ink-900 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-ink-800">Add Expense</button>
            </div>
          </section>

          {byCategory.length > 0 && (
            <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-900">By Category</h2>
              <div className="space-y-3">
                {byCategory.map(([cat, amt]) => {
                  const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
                  return (
                    <div key={cat}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-ink-700">{cat}</span>
                        <span className="tabular-nums text-ink-500">{formatINR(amt)} · {pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Ledger */}
        <section>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 focus-within:border-gold-500">
              <Search className="h-4 w-4 shrink-0 text-ink-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, notes, category…" className="w-full bg-transparent text-sm focus:outline-none" />
            </div>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none">
              <option value="all">All categories</option>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-4 py-3">Date</th><th>Title</th><th>Category</th><th>Paid</th><th className="pr-4 text-right">Amount</th><th className="pr-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {ledger.map((e) => (
                  <tr key={e.id} className="align-top text-ink-700">
                    <td className="px-4 py-3 text-xs text-ink-500 tabular-nums">{e.expenseDate}</td>
                    <td><p className="font-medium text-ink-900">{e.title}</p>{e.notes && <p className="text-[11px] text-ink-400">{e.notes}</p>}</td>
                    <td><span className="inline-block rounded bg-ink-900/5 px-2 py-0.5 text-[11px] font-medium text-ink-600">{e.category}</span></td>
                    <td><span className={cn("inline-block rounded px-2 py-0.5 text-[10px] font-bold", PAY_TONE[e.paymentMode] ?? PAY_TONE.OTHER)}>{e.paymentMode}</span></td>
                    <td className="pr-4 text-right font-semibold tabular-nums text-danger">− {formatINR(e.amount)}</td>
                    <td className="pr-4 text-right">
                      <button
                        onClick={() => { if (confirm(`Delete "${e.title}" (${formatINR(e.amount)})?`)) void deleteExpense(e.id); }}
                        aria-label="Delete expense"
                        className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {ledger.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-400">No expenses in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function KPI({ icon, label, value, small }: { icon: React.ReactNode; label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
      <div className="flex items-center gap-2">{icon}<p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">{label}</p></div>
      <p className={cn("mt-2 font-bold tabular-nums text-ink-900", small ? "text-lg" : "text-2xl")}>{value}</p>
    </div>
  );
}
