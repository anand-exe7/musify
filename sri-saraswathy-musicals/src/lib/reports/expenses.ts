/**
 * The Expenses report: what was spent, split by category, payment mode, branch and month, plus every entry.
 * Pure functions over the expenses already filtered to the period and branch being viewed.
 * Money is integer paise.
 */
import type { Expense } from "@/lib/store/expenses";
import { branchLabel } from "@/lib/stock";

export interface Slice {
  key: string;
  label: string;
  amount: number;
  count: number;
  /** Share of the total, 0–100 (one decimal). */
  share: number;
}

export interface ExpenseReport {
  total: number;
  count: number;
  /** Total ÷ number of entries (0 when there are none). */
  average: number;
  largest: Expense | null;
  byCategory: Slice[];
  byPayment: Slice[];
  byBranch: Slice[];
  /** Oldest month first. */
  byMonth: Slice[];
  /** Newest first. */
  rows: Expense[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-05" → "Oct 2026". */
export const monthLabel = (ymd: string) => `${MONTHS[Number(ymd.slice(5, 7)) - 1] ?? ymd.slice(5, 7)} ${ymd.slice(0, 4)}`;

function slices(list: Expense[], total: number, keyOf: (e: Expense) => string, labelOf: (key: string) => string = (k) => k): Slice[] {
  const m = new Map<string, { amount: number; count: number }>();
  for (const e of list) {
    const k = keyOf(e);
    const cur = m.get(k) ?? { amount: 0, count: 0 };
    cur.amount += e.amount;
    cur.count += 1;
    m.set(k, cur);
  }
  return [...m.entries()].map(([key, v]) => ({
    key, label: labelOf(key), amount: v.amount, count: v.count,
    share: total > 0 ? Math.round((v.amount / total) * 1000) / 10 : 0,
  }));
}

export function buildExpenseReport(expenses: Expense[]): ExpenseReport {
  const total = expenses.reduce((n, e) => n + e.amount, 0);
  const byAmount = (a: Slice, b: Slice) => b.amount - a.amount || a.label.localeCompare(b.label);
  const largest = expenses.reduce<Expense | null>((top, e) => (!top || e.amount > top.amount ? e : top), null);
  return {
    total,
    count: expenses.length,
    average: expenses.length ? Math.round(total / expenses.length) : 0,
    largest,
    byCategory: slices(expenses, total, (e) => e.category || "Miscellaneous").sort(byAmount),
    byPayment: slices(expenses, total, (e) => e.paymentMode).sort(byAmount),
    byBranch: slices(expenses, total, (e) => e.branch, branchLabel).sort(byAmount),
    byMonth: slices(expenses, total, (e) => e.expenseDate.slice(0, 7), monthLabel).sort((a, b) => a.key.localeCompare(b.key)),
    rows: [...expenses].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt)),
  };
}

type Cell = string | number;
const r2 = (paise: number) => (paise / 100).toFixed(2);

/**
 * The report as spreadsheet rows (first block = what was asked for, then each breakdown, then every entry),
 * ready for `downloadCsv`. `meta` is printed at the top so a saved file says what it covers.
 */
export function expenseReportRows(report: ExpenseReport, meta: { period: string; branch: string; generated: string }, revenue: number | null = null): Cell[][] {
  const block = (title: string, s: Slice[]): Cell[][] => [
    [], [title], ["Name", "Entries", "Amount", "Share %"],
    ...s.map((x) => [x.label, x.count, r2(x.amount), x.share]),
  ];
  return [
    ["Expenses report"], ["Period", meta.period], ["Branch", meta.branch], ["Generated", meta.generated],
    [], ["Total expenses", r2(report.total)], ["Entries", report.count], ["Average per entry", r2(report.average)],
    ...(revenue === null ? [] : [["Revenue", r2(revenue)], ["Net profit", r2(revenue - report.total)]]),
    ...block("By category", report.byCategory),
    ...block("By payment mode", report.byPayment),
    ...block("By branch", report.byBranch),
    ...block("By month", report.byMonth),
    [], ["All entries"], ["Date", "Branch", "Category", "Title", "Paid via", "Notes", "Amount"],
    ...report.rows.map((e) => [e.expenseDate, branchLabel(e.branch), e.category, e.title, e.paymentMode, e.notes ?? "", r2(e.amount)]),
  ];
}
