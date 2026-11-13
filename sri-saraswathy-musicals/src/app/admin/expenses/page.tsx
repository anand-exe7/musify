"use client";
import { useEffect, useMemo, useState } from "react";
import { Wallet, Plus, Trash2, TrendingUp, TrendingDown, Receipt, Tag, Search, Pencil, Settings2, BarChart3, X, Loader2 } from "lucide-react";
import { AdminStat } from "@/components/admin/AdminStat";
import { Segmented } from "@/components/admin/Segmented";
import { ExpenseCategoriesModal, useExpenseCategoryList } from "@/components/expenses/ExpenseCategoriesModal";
import { ExpenseEditModal } from "@/components/expenses/ExpenseEditModal";
import { PAY_MODE_LABEL } from "@/lib/billing/repairPayments";
import {
  useExpenses,
  EXPENSE_CATEGORIES,
  PAYMENT_MODES,
  type Expense,
  type PaymentMode,
} from "@/lib/store/expenses";
import { LoadErrorBanner, LoadingInline } from "@/components/admin/LoadState";
import { inPeriod, type Period } from "@/lib/store/pos";
import { useBranchScope } from "@/lib/store/branch";
import type { Invoice } from "@/types";
import { formatINR, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { ExpenseReport } from "@/components/expenses/ExpenseReport";
import { AnalyticsDeductionCard } from "@/components/expenses/AnalyticsDeductionCard";
import { useAuth } from "@/lib/store/auth";
import { DEFAULT_BRANCH, BRANCH_KEYS, branchLabel } from "@/lib/stock";

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

const PAY_TONE: Record<string, string> = {
  CASH: "bg-success/15 text-success",
  CARD: "bg-gold-100 text-gold-700",
  UPI: "bg-info/15 text-info",
  OTHER: "bg-ink-100 text-ink-500",
};

const today = () => new Date().toISOString().slice(0, 10);
const blankForm = () => ({ title: "", amount: "" as number | "", category: "", date: today(), paymentMode: "CASH" as PaymentMode, notes: "", branch: "", inAnalytics: false });

export default function ExpensesPage() {
  const expensesAll = useExpenses((s) => s.expenses);
  const loadError = useExpenses((s) => s.loadError);
  const hydrate = useExpenses((s) => s.hydrate);
  const addExpense = useExpenses((s) => s.addExpense);
  const deleteExpense = useExpenses((s) => s.deleteExpense);
  const updateExpense = useExpenses((s) => s.updateExpense);
  const categoryList = useExpenseCategoryList();
  const [catsOpen, setCatsOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const scopeSelected = useBranchScope((s) => s.selected);
  const canSwitchBranch = useBranchScope((s) => s.canSwitch);
  const allowedBranches = useBranchScope((s) => s.allowed);

  const fullAdmin = useAuth((s) => s.adminAccess === "all");
  const [tab, setTab] = useState<"tracker" | "report">("tracker");
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("date-desc");
  const [form, setForm] = useState(blankForm());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Loading states: the expense list (re-read every time the page opens) and the sales used for net profit.
  const hydrated = useExpenses((s) => s.hydrated);
  const [refreshing, setRefreshing] = useState(true);
  const [salesLoaded, setSalesLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void hydrate().finally(() => alive && setRefreshing(false));
    (async () => {
      try {
        const res = await fetch("/api/invoices", { cache: "no-store" });
        if (res.ok && alive) setInvoices((await res.json()) as Invoice[]);
      } catch {
        /* revenue card just shows 0 */
      } finally {
        if (alive) setSalesLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
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
    const list = periodExpenses.filter((e) => {
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

  // Filter list: every category; the add form only offers enabled ones (EXP-04).
  const categoryOptions = useMemo(() => {
    const set = new Set<string>(EXPENSE_CATEGORIES);
    for (const e of expensesAll) set.add(e.category);
    for (const c of categoryList) set.add(c.name);
    return [...set].sort();
  }, [expensesAll, categoryList]);
  const activeCategories = categoryList.filter((c) => c.active).map((c) => c.name);

  // Which branch a new expense is booked to: the one picked in the form, else the branch being viewed. Admins may
  // pick any branch; branch staff only their own.
  const branchChoices: string[] = canSwitchBranch ? [...BRANCH_KEYS] : allowedBranches.length > 0 ? allowedBranches : [DEFAULT_BRANCH];
  const viewed = scopeSelected !== "all" && branchChoices.includes(scopeSelected) ? scopeSelected : branchChoices[0];
  const formBranch = branchChoices.includes(form.branch) ? form.branch : viewed;

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
      branch: formBranch,
      inAnalytics: form.inAnalytics,
    };
    setSaving(true);
    const okSave = await addExpense(expense);
    setSaving(false);
    if (!okSave) return notify("Couldn't save the expense.");
    setForm(blankForm());
    setAddOpen(false);
    notify(`Added ${expense.title} · ${formatINR(expense.amount)}`);
  };

  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="p-5 md:p-8">
      <LoadErrorBanner message={loadError} onRetry={() => void useExpenses.getState().hydrate()} />
      {catsOpen && <ExpenseCategoriesModal onClose={() => setCatsOpen(false)} />}
      {editing && <ExpenseEditModal expense={editing} onClose={() => setEditing(null)} />}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>
      )}

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="border-l-4 border-ink-900 pl-4">
          <h1 className="text-2xl font-bold text-ink-900">Expense Tracker</h1>
          <p className="mt-1 text-sm text-ink-500">Outgoings &amp; true net profit{scopeSelected !== "all" ? ` · ${branchLabel(scopeSelected)}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 rounded-full bg-danger px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-danger/90">
          <Plus className="h-3.5 w-3.5" /> Add expense
        </button>
        {fullAdmin && (
          <button onClick={() => setCatsOpen(true)} className="flex items-center gap-2 rounded-full border border-ink-200 bg-ivory-50 px-4 py-2 text-xs font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600">
            <Settings2 className="h-3.5 w-3.5" /> Categories &amp; analytics
          </button>
        )}
        {/* Period filter */}
        <Segmented value={period} onChange={setPeriod} options={PERIODS.map((p) => [p.value, p.label] as const)} />
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

      {refreshing && hydrated && (
        <p className="mb-3 inline-flex items-center gap-2 text-xs text-ink-500"><Loader2 className="h-3.5 w-3.5 animate-spin text-gold-500" /> Refreshing expenses…</p>
      )}
      <div className="mb-5 flex w-fit rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
        {([["tracker", "Tracker"], ["report", "Report"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-full px-4 py-1.5 text-xs font-semibold transition-all", tab === k ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900")}>{l}</button>
        ))}
      </div>

      {tab === "report" ? (
        <ExpenseReport
          expenses={periodExpenses}
          periodLabel={period === "custom" ? `${custom.from || "start"} to ${custom.to || "today"}` : (PERIODS.find((x) => x.value === period)?.label ?? "")}
          branchName={scopeSelected === "all" ? "All branches" : branchLabel(scopeSelected)}
          revenue={fullAdmin ? revenue : null}
        />
      ) : (
      <>
      {/* Net profit + KPIs — tap a box for its details */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Net Profit" value={salesLoaded ? `${netProfit < 0 ? "-" : ""}${formatINR(Math.abs(netProfit))}` : "…"} hint={salesLoaded ? "Revenue − expenses" : "Loading sales…"} accent={netProfit >= 0 ? "green" : "danger"} icon={netProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          details={[{ label: "GST sales", value: formatINR(gstRevenue), tone: "plus" }, { label: "Non-GST sales", value: formatINR(nonGstRevenue), tone: "plus" }, { label: "Expenses", value: `− ${formatINR(totalExpenses)}`, tone: "minus" }, { label: "Net profit", value: `${netProfit < 0 ? "-" : ""}${formatINR(Math.abs(netProfit))}`, tone: "total" }]} />
        <AdminStat label="Total Expenses" value={hydrated ? formatINR(totalExpenses) : "…"} hint="This period · branch" accent="danger" icon={<Wallet className="h-4 w-4" />}
          details={byCategory.length ? [...byCategory.map(([c, v]) => ({ label: c, value: `− ${formatINR(v)}`, tone: "minus" as const })), { label: "Total", value: formatINR(totalExpenses), tone: "total" as const }] : undefined} />
        <AdminStat label="Entries" value={hydrated ? String(periodExpenses.length) : "…"} hint="Expenses recorded" accent="ink" icon={<Receipt className="h-4 w-4" />} />
        <AdminStat label="Top Category" value={hydrated ? topCategory : "…"} hint={byCategory[0] ? formatINR(byCategory[0][1]) : "—"} accent="gold" icon={<Tag className="h-4 w-4" />} />
      </div>

      {/* Add expense — a compact pop-up instead of a tall side form */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/45 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => !saving && setAddOpen(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-ivory-50 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink-900"><span className="grid h-8 w-8 place-items-center rounded-full bg-danger/10 text-danger"><Wallet className="h-4 w-4" /></span> Add expense</h2>
              <button onClick={() => setAddOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
              <div><label className={label}>What for?</label><input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. October shop rent" className={field} /></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className={label}>Amount (₹)</label><MoneyInput value={form.amount === "" ? 0 : form.amount} onChange={(paise) => setForm({ ...form, amount: paise })} className={field} /></div>
                <div><label className={label}>Date</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={field} /></div>
                <div>
                  <label className={label}>Paid via</label>
                  <select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value as PaymentMode })} className={field}>
                    {PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAY_MODE_LABEL[m] ?? m}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Category</label>
                  <input list="expense-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Pick or type one" className={field} />
                  <datalist id="expense-cats">{activeCategories.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className={label}>Branch</label>
                  <select value={formBranch} onChange={(e) => setForm({ ...form, branch: e.target.value })} disabled={branchChoices.length === 1} className={field}>
                    {branchChoices.map((b) => <option key={b} value={b}>{branchLabel(b)}</option>)}
                  </select>
                </div>
              </div>
              {activeCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {activeCategories.slice(0, 10).map((c) => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, category: c })} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", form.category === c ? "bg-ink-900 text-ivory-50" : "bg-white text-ink-600 ring-1 ring-ink-100 hover:text-ink-900")}>{c}</button>
                  ))}
                </div>
              )}
              <div><label className={label}>Notes (optional)</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Supplier, bill no…" className={field} /></div>
              {/* EXP-01: link to analytics */}
              <label className="flex items-start gap-2 rounded-lg bg-white px-3 py-2.5 text-sm text-ink-800 ring-1 ring-ink-100">
                <input type="checkbox" checked={form.inAnalytics} onChange={(e) => setForm({ ...form, inAnalytics: e.target.checked })} className="mt-0.5 h-4 w-4 accent-ink-900" />
                <span>Subtract in analytics<span className="block text-[11px] text-ink-400">Shows on Sales Analytics as a deduction from sales (net view).</span></span>
              </label>
            </div>
            <div className="flex gap-2 border-t border-ink-100 px-5 py-4">
              <button onClick={() => setAddOpen(false)} disabled={saving} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
              <button onClick={() => void submit()} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger py-2.5 text-sm font-semibold text-white hover:bg-danger/90 disabled:opacity-70">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Plus className="h-4 w-4" /> Add expense</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Ledger */}
        <section className="min-w-0">
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

          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-4 py-3">Date</th><th>Title</th><th>Category</th><th>Paid</th><th title="Subtracted in analytics">Analytics</th><th className="pr-4 text-right">Amount</th><th className="pr-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {ledger.map((e) => (
                  <tr key={e.id} className="align-top text-ink-700">
                    <td className="px-4 py-3 text-xs text-ink-500 tabular-nums">{e.expenseDate}</td>
                    <td><p className="font-medium text-ink-900">{e.title}</p><p className="text-[11px] text-ink-400">{branchLabel(e.branch)}{e.notes ? ` · ${e.notes}` : ""}</p></td>
                    <td><span className="inline-block rounded bg-ink-900/5 px-2 py-0.5 text-[11px] font-medium text-ink-600">{e.category}</span></td>
                    <td><span className={cn("inline-block rounded px-2 py-0.5 text-[10px] font-bold", PAY_TONE[e.paymentMode] ?? PAY_TONE.OTHER)}>{PAY_MODE_LABEL[e.paymentMode] ?? e.paymentMode}</span></td>
                    <td>
                      <button
                        onClick={() => void updateExpense(e.id, { inAnalytics: !e.inAnalytics })}
                        title={e.inAnalytics ? "Subtracted in analytics — click to stop" : "Not in analytics — click to subtract it"}
                        className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", e.inAnalytics ? "bg-ink-900 text-ivory-50" : "bg-ink-100 text-ink-400")}
                      >
                        <BarChart3 className="h-3 w-3" /> {e.inAnalytics ? "Linked" : "Off"}
                      </button>
                    </td>
                    <td className="pr-4 text-right font-semibold tabular-nums text-danger">− {formatINR(e.amount)}</td>
                    <td className="whitespace-nowrap pr-4 text-right">
                      <button onClick={() => setEditing(e)} aria-label="Edit expense" className="inline-grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5"><Pencil className="h-4 w-4" /></button>
                      <button
                        onClick={() => { if (confirm(`Delete "${e.title}" (${formatINR(e.amount)})?`)) void deleteExpense(e.id); }}
                        aria-label="Delete expense"
                        className="inline-grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!hydrated && <tr><td colSpan={7} className="px-4 py-12 text-center"><LoadingInline label="Loading expenses…" /></td></tr>}
                {hydrated && ledger.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-ink-400">
                    No expenses in this period.{" "}
                    <button onClick={() => setAddOpen(true)} className="font-semibold text-danger hover:underline">Add one</button>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* By category */}
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <AnalyticsDeductionCard
            period={period}
            custom={custom}
            branch={scopeSelected}
            canEdit={fullAdmin}
            refreshKey={expensesAll.map((e) => `${e.id}:${e.inAnalytics ? 1 : 0}:${e.amount}:${e.paymentMode}`).join("|")}
          />
          <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-900">By Category</h2>
            {byCategory.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-400">{hydrated ? "No expenses in this period." : "Loading…"}</p>
            ) : (
              <div className="space-y-3">
                {byCategory.map(([cat, amt]) => {
                  const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
                  return (
                    <div key={cat}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-ink-700">{cat}</span>
                        <span className="shrink-0 tabular-nums text-danger">{formatINR(amt)} <span className="text-ink-400">· {pct}%</span></span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-danger/70" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>
      </>
      )}
    </div>
  );
}
