"use client";
import { useMemo } from "react";
import { Download, Printer, TrendingUp, TrendingDown } from "lucide-react";
import type { Expense } from "@/lib/store/expenses";
import { buildExpenseReport, expenseReportRows, type Slice } from "@/lib/reports/expenses";
import { downloadCsv } from "@/lib/csv";
import { branchLabel } from "@/lib/stock";
import { formatINR, cn } from "@/lib/utils";

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #expense-report, #expense-report * { visibility: visible !important; }
  #expense-report { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; background: #fff; }
  #expense-report .no-print { display: none !important; }
  #expense-report table { font-size: 11px; }
}
`;

interface Props {
  /** Expenses already narrowed to the period and branch on screen. */
  expenses: Expense[];
  periodLabel: string;
  /** "All branches" or the branch being viewed. */
  branchName: string;
  /** Sales in the same period and branch, for the profit line. `null` hides it (branch users don't see profit). */
  revenue: number | null;
}

function Breakdown({ title, slices }: { title: string; slices: Slice[] }) {
  return (
    <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-900">{title}</h3>
      {slices.length === 0 ? (
        <p className="text-sm text-ink-400">Nothing in this period.</p>
      ) : (
        <div className="space-y-3">
          {slices.map((s) => (
            <div key={s.key}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-ink-700">{s.label} <span className="text-ink-400">· {s.count}</span></span>
                <span className="tabular-nums text-ink-500">{formatINR(s.amount)} · {s.share}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-gold-500" style={{ width: `${s.share}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ExpenseReport({ expenses, periodLabel, branchName, revenue }: Props) {
  const report = useMemo(() => buildExpenseReport(expenses), [expenses]);
  const profit = revenue === null ? null : revenue - report.total;
  const generated = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  const download = () =>
    downloadCsv(`expenses-report-${new Date().toISOString().slice(0, 10)}.csv`, expenseReportRows(report, { period: periodLabel, branch: branchName, generated }, revenue));

  const btn = "flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-900/5 disabled:cursor-not-allowed disabled:opacity-50";
  const kpi = "rounded-2xl border border-ink-100 bg-ivory-50 p-5";
  const kpiLabel = "text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div id="expense-report">
      <style>{PRINT_CSS}</style>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900">Expenses report</h2>
          <p className="mt-1 text-xs text-ink-500">{periodLabel} · {branchName} · generated {generated}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button onClick={download} disabled={report.count === 0} className={btn}><Download className="h-4 w-4" /> Download CSV (Excel)</button>
          <button onClick={() => window.print()} disabled={report.count === 0} className={btn}><Printer className="h-4 w-4" /> Print / Save PDF</button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={kpi}><p className={kpiLabel}>Total expenses</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{formatINR(report.total)}</p></div>
        <div className={kpi}><p className={kpiLabel}>Entries</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{report.count}</p></div>
        <div className={kpi}><p className={kpiLabel}>Average per entry</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{formatINR(report.average)}</p></div>
        <div className={kpi}>
          <p className={kpiLabel}>Largest expense</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{report.largest ? formatINR(report.largest.amount) : "—"}</p>
          {report.largest && <p className="mt-1 truncate text-[11px] text-ink-400">{report.largest.title}</p>}
        </div>
      </div>

      {profit !== null && (
        <div className={cn("mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border p-5", profit >= 0 ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5")}>
          {profit >= 0 ? <TrendingUp className="h-5 w-5 text-success" /> : <TrendingDown className="h-5 w-5 text-danger" />}
          <p className="text-sm text-ink-600">Sales <span className="font-semibold tabular-nums text-ink-900">{formatINR(revenue ?? 0)}</span> − Expenses <span className="font-semibold tabular-nums text-ink-900">{formatINR(report.total)}</span></p>
          <p className={cn("text-lg font-bold tabular-nums", profit >= 0 ? "text-success" : "text-danger")}>Net profit {profit < 0 ? "-" : ""}{formatINR(Math.abs(profit))}</p>
        </div>
      )}

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <Breakdown title="By category" slices={report.byCategory} />
        <Breakdown title="By payment mode" slices={report.byPayment} />
        {report.byBranch.length > 1 && <Breakdown title="By branch" slices={report.byBranch} />}
        {report.byMonth.length > 1 && <Breakdown title="By month" slices={report.byMonth} />}
      </div>

      <section className="overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50">
        <div className="border-b border-ink-100 px-4 py-3 text-sm font-bold uppercase tracking-wider text-ink-900">All entries</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                <th className="px-4 py-3">Date</th><th>Branch</th><th>Category</th><th>Title</th><th>Paid via</th><th className="pr-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {report.rows.map((e) => (
                <tr key={e.id} className="align-top text-ink-700">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-ink-500">{e.expenseDate}</td>
                  <td className="whitespace-nowrap text-xs">{branchLabel(e.branch)}</td>
                  <td className="text-xs">{e.category}</td>
                  <td><p className="font-medium text-ink-900">{e.title}</p>{e.notes && <p className="text-[11px] text-ink-400">{e.notes}</p>}</td>
                  <td className="text-xs">{e.paymentMode}</td>
                  <td className="whitespace-nowrap pr-4 text-right font-semibold tabular-nums text-ink-900">{formatINR(e.amount)}</td>
                </tr>
              ))}
              {report.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-400">No expenses in this period.</td></tr>}
            </tbody>
            {report.rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-ink-200 font-bold text-ink-900">
                  <td className="px-4 py-3" colSpan={5}>Total</td>
                  <td className="pr-4 text-right tabular-nums">{formatINR(report.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
