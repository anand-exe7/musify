"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useVendors } from "@/lib/store/vendors";
import { useBranchScope } from "@/lib/store/branch";
import { LoadingPanel, OfflinePanel } from "@/components/admin/LoadState";
import { formatINR, cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { Download, FileSpreadsheet, ArrowLeft } from "lucide-react";
import { BRANCH_KEYS, type Branch, type BranchFilter } from "@/lib/stock";

interface PurchaseRow {
  id: string;
  vendorId: string;
  invoiceNo: string;
  purchaseDate: string;
  subtotal: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  amountPaid: number;
  paymentMode: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  /** Part-payments recorded after the purchase (on top of amountPaid). */
  paymentsTotal: number;
}

/** When the purchase happened: the entered bill date (local midnight), else when it was saved. */
const purchasedOn = (p: { purchaseDate: string; createdAt: string }) => (p.purchaseDate ? `${p.purchaseDate}T00:00:00` : p.createdAt);

interface OutstandingRow {
  vendorId: string;
  branch: Branch;
  purchased: number;
  paid: number;
  outstanding: number;
}

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

function withinPeriod(iso: string, period: Period, custom: { from?: string; to?: string }): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(+d)) return false;
  if (period === "all") return true;
  const now = new Date();
  if (period === "today") return d.toDateString() === now.toDateString();
  if (period === "week") {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (period === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === "year") return d.getFullYear() === now.getFullYear();
  if (period === "custom") {
    const from = custom.from ? new Date(custom.from) : null;
    const to = custom.to ? new Date(custom.to) : null;
    if (from && d < from) return false;
    if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); if (d > end) return false; }
    return true;
  }
  return true;
}

export default function PurchaseAnalyticsPage() {
  const vendors = useVendors((s) => s.vendors);
  const hydrateVendors = useVendors((s) => s.hydrate);
  const canSwitch = useBranchScope((s) => s.canSwitch);
  const scopeAccess = useBranchScope((s) => s.access);
  const lockedBranch: BranchFilter | null = !canSwitch && (scopeAccess === "Branch 1" || scopeAccess === "Branch 2") ? scopeAccess : null;

  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [outstandings, setOutstandings] = useState<OutstandingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState<Period>("all");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [branch, setBranch] = useState<BranchFilter>(lockedBranch ?? "all");
  const [vendorPick, setVendorPick] = useState<string>("all");
  const [query, setQuery] = useState("");

  useEffect(() => { void hydrateVendors(); }, [hydrateVendors]);
  useEffect(() => {
    (async () => {
      try {
        const [p, o] = await Promise.all([
          fetch("/api/purchases", { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject(r.statusText)),
          fetch("/api/vendor-outstandings", { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject(r.statusText)),
        ]);
        setPurchases(p as PurchaseRow[]);
        setOutstandings(o as OutstandingRow[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load purchase analytics.");
      }
    })();
  }, []);
  useEffect(() => { if (lockedBranch) setBranch(lockedBranch); }, [lockedBranch]);

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;

  const scoped = useMemo(() => {
    if (!purchases) return [] as PurchaseRow[];
    return purchases.filter((p) =>
      withinPeriod(purchasedOn(p), period, custom) &&
      (vendorPick === "all" || p.vendorId === vendorPick)
      // Note: branch filter applies to outstandings table (payment/line level);
      // headers are kept whole because a single purchase can span branches.
    );
  }, [purchases, period, custom, vendorPick]);

  const metrics = useMemo(() => {
    const total = scoped.reduce((n, p) => n + p.totalAmount, 0);
    const goods = scoped.reduce((n, p) => n + p.subtotal, 0);
    const gst = scoped.reduce((n, p) => n + (p.tax || p.cgst + p.sgst + p.igst), 0);
    const paid = scoped.reduce((n, p) => n + p.amountPaid + p.paymentsTotal, 0);
    const balance = Math.max(0, total - paid);
    return { total, goods, gst, paid, balance, count: scoped.length };
  }, [scoped]);

  // Monthly trend of purchase total for the year with the most activity.
  const years = useMemo(() => [...new Set((purchases ?? []).map((p) => new Date(purchasedOn(p)).getFullYear()).filter((y) => !Number.isNaN(y)))].sort((a, b) => b - a), [purchases]);
  const [yearPick, setYearPick] = useState<number | null>(null);
  const year = yearPick !== null && years.includes(yearPick) ? yearPick : (years[0] ?? new Date().getFullYear());
  const monthly = useMemo(() => {
    const totals = new Array(12).fill(0);
    for (const p of purchases ?? []) {
      const d = new Date(purchasedOn(p));
      if (d.getFullYear() === year) totals[d.getMonth()] += p.totalAmount;
    }
    return totals;
  }, [purchases, year]);
  const maxMonth = Math.max(...monthly, 1);

  // Per-vendor rollup table (within current filters).
  const perVendor = useMemo(() => {
    const map = new Map<string, { vendorId: string; purchases: number; count: number; paid: number; balance: number; last: string }>();
    for (const p of scoped) {
      const e = map.get(p.vendorId) ?? { vendorId: p.vendorId, purchases: 0, count: 0, paid: 0, balance: 0, last: "" };
      e.purchases += p.totalAmount;
      e.paid += p.amountPaid + p.paymentsTotal;
      e.balance = Math.max(0, e.purchases - e.paid);
      e.count += 1;
      if (!e.last || purchasedOn(p) > e.last) e.last = purchasedOn(p);
      map.set(p.vendorId, e);
    }
    const q = query.trim().toLowerCase();
    const list = [...map.values()].filter((v) => !q || vendorName(v.vendorId).toLowerCase().includes(q));
    return list.sort((a, b) => b.purchases - a.purchases);
  }, [scoped, query, vendors]);

  // Outstandings table — scoped by branch filter.
  const outstandingsScoped = useMemo(() => {
    if (!outstandings) return [] as Array<OutstandingRow & { name: string }>;
    const list = outstandings
      .filter((r) => branch === "all" || r.branch === branch)
      .map((r) => ({ ...r, name: vendorName(r.vendorId) }));
    return list.sort((a, b) => b.outstanding - a.outstanding);
  }, [outstandings, branch, vendors]);

  const exportCSV = () => {
    const r2 = (paise: number) => (paise / 100).toFixed(2);
    const head = ["Vendor", "Purchases", "Bills", "Paid", "Balance", "Last Purchase"];
    const body = perVendor.map((v) => [vendorName(v.vendorId), r2(v.purchases), String(v.count), r2(v.paid), r2(v.balance), v.last.slice(0, 10)]);
    downloadCsv(`purchase-analytics-${Date.now()}.csv`, [head, ...body]);
  };
  const exportOutstandingsCSV = () => {
    const r2 = (paise: number) => (paise / 100).toFixed(2);
    const head = ["Vendor", "Branch", "Purchased", "Paid", "Outstanding"];
    const body = outstandingsScoped.map((r) => [r.name, r.branch, r2(r.purchased), r2(r.paid), r2(r.outstanding)]);
    downloadCsv(`vendor-outstandings-${Date.now()}.csv`, [head, ...body]);
  };

  const pill = "rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all";

  if (purchases === null || outstandings === null) {
    return (
      <div className="p-5 md:p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-ink-900">Purchase Analytics</h1>
          <p className="mt-1 text-sm text-ink-500">Vendor spend, GST input, outstandings</p>
        </header>
        {error ? <OfflinePanel hint={error} /> : <LoadingPanel label="Loading purchase analytics…" />}
      </div>
    );
  }

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <Link href="/admin/analytics" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-900"><ArrowLeft className="h-3 w-3" /> Back to Analytics</Link>
          <h1 className="text-2xl font-bold text-ink-900">Purchase Analytics</h1>
          <p className="mt-1 text-sm text-ink-500">Spend across vendors, GST input, outstandings. Mirrors sales analytics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Period</span>
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className={cn(pill, period === p.key ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900")}>{p.label}</button>
          ))}
        </div>
      </div>

      {period === "custom" && (
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-gold-300 bg-gold-50/50 p-4">
          <div><label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">From</label><input type="date" value={custom.from ?? ""} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" /></div>
          <div><label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">To</label><input type="date" value={custom.to ?? ""} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" /></div>
          <p className="pb-2 text-xs text-ink-500">{scoped.length} purchase(s) in range</p>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Branch (outstandings)</span>
          {lockedBranch ? (
            <span className={cn(pill, "bg-gold-500 text-ink-900")}>{lockedBranch}</span>
          ) : (
            ([["all", "Overall"], ...BRANCH_KEYS.map((b) => [b, b] as const)] as const).map(([k, label]) => (
              <button key={k} onClick={() => setBranch(k as BranchFilter)} className={cn(pill, branch === k ? "bg-gold-500 text-ink-900" : "text-ink-500 hover:text-ink-900")}>{label}</button>
            ))
          )}
        </div>
        <div className="flex items-center gap-2 rounded-full bg-ivory-50 px-3 py-1 shadow-sm ring-1 ring-ink-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Vendor</span>
          <select value={vendorPick} onChange={(e) => setVendorPick(e.target.value)} className="rounded-md bg-transparent text-xs font-semibold text-ink-700 focus:outline-none">
            <option value="all">All</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total Purchases" value={formatINR(metrics.total)} hint={`${metrics.count} bill${metrics.count === 1 ? "" : "s"}`} accent="gold" />
        <Stat label="Goods Value" value={formatINR(metrics.goods)} hint="Ex-GST" />
        <Stat label="GST Input" value={formatINR(metrics.gst)} hint="CGST + SGST + IGST" accent="green" />
        <Stat label="Outstanding Balance" value={formatINR(metrics.balance)} hint={`Paid ${formatINR(metrics.paid)}`} accent={metrics.balance > 0 ? "danger" : "ink"} />
      </div>

      {/* Trend + top vendors */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-ink-900">Purchase Trend · {year}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-ink-900">{formatINR(monthly.reduce((a, b) => a + b, 0))}</p>
            </div>
            {years.length > 1 && (
              <select value={year} onChange={(e) => setYearPick(Number(e.target.value))} aria-label="Year" className="rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1 text-xs font-semibold text-ink-700 focus:border-gold-500 focus:outline-none">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
          <div className="flex h-52 items-end gap-1.5">
            {monthly.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t bg-ink-900 transition-all hover:bg-gold-500" style={{ height: `${(v / maxMonth) * 100}%`, minHeight: v > 0 ? 4 : 0 }} title={formatINR(v)} />
                </div>
                <span className="text-[8px] uppercase text-ink-400">{MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <p className="mb-3 text-sm font-bold text-ink-900">Top Vendors by Spend</p>
          <ol className="space-y-3 text-sm">
            {perVendor.slice(0, 5).map((v, i) => (
              <li key={v.vendorId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-ink-700">{i + 1}. {vendorName(v.vendorId)}</span>
                <span className="shrink-0 font-bold tabular-nums text-ink-900">{formatINR(v.purchases)}</span>
              </li>
            ))}
            {perVendor.length === 0 && <li className="text-ink-400">No purchases in this view.</li>}
          </ol>
        </Card>
      </div>

      {/* Per-vendor table */}
      <Card className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-ink-900">Vendor-wise Breakdown</p>
          <div className="flex items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter vendor…" className="w-56 rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
            <button onClick={exportCSV} disabled={perVendor.length === 0} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-50">
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>
        {perVendor.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-400">No purchases match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="py-3">Vendor</th>
                  <th className="text-right">Purchases</th>
                  <th className="text-center">Bills</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                  <th>Last Purchase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {perVendor.map((v) => (
                  <tr key={v.vendorId} className="text-ink-800">
                    <td className="py-3 font-semibold text-ink-900">{vendorName(v.vendorId)}</td>
                    <td className="text-right font-semibold tabular-nums">{formatINR(v.purchases)}</td>
                    <td className="text-center tabular-nums">{v.count}</td>
                    <td className="text-right tabular-nums text-success">{formatINR(v.paid)}</td>
                    <td className={cn("text-right font-semibold tabular-nums", v.balance > 0 ? "text-danger" : "text-ink-400")}>{v.balance > 0 ? formatINR(v.balance) : "—"}</td>
                    <td className="text-ink-500">{v.last ? v.last.slice(0, 10) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Outstandings table */}
      <Card className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-ink-900">Vendor Outstandings</p>
            <p className="mt-1 text-xs text-ink-500">Branch-wise balance: purchased − paid.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/vendors/outstandings" className="text-xs font-semibold text-ink-500 hover:text-ink-900 underline">Open full view →</Link>
            <button onClick={exportOutstandingsCSV} disabled={outstandingsScoped.length === 0} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-50">
              <FileSpreadsheet className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>
        {outstandingsScoped.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-400">No outstandings{branch !== "all" ? ` in ${branch}` : ""}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="py-3">Vendor</th>
                  <th>Branch</th>
                  <th className="text-right">Purchased</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {outstandingsScoped.map((r) => (
                  <tr key={`${r.vendorId}-${r.branch}`} className="text-ink-800">
                    <td className="py-3 font-semibold text-ink-900">{r.name}</td>
                    <td className="text-ink-600">{r.branch}</td>
                    <td className="text-right tabular-nums">{formatINR(r.purchased)}</td>
                    <td className="text-right tabular-nums text-success">{formatINR(r.paid)}</td>
                    <td className={cn("text-right font-semibold tabular-nums", r.outstanding > 0 ? "text-danger" : "text-ink-400")}>{formatINR(r.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
