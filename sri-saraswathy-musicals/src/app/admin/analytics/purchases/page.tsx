"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Package, Receipt, CheckCircle2, AlertCircle, FileText, Loader2 } from "lucide-react";
import { AdminStat, StatModal } from "@/components/admin/AdminStat";
import { MonthBars } from "@/components/admin/MonthBars";
import { Segmented } from "@/components/admin/Segmented";
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
/** One colour per branch in the monthly chart. */
const BRANCH_COLORS = ["#0A0908", "#C9A24B", "#2563EB", "#16A34A"];

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
/** Re-export the shared stat tile under the local name used in this file. */
const Stat = AdminStat;

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
  const [vendorOpen, setVendorOpen] = useState<PurchaseAnalytics["vendors"][number] | null>(null);

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
  const pg = usePaged(vendorRows, `${query}|${key}`);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return [...new Set([now, now - 1, ...(data?.months ?? []).map((m) => Number(m.month.slice(0, 4)))])].sort((a, b) => b - a);
  }, [data]);
  const year = yearPick ?? new Date().getFullYear();
  const monthly = useMemo(() => {
    const rows = Array.from({ length: 12 }, () => ({ total: 0, branches: {} as Record<string, number> }));
    for (const m of data?.months ?? []) if (Number(m.month.slice(0, 4)) === year) rows[Number(m.month.slice(5, 7)) - 1] = { total: m.total, branches: m.branches };
    return rows;
  }, [data, year]);
  const branchKeys = Object.keys(data?.branches ?? {});
  const chartSeries = branchKeys.map((b, i) => ({ key: b, label: branchLabel(b), color: BRANCH_COLORS[i % BRANCH_COLORS.length] }));
  const r2 = (paise: number) => (paise / 100).toFixed(2);
  const exportVendors = () => downloadCsv(`purchase-analytics-vendors-${Date.now()}.csv`, [
    ["Vendor", "Bills", "Bought", "Paid", "Left", "Last purchase", ...BRANCH_KEYS.flatMap((b) => [`${branchLabel(b)} bought`, `${branchLabel(b)} paid`, `${branchLabel(b)} left`])],
    ...vendorRows.map((v) => [v.vendorName, String(v.bills), r2(v.bought), r2(v.paid), r2(v.left), v.last, ...BRANCH_KEYS.flatMap((b) => [r2(v.branches[b]?.bought ?? 0), r2(v.branches[b]?.paid ?? 0), r2(v.branches[b]?.left ?? 0)])]),
  ]);
  const exportBranches = () => downloadCsv(`purchase-analytics-branches-${Date.now()}.csv`, [
    ["Branch", "Bills", "Pieces", "Goods", "GST", "Bought", "Old balances", "Paid", "Has to pay"],
    ...branchKeys.map((b) => { const x = data!.branches[b]; return [branchLabel(b), String(x.bills), String(x.qty), r2(x.goods), r2(x.gst), r2(x.bought), r2(x.opening), r2(x.paid), r2(x.left)]; }),
  ]);

  const th = "px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400";

  const header = (
    <div className="mb-5">
      <Link href="/admin/analytics" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-900"><ArrowLeft className="h-3 w-3" /> Back to Sales Analytics</Link>
      <h1 className="text-2xl font-bold text-ink-900">Purchase Analytics</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-500">What each branch bought from vendors, what it has paid, and what it still has to pay · tap any box for its details.</p>
    </div>
  );

  const filters = (
    <div className="mb-6 grid gap-2.5 rounded-2xl border border-ink-100 bg-ivory-50 p-4 xl:grid-cols-2">
      <div className="flex flex-wrap items-center gap-2 xl:col-span-2">
        <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS.map((p) => [p.key, p.label] as const)} />
        {period === "custom" && (
          <span className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <input type="date" value={custom.from ?? ""} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || undefined }))} aria-label="From" className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
            →
            <input type="date" value={custom.to ?? ""} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || undefined }))} aria-label="To" className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
          </span>
        )}
      </div>
      {lockedBranch ? (
        <div className="flex items-center gap-2.5"><span className="w-16 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Branch</span><span className="rounded-lg bg-gold-100 px-3 py-1.5 text-xs font-semibold text-gold-800">{branchLabel(lockedBranch)}</span></div>
      ) : (
        <Segmented label="Branch" value={branch} onChange={(v) => setBranch(v as BranchFilter)} options={[["all", "All branches"], ...allowedBranches.map((b) => [b, branchLabel(b)] as const)] as const} />
      )}
      <div className="flex items-center gap-2.5">
        <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Vendor</span>
        <select value={vendorPick} onChange={(e) => setVendorPick(e.target.value)} className="h-9 w-full max-w-xs rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 focus:border-gold-500 focus:outline-none">
          <option value="all">All vendors</option>
          {[...vendors].sort((a, b) => a.name.localeCompare(b.name)).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
    </div>
  );

  if (!data) {
    return (
      <div className="p-5 md:p-8">
        {header}
        {filters}
        {error ? <OfflinePanel hint={error} /> : <LoadingPanel label="Loading purchase analytics…" />}
      </div>
    );
  }

  const t = data.totals;
  return (
    <div className="p-5 md:p-8" aria-busy={loading}>
      {header}
      {filters}

      {/* Re-loading after a filter change: say so, instead of just fading the page. */}
      {loading && (
        <div className="sticky top-20 z-20 mb-4 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold-300 bg-white px-4 py-1.5 text-xs font-semibold text-ink-700 shadow-md"><Loader2 className="h-3.5 w-3.5 animate-spin text-gold-500" /> Updating purchase figures…</span>
        </div>
      )}

      {vendorOpen && (
        <StatModal
          label={vendorOpen.vendorName}
          value={formatINR(vendorOpen.bought)}
          hint={`${vendorOpen.bills} bill${vendorOpen.bills === 1 ? "" : "s"} · paid ${formatINR(vendorOpen.paid)} · ${vendorOpen.left > 0 ? `${formatINR(vendorOpen.left)} still to pay` : "settled"}`}
          accent={vendorOpen.left > 0 ? "danger" : "green"}
          details={Object.entries(vendorOpen.branches).flatMap(([b, x]) => [
            { label: `${branchLabel(b)} — bought`, value: formatINR(x.bought), tone: "total" as const },
            { label: "Paid", value: formatINR(x.paid), tone: "plus" as const },
            { label: x.left > 0 ? "Still owes" : x.left < 0 ? "Paid extra" : "Balance", value: x.left === 0 ? "settled" : formatINR(Math.abs(x.left)), tone: x.left > 0 ? ("minus" as const) : ("muted" as const) },
          ])}
          note={vendorOpen.last ? `Last bill ${new Date(vendorOpen.last).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : undefined}
          onClose={() => setVendorOpen(null)}
        />
      )}

      {/* Every card follows the branch, vendor and period chosen above */}
      <div className={cn("mb-6 grid grid-cols-1 gap-3 transition-opacity min-[420px]:grid-cols-2 lg:grid-cols-5", loading && "opacity-60")}>
        <Stat label="Bought" value={formatINR(t.bought)} hint={`${t.bills} bill${t.bills === 1 ? "" : "s"} · ${t.qty} pcs`} accent="gold" icon={<Package className="h-4 w-4" />}
          details={[{ label: "Goods value (before GST)", value: formatINR(t.goods) }, { label: "GST", value: `+ ${formatINR(t.gst)}` }, { label: "Bought", value: formatINR(t.bought), tone: "total" }]} />
        <Stat label="Goods value" value={formatINR(t.goods)} hint="Before GST" icon={<FileText className="h-4 w-4" />}
          details={[{ label: "Bills", value: String(t.bills) }, { label: "Pieces", value: String(t.qty) }, { label: "Goods value", value: formatINR(t.goods), tone: "total" }]} />
        <Stat label="GST input" value={formatINR(t.gst)} hint="CGST + SGST + IGST" accent="info" icon={<Receipt className="h-4 w-4" />}
          note="Tax paid on purchases — claimable as input tax credit against the GST on your sales." />
        <Stat label="Paid" value={formatINR(t.paid)} hint="Against these bills" accent="green" icon={<CheckCircle2 className="h-4 w-4" />}
          details={[{ label: "Bought", value: formatINR(t.bought) }, ...(t.opening ? [{ label: "Old balance", value: `+ ${formatINR(t.opening)}` }] : []), { label: "Paid", value: `− ${formatINR(t.paid)}`, tone: "plus" as const }, { label: "Still to pay", value: formatINR(Math.max(0, t.left)), tone: "total" as const }]} />
        <Stat label="Still to pay" value={formatINR(Math.max(0, t.left))} hint={t.opening > 0 ? `Includes ${formatINR(t.opening)} old balance` : "Bought + old balance − paid"} accent={t.left > 0 ? "danger" : "green"} icon={<AlertCircle className="h-4 w-4" />}
          details={branchKeys.map((b) => ({ label: branchLabel(b), value: data.branches[b].left > 0 ? formatINR(data.branches[b].left) : "settled", tone: data.branches[b].left > 0 ? ("minus" as const) : ("plus" as const) }))} />
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
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink-900">Purchases by month</h2>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900">{formatINR(monthly.reduce((n, m) => n + m.total, 0))}</p>
            <p className="text-xs text-ink-500">Bought in {year}, split by branch · hover or tap a month</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
              {chartSeries.map((x) => <span key={x.key} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.color }} />{x.label}</span>)}
            </div>
            <select value={year} onChange={(e) => setYearPick(Number(e.target.value))} aria-label="Year" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink-800 focus:border-gold-500 focus:outline-none">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <MonthBars totals={monthly.map((m) => m.total)} parts={monthly.map((m) => m.branches)} series={chartSeries} year={year} format={formatINR} height={170} />
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
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-y border-ink-100 text-left">
                <th className={cn(th, "pl-5")}>Vendor</th><th className={cn(th, "text-right")}>Bills</th><th className={cn(th, "text-right")}>Bought</th><th className={cn(th, "text-right")}>Paid</th><th className={cn(th, "text-right")}>Left</th><th className={th}>Branches</th><th className={cn(th, "pr-5 text-right")}>Last bill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {pg.items.map((v) => {
                const parts = Object.entries(v.branches);
                const owing = parts.filter(([, x]) => x.left > 0).length;
                return (
                  <tr key={v.vendorId} className="text-ink-800">
                    <td className="max-w-[14rem] py-3 pl-5 pr-3"><p className="truncate font-semibold text-ink-900" title={v.vendorName}>{v.vendorName}</p></td>
                    <td className="px-3 text-right tabular-nums">{v.bills}</td>
                    <td className="whitespace-nowrap px-3 text-right font-semibold tabular-nums">{formatINR(v.bought)}</td>
                    <td className="whitespace-nowrap px-3 text-right tabular-nums text-success">{formatINR(v.paid)}</td>
                    <td className="whitespace-nowrap px-3 text-right tabular-nums">{owes(v.left)}</td>
                    <td className="px-3">
                      {/* A short summary; the full branch-by-branch split opens in a pop-up, so long lists never widen the table. */}
                      <button onClick={() => setVendorOpen(v)} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-700">
                        <span className="flex -space-x-1">{parts.slice(0, 4).map(([b, x]) => <span key={b} className={cn("h-2.5 w-2.5 rounded-full ring-2 ring-white", x.left > 0 ? "bg-danger" : "bg-success")} />)}</span>
                        {parts.length} branch{parts.length === 1 ? "" : "es"}{owing > 0 ? <span className="text-danger">· {owing} owe{owing === 1 ? "s" : ""}</span> : <span className="text-success">· settled</span>}
                      </button>
                    </td>
                    <td className="whitespace-nowrap pr-5 text-right text-xs text-ink-500">{v.last ? new Date(v.last).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                  </tr>
                );
              })}
              {vendorRows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-400">No vendors match.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-5 pb-5 pt-1"><Pager className="mt-3" {...pg.pager} /></div>
      </Card>
    </div>
  );
}
