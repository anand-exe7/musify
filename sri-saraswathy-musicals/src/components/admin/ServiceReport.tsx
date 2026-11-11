"use client";
import { useMemo, useState } from "react";
import { balanceDue, turnaroundDays, isClosed, REPAIR_STATUS, type RepairTicket } from "@/lib/store/repair";
import { serviceEarned, serviceEarnedAt } from "@/lib/client/sales";
import { formatINR, cn } from "@/lib/utils";
import { BRANCH_KEYS, branchLabel } from "@/lib/stock";
import { AdminStat as Stat } from "@/components/admin/AdminStat";

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-ink-100 bg-ivory-50 p-5", className)}>{children}</div>;
}

/* ─────────────────────────  Report tab  ───────────────────────── */

export type ReportPeriod = "all" | "today" | "week" | "month" | "year" | "custom";

export const PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

/** yyyy-mm-dd of an ISO timestamp in local time. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (isNaN(+d)) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Start-of-day keys for the quick presets, computed in local time. */
export function periodBounds(period: ReportPeriod, from: string, to: string): { lo: string; hi: string } | null {
  if (period === "all") return null;
  if (period === "custom") return from || to ? { lo: from || "0000-01-01", hi: to || "9999-12-31" } : null;
  const now = new Date();
  const todayKey = dayKey(now.toISOString());
  if (period === "today") return { lo: todayKey, hi: todayKey };
  if (period === "week") {
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
    return { lo: dayKey(d.toISOString()), hi: todayKey };
  }
  if (period === "year") return { lo: `${now.getFullYear()}-01-01`, hi: todayKey };
  // month
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { lo: dayKey(first.toISOString()), hi: todayKey };
}

export function ReportTab({ tickets: allTickets }: { tickets: RepairTicket[] }) {
  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // The intake chart shows one calendar year: the current one, or the year a custom range starts in.
  const chartYear = period === "custom" && from ? Number(from.slice(0, 4)) : new Date().getFullYear();

  // REP-06: date-wise report — filter tickets by when they were raised.
  const tickets = useMemo(() => {
    const b = periodBounds(period, from, to);
    if (!b) return allTickets;
    return allTickets.filter((t) => {
      const k = dayKey(t.createdAt);
      return k >= b.lo && k <= b.hi;
    });
  }, [allTickets, period, from, to]);

  const m = useMemo(() => {
    const completed = tickets.filter((t) => t.status === "completed");
    const active = tickets.filter((t) => !isClosed(t.status));
    const revenue = tickets.reduce((n, t) => n + serviceEarned(t), 0);
    const collected = tickets.reduce((n, t) => n + (t.advance || 0), 0);
    const outstanding = tickets.filter((t) => !isClosed(t.status)).reduce((n, t) => n + balanceDue(t), 0);
    const turnarounds = completed.map(turnaroundDays).filter((x): x is number => x != null);
    const avgTAT = turnarounds.length ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length) : 0;

    const byStatus = REPAIR_STATUS.map((s) => ({ ...s, n: tickets.filter((t) => t.status === s.key).length }));

    const catMap = new Map<string, { n: number; rev: number }>();
    tickets.forEach((t) => {
      const e = catMap.get(t.category) || { n: 0, rev: 0 };
      e.n += 1;
      e.rev += serviceEarned(t);
      catMap.set(t.category, e);
    });
    const byCategory = [...catMap.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.n - a.n);

    const branchAgg = BRANCH_KEYS.map((b) => {
      const list = tickets.filter((t) => t.branch === b);
      return {
        b,
        total: list.length,
        active: list.filter((t) => !isClosed(t.status)).length,
        rev: list.reduce((n, t) => n + serviceEarned(t), 0),
      };
    });

    const techMap = new Map<string, { open: number; done: number }>();
    tickets.forEach((t) => {
      const key = t.technician || "Unassigned";
      const e = techMap.get(key) || { open: 0, done: 0 };
      if (t.status === "completed") e.done += 1;
      else if (!isClosed(t.status)) e.open += 1;
      techMap.set(key, e);
    });
    const byTech = [...techMap.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.open + b.done - (a.open + a.done));

    // Monthly ticket intake + revenue for the chosen year only (a January from another year must not pile in).
    const months = Array.from({ length: 12 }, () => ({ raised: 0, rev: 0 }));
    tickets.forEach((t) => {
      const d = new Date(t.createdAt);
      if (d.getFullYear() === chartYear) months[d.getMonth()].raised += 1;
    });
    tickets.forEach((t) => {
      const earned = serviceEarned(t);
      const d = new Date(serviceEarnedAt(t));
      if (earned > 0 && d.getFullYear() === chartYear) months[d.getMonth()].rev += earned;
    });

    return { completed, active, revenue, collected, outstanding, avgTAT, byStatus, byCategory, branchAgg, byTech, months };
  }, [tickets, chartYear]);

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const maxMonth = Math.max(...m.months.map((x) => x.raised), 1);
  const maxCat = Math.max(...m.byCategory.map((c) => c.n), 1);
  const catColors = ["#C9A24B", "#A98337", "#DFBE58", "#5B1E1E", "#87672A", "#EAD48F", "#3D6A8B"];

  const periods: { key: ReportPeriod; label: string }[] = [
    { key: "all", label: "All time" },
    { key: "today", label: "Today" },
    { key: "week", label: "This week" },
    { key: "month", label: "This month" },
    { key: "year", label: "This year" },
  ];

  return (
    <div className="space-y-6">
      {/* REP-06: date-wise report filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-ink-100 bg-ivory-50 p-4">
        <div className="flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-ink-100">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPeriod(p.key); setFrom(""); setTo(""); }}
              className={cn("rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all", period === p.key ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900")}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">From
          <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPeriod("custom"); }} className="mt-1 block rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">To
          <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPeriod("custom"); }} className="mt-1 block rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
        </label>
        <span className="pb-2 text-xs text-ink-400">{tickets.length} ticket{tickets.length === 1 ? "" : "s"} in range</span>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Repair Revenue" value={formatINR(m.revenue)} accent="green" hint={`${m.completed.length} completed · part payments included · incl GST`} />
        <Stat label="Outstanding Balance" value={formatINR(m.outstanding)} accent="gold" hint="On open tickets" />
        <Stat label="Payments Collected" value={formatINR(m.collected)} hint="Part + full payments on these tickets" />
        <Stat label="Avg Turnaround" value={`${m.avgTAT} days`} hint="Raise → completed" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Monthly intake */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-ink-900">Ticket Intake · {chartYear}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-ink-900">{tickets.length} total</p>
            </div>
            <span className="rounded-full bg-gold-50 px-3 py-1 text-xs font-semibold text-gold-700">Revenue {formatINR(m.revenue)}</span>
          </div>
          {/* Bars sit in a fixed-height track so their % heights always resolve. Hovering (or tapping) a month shows
              its numbers in a tooltip kept inside the card: it opens to the right on the left half, to the left on the right. */}
          <div className="relative" onMouseLeave={() => setHoverMonth(null)}>
            <div className="flex h-48 gap-1.5">
              {m.months.map((v, i) => {
                const h = v.raised > 0 ? Math.max(4, (v.raised / maxMonth) * 100) : 0;
                const active = hoverMonth === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onMouseEnter={() => setHoverMonth(i)}
                    onFocus={() => setHoverMonth(i)}
                    onClick={() => setHoverMonth(active ? null : i)}
                    aria-label={`${MONTHS[i]}: ${v.raised} tickets raised, ${formatINR(v.rev)} revenue`}
                    className="relative flex h-full flex-1 flex-col justify-end rounded-t focus:outline-none"
                  >
                    {v.raised > 0 && (
                      <span className="mb-1 block text-center text-[10px] font-bold tabular-nums text-ink-600">{v.raised}</span>
                    )}
                    <span
                      className={cn("block w-full rounded-t transition-colors", active ? "bg-gold-500" : "bg-ink-900", v.raised === 0 && "bg-ink-100")}
                      style={{ height: v.raised > 0 ? `calc(${h}% - 18px)` : 3, minHeight: v.raised > 0 ? 6 : 3 }}
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {MONTHS.map((mo, i) => (
                <span key={mo} className={cn("flex-1 text-center text-[9px] uppercase", hoverMonth === i ? "font-bold text-ink-900" : "text-ink-400")}>{mo}</span>
              ))}
            </div>
            {hoverMonth !== null && (
              <div
                className="pointer-events-none absolute top-0 z-10 w-44 rounded-xl border border-ink-100 bg-white p-3 text-xs shadow-lg"
                style={hoverMonth < 6 ? { left: `calc(${((hoverMonth + 1) / 12) * 100}% + 4px)` } : { right: `calc(${((12 - hoverMonth) / 12) * 100}% + 4px)` }}
              >
                <p className="font-bold text-ink-900">{MONTHS[hoverMonth]} {chartYear}</p>
                <p className="mt-1 flex justify-between text-ink-600"><span>Tickets raised</span><span className="font-semibold tabular-nums text-ink-900">{m.months[hoverMonth].raised}</span></p>
                <p className="flex justify-between text-ink-600"><span>Revenue</span><span className="font-semibold tabular-nums text-ink-900">{formatINR(m.months[hoverMonth].rev)}</span></p>
              </div>
            )}
          </div>
        </Card>

        {/* By status */}
        <Card>
          <p className="mb-4 text-sm font-bold text-ink-900">By Status</p>
          <div className="space-y-2.5">
            {m.byStatus.filter((s) => s.n > 0).map((s) => (
              <div key={s.key} className="flex items-center justify-between">
                <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", s.tone)}>{s.label}</span>
                <span className="font-bold tabular-nums text-ink-900">{s.n}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* By category */}
        <Card>
          <p className="mb-4 text-sm font-bold text-ink-900">By Category (segregation)</p>
          <div className="space-y-3">
            {m.byCategory.map((c, i) => (
              <div key={c.k}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-700">{c.k}</span>
                  <span className="text-ink-500">{c.n} tickets{c.rev > 0 && <span className="ml-2 font-semibold text-ink-900">{formatINR(c.rev)}</span>}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full" style={{ width: `${(c.n / maxCat) * 100}%`, background: catColors[i % catColors.length] }} />
                </div>
              </div>
            ))}
            {m.byCategory.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No data.</p>}
          </div>
        </Card>

        {/* By branch */}
        <Card>
          <p className="mb-4 text-sm font-bold text-ink-900">By Branch</p>
          <div className="grid grid-cols-2 gap-3">
            {m.branchAgg.map((b) => (
              <div key={b.b} className="rounded-xl border border-ink-100 bg-[#FAF7EF] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-500">{branchLabel(b.b)}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{b.total}</p>
                <p className="text-[11px] text-ink-400">{b.active} open</p>
                <p className="mt-2 text-sm font-semibold tabular-nums text-success">{formatINR(b.rev)}</p>
                <p className="text-[11px] text-ink-400">revenue</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* By technician */}
      <Card>
        <p className="mb-4 text-sm font-bold text-ink-900">Technician Workload</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                <th className="py-3">Technician</th><th className="text-center">Open</th><th className="text-center">Completed</th><th className="text-right">Total Handled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {m.byTech.map((t) => (
                <tr key={t.k} className="text-ink-800">
                  <td className="py-3.5 font-semibold text-ink-900">{t.k}</td>
                  <td className="text-center tabular-nums">{t.open}</td>
                  <td className="text-center tabular-nums text-success">{t.done}</td>
                  <td className="text-right font-semibold tabular-nums">{t.open + t.done}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
