"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { useVendors } from "@/lib/store/vendors";
import { useBranchScope } from "@/lib/store/branch";
import { LoadingPanel, OfflinePanel } from "@/components/admin/LoadState";
import { Pager } from "@/components/ui/Pager";
import { usePaged } from "@/lib/client/usePaged";
import { formatINR, cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { BRANCH_KEYS, type BranchFilter, branchLabel } from "@/lib/stock";
import type { PurchaseAnalytics } from "@/lib/db/queries/purchaseViews";

type Period = "all" | "today" | "week" | "month" | "year" | "custom";
const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "custom", label: "Custom" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** One colour per branch in the monthly chart. */
const BRANCH_COLORS = ["bg-ink-900", "bg-gold-500", "bg-ink-400", "bg-success"];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The from/to dates (yyyy-mm-dd, inclusive) for a period. */
function rangeOf(period: Period, custom: { from?: string; to?: string }): { from?: string; to?: string } {
  const now = new Date();
  if (period === "today") return { from: ymd(now), to: ymd(now) };
  if (period === "week") { const s = new Date(now); s.setDate(now.getDate() - now.getDay()); return { from: ymd(s), to: ymd(now) }; }
  if (period === "month") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  if (period === "year") return { from: `${now.getFullYear()}-01-01`, to: ymd(now) };
  if (period === "custom") return custom;
  return {};
}

/** What a branch owes, in words (a minus means it paid for another branch). */
function owes(left: number) {
  if (left > 0) return <span className="font-semibold text-danger">{formatINR(left)}</span>;
  if (left < 0) return <span className="font-semibold text-ink-700">paid {formatINR(-left)} extra</span>;
  return <span className="font-semibold text-success">settled</span>;
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-ink-100 bg-ivory-50 p-5", className)}>{children}</div>;
}
function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: "gold" | "green" | "danger" | "ink" }) {
  return (
    <Card>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">{label}</p>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums md:text-3xl", accent === "gold" ? "text-gold-600" : accent === "green" ? "text-success" : accent === "danger" ? "text-danger" : "text-ink-900")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </Card>
  );
}

export default function PurchaseAnalyticsPage() {
  const vendors = useVendors((s) => s.vendors);
  const hydrateVendors = useVendors((s) => s.hydrate);
  const canSwitch = useBranchScope((s) => s.canSwitch);
  const allowedBranches = useBranchScope((s) => s.allowed);
  const lockedBranch: BranchFilter | null = !canSwitch && allowedBranches.length === 1 ? allowedBranches[0] : null;

  const [data, setData] = useState<PurchaseAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("all");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [branch, setBranch] = useState<BranchFilter>(lockedBranch ?? "all");
  const [vendorPick, setVendorPick] = useState("all");
  const [query, setQuery] = useState("");
  const [yearPick, setYearPick] = useState<number | null>(null);

  useEffect(() => { void hydrateVendors(); }, [hydrateVendors]);
  useEffect(() => { if (lockedBranch) setBranch(lockedBranch); }, [lockedBranch]);

  const { from, to } = rangeOf(period, custom);
  const key = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(branch !== "all" ? { branch } : {}), ...(vendorPick !== "all" ? { vendor: vendorPick } : {}) }).toString();
  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    fetch(`/api/analytics/purchases?${key}`, { cache: "no-store", signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<PurchaseAnalytics>) : Promise.reject(new Error(r.statusText || String(r.status)))))
      .then((d) => { setData(d); setError(null); setLoading(false); })
      .catch((e: unknown) => { if (!ctl.signal.aborted) { setError(e instanceof Error ? e.message : "Couldn't load purchase analytics."); setLoading(false); } });
    return () => ctl.abort();
  }, [key]);

  const vendorRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.vendors ?? []).filter((v) => !q || v.vendorName.toLowerCase().includes(q));
  }, [data, query]);
  const pg = usePaged(vendorRows, `${query}|${key}`, 10);

  const years = useMemo(() => [...new Set((data?.months ?? []).map((m) => Number(m.month.slice(0, 4))))].sort((a, b) => b - a), [data]);
  const year = yearPick !== null && years.includes(yearPick) ? yearPick : (years[0] ?? new Date().getFullYear());
  const monthly = useMemo(() => {
    const rows = Array.from({ length: 12 }, () => ({ total: 0, branches: {} as Record<string, number> }));
    for (const m of data?.months ?? []) if (Number(m.month.slice(0, 4)) === year) rows[Number(m.month.slice(5, 7)) - 1] = { total: m.total, branches: m.branches };
    return rows;
  }, [data, year]);
  const maxMonth = Math.max(...monthly.map((m) => m.total), 1);

  const branchKeys = Object.keys(data?.branches ?? {});
  const r2 = (paise: number) => (paise / 100).toFixed(2);
  const exportVendors = () => downloadCsv(`purchase-analytics-vendors-${Date.now()}.csv`, [
    ["Vendor", "Bills", "Bought", "Paid", "Left", "Last purchase", ...BRANCH_KEYS.flatMap((b) => [`${branchLabel(b)} bought`, `${branchLabel(b)} paid`, `${branchLabel(b)} left`])],
    ...vendorRows.map((v) => [v.vendorName, String(v.bills), r2(v.bought), r2(v.paid), r2(v.left), v.last, ...BRANCH_KEYS.flatMap((b) => [r2(v.branches[b]?.bought ?? 0), r2(v.branches[b]?.paid ?? 0), r2(v.branches[b]?.left ?? 0)])]),
  ]);
  const exportBranches = () => downloadCsv(`purchase-analytics-branches-${Date.now()}.csv`, [
    ["Branch", "Bills", "Pieces", "Goods", "GST", "Bought", "Old balances", "Paid", "Has to pay"],
    ...branchKeys.map((b) => { const x = data!.branches[b]; return [branchLabel(b), String(x.bills), String(x.qty), r2(x.goods), r2(x.gst), r2(x.bought), r2(x.opening), r2(x.paid), r2(x.left)]; }),
  ]);

  const pill = "rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all";
  const th = "px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400";

  const header = (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link href="/admin/analytics" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-900"><ArrowLeft className="h-3 w-3" /> Back to Analytics</Link>
        <h1 className="text-2xl font-bold text-ink-900">Purchase Analytics</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-500">What each branch bought from vendors, what it has paid, and what it still has to pay.</p>
      </div>
      <div className="flex flex-wrap items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
        <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Period</span>
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)} className={cn(pill, period === p.key ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900")}>{p.label}</button>
        ))}
      </div>
    </div>
  );

  if (!data) {
    return (
      <div className="p-5 md:p-8">
        {header}
        {error ? <OfflinePanel hint={error} /> : <LoadingPanel label="Loading purchase analytics…" />}
      </div>
    );
  }

  const t = data.totals;
  return (
    <div className={cn("p-5 transition-opacity md:p-8", loading && "opacity-60")} aria-busy={loading}>
      {header}

      {period === "custom" && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-600">
          From <input type="date" value={custom.from ?? ""} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || undefined }))} className="rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1" />
          to <input type="date" value={custom.to ?? ""} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || undefined }))} className="rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1" />
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Branch</span>
          {lockedBranch ? (
            <span className={cn(pill, "bg-gold-500 text-ink-900")}>{branchLabel(lockedBranch)}</span>
          ) : (
            ([["all", "Overall"], ...allowedBranches.map((b) => [b, branchLabel(b)] as const)] as const).map(([k, label]) => (
              <button key={k} onClick={() => setBranch(k as BranchFilter)} className={cn(pill, branch === k ? "bg-gold-500 text-ink-900" : "text-ink-500 hover:text-ink-900")}>{label}</button>
            ))
          )}
        </div>
        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">
          Vendor
          <select value={vendorPick} onChange={(e) => setVendorPick(e.target.value)} className="rounded-full border border-ink-200 bg-ivory-50 px-3 py-1.5 text-xs font-semibold normal-case tracking-normal text-ink-700 focus:outline-none">
            <option value="all">All vendors</option>
            {[...vendors].sort((a, b) => a.name.localeCompare(b.name)).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      </div>

      {/* Every card follows the branch, vendor and period chosen above */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Bought" value={formatINR(t.bought)} hint={`${t.bills} bill${t.bills === 1 ? "" : "s"} · ${t.qty} pcs`} accent="gold" />
        <Stat label="Goods value" value={formatINR(t.goods)} hint="Before GST" />
        <Stat label="GST input" value={formatINR(t.gst)} hint="CGST + SGST + IGST" accent="green" />
        <Stat label="Paid" value={formatINR(t.paid)} hint="Against these bills" accent="green" />
        <Stat label="Still to pay" value={formatINR(Math.max(0, t.left))} hint={t.opening > 0 ? `Includes ${formatINR(t.opening)} old balance` : "Bought + old balance − paid"} accent={t.left > 0 ? "danger" : "ink"} />
      </div>

      {/* What each branch bought, paid and owes */}
      <Card className="mb-6 p-0">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="text-sm font-bold text-ink-900">Branch by branch</h2>
          <button onClick={exportBranches} disabled={branchKeys.length === 0} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-50"><Download className="h-3.5 w-3.5" /> CSV</button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-y border-ink-100 text-left">
                <th className={th}>Branch</th><th className={cn(th, "text-right")}>Bills</th><th className={cn(th, "text-right")}>Pieces</th><th className={cn(th, "text-right")}>Goods</th><th className={cn(th, "text-right")}>GST</th><th className={cn(th, "text-right")}>Bought</th><th className={cn(th, "text-right")}>Old balance</th><th className={cn(th, "text-right")}>Paid</th><th className={cn(th, "pr-5 text-right")}>Has to pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {branchKeys.map((b) => {
                const x = data.branches[b];
                return (
                  <tr key={b} className="text-ink-800">
                    <td className="px-3 py-3 font-semibold text-ink-900">{branchLabel(b)}</td>
                    <td className="px-3 text-right tabular-nums">{x.bills}</td>
                    <td className="px-3 text-right tabular-nums">{x.qty}</td>
                    <td className="px-3 text-right tabular-nums">{formatINR(x.goods)}</td>
                    <td className="px-3 text-right tabular-nums">{formatINR(x.gst)}</td>
                    <td className="px-3 text-right font-semibold tabular-nums">{formatINR(x.bought)}</td>
                    <td className="px-3 text-right tabular-nums">{x.opening ? formatINR(x.opening) : "—"}</td>
                    <td className="px-3 text-right tabular-nums text-success">{formatINR(x.paid)}</td>
                    <td className="pr-5 text-right tabular-nums">{owes(x.left)}</td>
                  </tr>
                );
              })}
              {branchKeys.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-400">No purchases match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {data.unapplied.count > 0 && (
          <p className="border-t border-ink-100 px-5 py-3 text-[11px] text-ink-500">{formatINR(data.unapplied.amount)} was paid in {data.unapplied.count} payment{data.unapplied.count === 1 ? "" : "s"} that name no bill — it is already taken off what each vendor is owed (see By vendor), but not off the bills above.</p>
        )}
      </Card>

      {/* Monthly purchases, each bar split by branch */}
      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink-900">Purchases by month · {year}</h2>
          <div className="flex items-center gap-3">
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
              {branchKeys.map((b, i) => <span key={b} className="inline-flex items-center gap-1"><span className={cn("h-2.5 w-2.5 rounded-sm", BRANCH_COLORS[i % BRANCH_COLORS.length])} />{branchLabel(b)}</span>)}
            </div>
            {years.length > 1 && (
              <select value={year} onChange={(e) => setYearPick(Number(e.target.value))} aria-label="Year" className="rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1 text-xs font-semibold text-ink-700 focus:outline-none">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="flex h-44 items-end gap-2">
          {monthly.map((m, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(m.total / maxMonth) * 100}%`, minHeight: m.total > 0 ? 4 : 0 }} title={`${MONTHS[i]}: ${formatINR(m.total)}${branchKeys.map((b) => ` · ${branchLabel(b)} ${formatINR(m.branches[b] ?? 0)}`).join("")}`}>
                {branchKeys.map((b, bi) => (m.branches[b] ?? 0) > 0 && <div key={b} className={BRANCH_COLORS[bi % BRANCH_COLORS.length]} style={{ height: `${((m.branches[b] ?? 0) / m.total) * 100}%` }} />)}
              </div>
              <span className="text-[10px] text-ink-400">{MONTHS[i]}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Vendors, with each branch's part */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-sm font-bold text-ink-900">Vendors</h2>
          <div className="flex items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter vendor…" className="w-44 rounded-lg border border-ink-200 bg-ivory-50 px-3 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
            <button onClick={exportVendors} disabled={vendorRows.length === 0} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-50"><Download className="h-3.5 w-3.5" /> CSV</button>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-y border-ink-100 text-left">
                <th className={th}>Vendor</th><th className={cn(th, "text-right")}>Bills</th><th className={cn(th, "text-right")}>Bought</th><th className={cn(th, "text-right")}>Paid</th><th className={cn(th, "text-right")}>Left</th><th className={th}>Each branch</th><th className={cn(th, "pr-5 text-right")}>Last</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {pg.items.map((v) => (
                <tr key={v.vendorId} className="text-ink-800">
                  <td className="px-3 py-3 font-semibold text-ink-900">{v.vendorName}</td>
                  <td className="px-3 text-right tabular-nums">{v.bills}</td>
                  <td className="px-3 text-right font-semibold tabular-nums">{formatINR(v.bought)}</td>
                  <td className="px-3 text-right tabular-nums text-success">{formatINR(v.paid)}</td>
                  <td className="px-3 text-right tabular-nums">{owes(v.left)}</td>
                  <td className="px-3">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(v.branches).map(([b, x]) => (
                        <span key={b} className="rounded-md border border-ink-100 bg-white px-1.5 py-0.5 text-[10px] text-ink-600">{branchLabel(b)}: {formatINR(x.bought)} · <span className={x.left > 0 ? "font-semibold text-danger" : ""}>{x.left > 0 ? `owes ${formatINR(x.left)}` : x.left < 0 ? `extra ${formatINR(-x.left)}` : "settled"}</span></span>
                      ))}
                    </div>
                  </td>
                  <td className="pr-5 text-right text-xs text-ink-500">{v.last || "—"}</td>
                </tr>
              ))}
              {vendorRows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-400">No vendors match.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 pb-5 pt-1"><Pager className="mt-3" {...pg.pager} /></div>
      </Card>
    </div>
  );
}
