"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ArrowUpRight, Truck, Receipt } from "lucide-react";
import { useSettings } from "@/lib/store/settings";
import { PAYMENT_MODES } from "@/lib/store/expenses";
import { PAY_MODE_LABEL } from "@/lib/billing/repairPayments";
import { inPeriod, type Period } from "@/lib/store/pos";
import { LoadingInline } from "@/components/admin/LoadState";
import { formatINR, cn } from "@/lib/utils";

interface Entry { kind: "expense" | "vendor"; id: string; date: string; branch: string; mode: string; amount: number; label: string }

/**
 * EXP-01 / EXP-02 on the Expense page: what Sales Analytics subtracts for this period and branch — linked expenses
 * and linked vendor-bill payments, split by payment mode — with the switch for each mode right here.
 */
export function AnalyticsDeductionCard({
  period, custom, branch, canEdit, refreshKey,
}: {
  period: Period;
  custom: { from?: string; to?: string };
  /** "all" or one branch key. */
  branch: string;
  /** Only a full admin may change which modes are deducted. */
  canEdit: boolean;
  /** Changes whenever expenses change, so the figures reload. */
  refreshKey: string;
}) {
  const modes = useSettings((s) => s.expenseDeductModes);
  const setSettings = useSettings((s) => s.set);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/analytics/deductions", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ entries: Entry[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) { setEntries(d.entries); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [refreshKey]);

  const inView = useMemo(
    () => (entries ?? []).filter((e) => (branch === "all" || e.branch === branch) && inPeriod(e.date.slice(0, 10), period, new Date(), custom)),
    [entries, branch, period, custom],
  );
  const byMode = useMemo(() => {
    const m = new Map<string, { expense: number; vendor: number }>();
    for (const e of inView) {
      const k = (PAYMENT_MODES as readonly string[]).includes(e.mode) ? e.mode : "OTHER";
      const x = m.get(k) ?? { expense: 0, vendor: 0 };
      x[e.kind] += e.amount;
      m.set(k, x);
    }
    return m;
  }, [inView]);
  const deducted = inView.filter((e) => modes.includes((PAYMENT_MODES as readonly string[]).includes(e.mode) ? e.mode : "OTHER")).reduce((n, e) => n + e.amount, 0);
  const vendorLinked = inView.filter((e) => e.kind === "vendor").sort((a, b) => b.date.localeCompare(a.date));

  const toggle = (m: string) => setSettings({ expenseDeductModes: modes.includes(m) ? modes.filter((x) => x !== m) : [...modes, m] });

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50">
      <div className="h-1 bg-gradient-to-r from-danger to-danger/50" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-900"><BarChart3 className="h-4 w-4 text-danger" /> Analytics deduction</h2>
            <p className="mt-0.5 text-[11px] text-ink-500">Linked expenses &amp; vendor bills, by payment mode</p>
          </div>
          <Link href="/admin/analytics" className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-gold-700 hover:underline">Analytics <ArrowUpRight className="h-3 w-3" /></Link>
        </div>

        {failed ? (
          <p className="mt-4 text-xs text-danger">Couldn&apos;t load the linked amounts.</p>
        ) : !entries ? (
          <div className="py-6 text-center"><LoadingInline label="Loading…" /></div>
        ) : (
          <>
            <ul className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
              {PAYMENT_MODES.map((m) => {
                const on = modes.includes(m);
                const x = byMode.get(m) ?? { expense: 0, vendor: 0 };
                const total = x.expense + x.vendor;
                return (
                  <li key={m} className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`Deduct ${PAY_MODE_LABEL[m] ?? m} in analytics`}
                      disabled={!canEdit}
                      onClick={() => toggle(m)}
                      className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed", on ? "bg-danger" : "bg-ink-200")}
                    >
                      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-xs font-semibold", on ? "text-ink-900" : "text-ink-400")}>{PAY_MODE_LABEL[m] ?? m}</p>
                      {total > 0 && (
                        <p className="text-[10px] leading-snug text-ink-400">
                          {x.expense > 0 && <span className="block">Expenses {formatINR(x.expense)}</span>}
                          {x.vendor > 0 && <span className="block">Vendor bills {formatINR(x.vendor)}</span>}
                        </p>
                      )}
                    </div>
                    <span className={cn("shrink-0 whitespace-nowrap text-xs font-bold tabular-nums", total === 0 ? "text-ink-300" : on ? "text-danger" : "text-ink-400 line-through")}>
                      {total > 0 ? `− ${formatINR(total)}` : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 rounded-xl bg-danger/[0.07] px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-600">Subtracted in analytics</p>
              <p className="mt-0.5 whitespace-nowrap text-lg font-bold tabular-nums text-danger">− {formatINR(deducted)}</p>
            </div>

            {vendorLinked.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500"><Truck className="h-3 w-3" /> Linked vendor bill payments</p>
                <ul className="space-y-1">
                  {vendorLinked.slice(0, 5).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="min-w-0 truncate text-ink-700">{e.label}</span>
                      <span className="shrink-0 tabular-nums text-ink-500"><span className="rounded bg-ink-900/5 px-1 text-[9px] font-bold">{e.mode}</span> <b className="text-danger">{formatINR(e.amount)}</b></span>
                    </li>
                  ))}
                </ul>
                {vendorLinked.length > 5 && <p className="mt-1 text-[10px] text-ink-400">+{vendorLinked.length - 5} more</p>}
              </div>
            )}

            <p className="mt-3 flex gap-1.5 text-[10px] leading-relaxed text-ink-400">
              <Receipt className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Link an expense with its <b>Off/Linked</b> chip, and a vendor bill with &ldquo;Subtract in analytics&rdquo; on Vendor Bills. {canEdit ? "Switch a mode off to stop deducting it." : "Only a full admin can switch modes."}</span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
