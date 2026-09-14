"use client";
import { useEffect, useMemo, useState } from "react";
import { usePOS, filterBills, inPeriod, productStock, type Bill, type Period, type BranchFilter, type Source } from "@/lib/store/pos";
import { useAllSales } from "@/lib/client/sales";
import { useGst, extractGst } from "@/lib/store/gst";
import { useExpenses } from "@/lib/store/expenses";
import { useBranchScope } from "@/lib/store/branch";
import { LoadingPanel, OfflinePanel } from "@/components/admin/LoadState";
import { formatINR, cn } from "@/lib/utils";

/** A sale is "GST" when it actually carried tax: POS bills honour their saved
 *  `gstEnabled` snapshot; web + service sales are always taxed. */
function isGstBill(b: Bill): boolean {
  return b.source === "offline" ? Boolean(b.gstEnabled) : true;
}

type SalesClass = "all" | "gst" | "nongst";

const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "custom", label: "Custom" },
];
const TABS = ["revenue", "today", "products", "coupons"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  revenue: "Revenue",
  today: "Today's Sales",
  products: "Products",
  coupons: "Coupons",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-ink-100 bg-ivory-50 p-5", className)}>{children}</div>;
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: "gold" | "green" | "ink" }) {
  return (
    <Card>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">{label}</p>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums md:text-3xl", accent === "gold" ? "text-gold-600" : accent === "green" ? "text-success" : "text-ink-900")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </Card>
  );
}

export default function AnalyticsPage() {
  const { sales: bills, loading, error } = useAllSales();
  const invProducts = usePOS((s) => s.invProducts);
  const coupons = usePOS((s) => s.coupons);
  const gstRate = useGst((s) => s.standardRate);
  const expensesAll = useExpenses((s) => s.expenses);
  const hydrateExpenses = useExpenses((s) => s.hydrate);

  // Branch scope: a branch user is locked to their own branch.
  const canSwitchBranch = useBranchScope((s) => s.canSwitch);
  const scopeAccess = useBranchScope((s) => s.access);
  const lockedBranch: BranchFilter | null =
    !canSwitchBranch && (scopeAccess === "Branch 1" || scopeAccess === "Branch 2") ? scopeAccess : null;

  const [tab, setTab] = useState<(typeof TABS)[number]>("revenue");
  const [period, setPeriod] = useState<Period>("all");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [channel, setChannel] = useState<Source | "all">("all");
  const [salesClass, setSalesClass] = useState<SalesClass>("all");
  const [branch, setBranch] = useState<BranchFilter>(lockedBranch ?? "all");
  const [prodQuery, setProdQuery] = useState("");
  const [couponQuery, setCouponQuery] = useState("");
  const [txnQuery, setTxnQuery] = useState("");

  useEffect(() => {
    void hydrateExpenses();
  }, [hydrateExpenses]);
  useEffect(() => {
    if (lockedBranch) setBranch(lockedBranch);
  }, [lockedBranch]);

  const scoped = useMemo(
    () =>
      filterBills(bills, { period, branch, source: channel, custom }).filter(
        (b) => salesClass === "all" || (salesClass === "gst") === isGstBill(b),
      ),
    [bills, period, branch, channel, custom, salesClass],
  );

  // Net-of-GST helpers. Sale values are GST-inclusive: a POS bill contributes
  // its saved tax snapshot (0 on a non-GST bill); web/service extract at the
  // standard slab. Revenue is the taxable value (sale − GST).
  const netOf = (gross: number) => extractGst(Math.max(0, gross), gstRate).net;
  const gstOf = (gross: number) => extractGst(Math.max(0, gross), gstRate).gst;
  const billGoods = (b: Bill) => Math.max(0, b.subtotal - b.discount);
  const billGst = (b: Bill): number => (b.source === "offline" ? (b.gstEnabled ? Math.max(0, b.gst ?? 0) : 0) : gstOf(billGoods(b)));
  const billNet = (b: Bill) => Math.max(0, billGoods(b) - billGst(b));

  const m = useMemo(() => {
    // Revenue = product sale value net of GST (excludes delivery & tax).
    const totalRevenue = scoped.reduce((n, b) => n + billNet(b), 0);
    const gstCollected = scoped.reduce((n, b) => n + billGst(b), 0);
    const offline = scoped.filter((b) => b.source === "offline");
    const online = scoped.filter((b) => b.source === "online");
    const service = scoped.filter((b) => b.source === "service");
    const items = scoped.reduce((n, b) => n + b.items.reduce((q, i) => q + i.qty, 0), 0);
    const revByItem = new Map<string, number>();
    const qtyByItem = new Map<string, number>();
    scoped.forEach((b) => b.items.forEach((i) => {
      revByItem.set(i.name, (revByItem.get(i.name) || 0) + netOf(i.price * i.qty));
      qtyByItem.set(i.name, (qtyByItem.get(i.name) || 0) + i.qty);
    }));
    const topItems = [...revByItem.entries()].sort((a, b) => b[1] - a[1]);
    return {
      totalRevenue,
      gstCollected,
      count: scoped.length,
      offlineRev: offline.reduce((n, b) => n + billNet(b), 0),
      onlineRev: online.reduce((n, b) => n + billNet(b), 0),
      serviceRev: service.reduce((n, b) => n + billNet(b), 0),
      offlineCount: offline.length,
      onlineCount: online.length,
      serviceCount: service.length,
      items,
      aov: scoped.length ? Math.round(totalRevenue / scoped.length) : 0,
      topProduct: topItems[0]?.[0] ?? "—",
      topItems,
      qtyByItem,
      revByItem,
    };
  }, [scoped, gstRate]);

  // net revenue trend by month (respects branch + channel, ignores period so the year reads fully)
  const monthly = useMemo(() => {
    const base = filterBills(bills, { period: "all", branch, source: channel }).filter(
      (b) => salesClass === "all" || (salesClass === "gst") === isGstBill(b),
    );
    const totals = new Array(12).fill(0);
    base.forEach((b) => { totals[new Date(b.createdAt).getMonth()] += billNet(b); });
    return totals;
  }, [bills, branch, channel, gstRate, salesClass]);
  const maxMonth = Math.max(...monthly, 1);
  const yearTotal = monthly.reduce((a, b) => a + b, 0);

  // Expenses for the current period + branch → true net profit.
  const totalExpenses = useMemo(
    () =>
      expensesAll
        .filter((e) => (branch === "all" || e.branch === branch) && inPeriod(e.expenseDate, period, new Date(), custom))
        .reduce((n, e) => n + e.amount, 0),
    [expensesAll, branch, period, custom],
  );

  // Estimated COGS: match each sold item's name to its inventory purchase cost.
  const cogs = useMemo(() => {
    const costByName = new Map(invProducts.map((p) => [p.name, p.cost ?? 0]));
    return scoped.reduce((n, b) => n + b.items.reduce((s, i) => s + (costByName.get(i.name) ?? 0) * i.qty, 0), 0);
  }, [scoped, invProducts]);

  // net profit = sales − GST collected − expenses = net-of-GST revenue − expenses
  const netProfit = m.totalRevenue - totalExpenses;
  const grossProfit = m.totalRevenue - cogs; // estimated (cost known where matched)

  // GST vs non-GST split of the current scoped view.
  const split = useMemo(() => {
    let gstSales = 0, nonGstSales = 0;
    for (const b of scoped) {
      if (isGstBill(b)) gstSales += billGoods(b);
      else nonGstSales += billGoods(b);
    }
    return { gstSales, nonGstSales };
  }, [scoped]);

  const pill = "rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all";

  // Until the sales feed resolves, show a loading (or offline) panel rather than
  // a wall of ₹0 stats that reads like the business has no sales.
  if (loading || error) {
    return (
      <div className="p-5 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink-900">Analytics</h1>
          <p className="mt-1 text-sm text-ink-500">Real-time insights across in-store POS and online storefront orders</p>
        </div>
        {error ? (
          <OfflinePanel hint="We couldn't load your sales data. Check your connection and refresh." />
        ) : (
          <LoadingPanel label="Loading analytics…" />
        )}
      </div>
    );
  }

  return (
    <div className="p-5 md:p-8">
      {/* Header + period */}
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Analytics</h1>
          <p className="mt-1 text-sm text-ink-500">Real-time insights across in-store POS and online storefront orders</p>
        </div>
        {tab !== "today" && (
          <div className="flex flex-wrap items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
            <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Period</span>
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)} className={cn(pill, period === p.key ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900")}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* custom range */}
      {tab !== "today" && period === "custom" && (
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-gold-300 bg-gold-50/50 p-4">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">From</label>
            <input type="date" value={custom.from ?? ""} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">To</label>
            <input type="date" value={custom.to ?? ""} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
          </div>
          <p className="pb-2 text-xs text-ink-500">{scoped.length} bill(s) in range</p>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-6 border-b border-ink-100">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("relative -mb-px border-b-2 pb-3 text-sm font-semibold uppercase tracking-wider transition-colors", tab === t ? "border-ink-900 text-ink-900" : "border-transparent text-ink-400 hover:text-ink-700")}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Channel + branch filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          {([["all", "All Channels"], ["offline", "In-store (POS)"], ["online", "Online (Storefront)"], ["service", "Service (Repairs)"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setChannel(k)} className={cn(pill, channel === k ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900")}>
              {k !== "all" && <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle", k === "offline" ? "bg-gold-400" : k === "online" ? "bg-success" : "bg-[#8B5CF6]")} />}
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Branch</span>
          {lockedBranch ? (
            <span className={cn(pill, "bg-gold-500 text-ink-900")}>{lockedBranch}</span>
          ) : (
            ([["all", "Overall"], ["Branch 1", "Branch 1"], ["Branch 2", "Branch 2"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setBranch(k)} className={cn(pill, branch === k ? "bg-gold-500 text-ink-900" : "text-ink-500 hover:text-ink-900")}>
                {label}
              </button>
            ))
          )}
        </div>
        {/* GST vs Non-GST split */}
        <div className="flex items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Tax</span>
          {([["all", "All Sales"], ["gst", "GST"], ["nongst", "Non-GST"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setSalesClass(k)} className={cn(pill, salesClass === k ? "bg-info text-white" : "text-ink-500 hover:text-ink-900")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── REVENUE ── */}
      {tab === "revenue" && (
        <div className="space-y-6">
          {/* Profit summary */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={cn("rounded-2xl border p-5", netProfit >= 0 ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5")}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Net Profit</p>
              <p className={cn("mt-2 text-2xl font-bold tabular-nums md:text-3xl", netProfit >= 0 ? "text-success" : "text-danger")}>{netProfit < 0 ? "-" : ""}{formatINR(Math.abs(netProfit))}</p>
              <p className="mt-1 text-xs text-ink-400">Sales − GST − Expenses</p>
            </div>
            <Stat label="Est. Gross Profit" value={`${grossProfit < 0 ? "-" : ""}${formatINR(Math.abs(grossProfit))}`} hint="Net revenue − matched cost" accent="green" />
            <Stat label="Total Expenses" value={formatINR(totalExpenses)} hint="This period · branch" />
            <Card>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Sales Mix <span className="normal-case text-ink-300">(incl. GST)</span></p>
              {(() => {
                const tot = split.gstSales + split.nonGstSales || 1;
                return (
                  <div className="mt-3 space-y-2.5">
                    {([["GST", split.gstSales, "#2563EB"], ["Non-GST", split.nonGstSales, "#9CA3AF"]] as const).map(([label, val, color]) => (
                      <div key={label}>
                        <div className="mb-1 flex items-center justify-between text-xs"><span className="font-semibold text-ink-600">{label}</span><span className="tabular-nums text-ink-500">{formatINR(val)}</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full" style={{ width: `${(val / tot) * 100}%`, background: color }} /></div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </Card>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Net Revenue" value={formatINR(m.totalRevenue)} hint="Ex-GST · sale − tax" accent="green" />
            <Stat label="GST Collected" value={formatINR(m.gstCollected)} hint="Actual output tax" accent="gold" />
            <Stat label="Completed Bills" value={String(m.count)} hint="in current view" />
            <Stat label="Avg Order Value" value={formatINR(m.aov)} hint="Net, per bill" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="In-store Net Rev" value={formatINR(m.offlineRev)} hint={`${m.offlineCount} POS bill${m.offlineCount === 1 ? "" : "s"}`} accent="gold" />
            <Stat label="Online Net Rev" value={formatINR(m.onlineRev)} hint={`${m.onlineCount} storefront order${m.onlineCount === 1 ? "" : "s"}`} accent="green" />
            <Stat label="Service Net Rev" value={formatINR(m.serviceRev)} hint={`${m.serviceCount} repair${m.serviceCount === 1 ? "" : "s"}`} />
            <Stat label="Total Items Sold" value={`${m.items} pcs`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            {/* trend */}
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink-900">Net Revenue Trend · 2026 <span className="font-normal text-ink-400">(ex-GST)</span></p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-ink-900">{formatINR(yearTotal)}</p>
                </div>
                <span className="rounded-full bg-gold-50 px-3 py-1 text-xs font-semibold text-gold-700">Avg {formatINR(Math.round(yearTotal / 12))}/mo</span>
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

            {/* order source + top items */}
            <div className="space-y-4">
              <Card>
                <p className="mb-4 text-sm font-bold text-ink-900">Order Source</p>
                {([["In-store", m.offlineRev, m.offlineCount, "#C9A24B"], ["Online", m.onlineRev, m.onlineCount, "#128C4B"], ["Service", m.serviceRev, m.serviceCount, "#8B5CF6"]] as const).map(([label, rev, cnt, color]) => (
                  <div key={label} className="mb-4 last:mb-0">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold uppercase tracking-wider text-ink-500">{label} · {cnt}</span>
                      <span className="font-bold tabular-nums text-ink-900">{formatINR(rev)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full" style={{ width: `${m.totalRevenue ? (rev / m.totalRevenue) * 100 : 0}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </Card>
              <Card>
                <p className="mb-3 text-sm font-bold text-ink-900">Top Items by Revenue</p>
                <ol className="space-y-3 text-sm">
                  {m.topItems.slice(0, 5).map(([name, rev], i) => (
                    <li key={name} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-ink-700">{i + 1}. {name}</span>
                      <span className="shrink-0 font-bold tabular-nums text-ink-900">{formatINR(rev)}</span>
                    </li>
                  ))}
                  {m.topItems.length === 0 && <li className="text-ink-400">No sales in this view.</li>}
                </ol>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ── TODAY'S SALES ── */}
      {tab === "today" && <TodayTab bills={bills} branch={branch} channel={channel} query={txnQuery} setQuery={setTxnQuery} rate={gstRate} />}

      {/* ── PRODUCTS ── */}
      {tab === "products" && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-ink-900">Product Performance</p>
            <input value={prodQuery} onChange={(e) => setProdQuery(e.target.value)} placeholder="Search product…" className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                  <th className="py-3">Product</th><th>Category</th><th className="text-center">Units Sold</th><th className="text-right">Revenue</th><th className="text-right">In Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {invProducts
                  .filter((p) => p.name.toLowerCase().includes(prodQuery.toLowerCase()))
                  .map((p) => ({ p, sold: m.qtyByItem.get(p.name) || 0, rev: m.revByItem.get(p.name) || 0 }))
                  .sort((a, b) => b.rev - a.rev)
                  .map(({ p, sold, rev }) => (
                    <tr key={p.id} className="text-ink-800">
                      <td className="py-3.5 font-semibold text-ink-900">{p.name}</td>
                      <td className="text-ink-500">{p.category}</td>
                      <td className="text-center font-semibold tabular-nums">{sold}</td>
                      <td className="text-right font-semibold tabular-nums">{formatINR(rev)}</td>
                      <td className="text-right tabular-nums text-ink-500">{productStock(p)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── COUPONS ── */}
      {tab === "coupons" && <CouponsTab scoped={scoped} query={couponQuery} setQuery={setCouponQuery} couponCount={coupons.length} />}
    </div>
  );
}

/* ── Today tab ── */
function TodayTab({ bills, branch, channel, query, setQuery, rate }: { bills: ReturnType<typeof usePOS.getState>["bills"]; branch: BranchFilter; channel: Source | "all"; query: string; setQuery: (v: string) => void; rate: number; }) {
  const today = useMemo(() => filterBills(bills, { period: "today", branch, source: channel }), [bills, branch, channel]);
  const goods = (b: (typeof today)[number]) => Math.max(0, b.subtotal - b.discount);
  const rev = today.reduce((n, b) => n + extractGst(goods(b), rate).net, 0);
  const gstColl = today.reduce((n, b) => n + extractGst(goods(b), rate).gst, 0);
  const items = today.reduce((n, b) => n + b.items.reduce((q, i) => q + i.qty, 0), 0);
  const filtered = today.filter((b) => b.phone.includes(query.trim()));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today's Net Revenue" value={formatINR(rev)} hint="Ex-GST · today" accent="green" />
        <Stat label="Today's GST" value={formatINR(gstColl)} hint={`Output tax @ ${rate}%`} accent="gold" />
        <Stat label="Today's Bills" value={String(today.length)} hint="Completed today" />
        <Stat label="Today's Items Sold" value={`${items} pcs`} hint="Quantity sold today" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-ink-900">Today&apos;s Transactions</p>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contact no…" className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
          </div>
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-400">No transactions found for today.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400"><th className="py-2">Invoice ID</th><th>Customer No</th><th>Source</th><th className="text-center">Items</th><th className="text-right">Grand Total</th></tr></thead>
                <tbody className="divide-y divide-ink-50">
                  {filtered.map((b) => (
                    <tr key={b.id}><td className="py-3 font-semibold text-ink-900">{b.id}</td><td className="text-ink-600">{b.phone || "—"}</td><td className="uppercase text-ink-500">{b.source}</td><td className="text-center tabular-nums">{b.items.reduce((q, i) => q + i.qty, 0)}</td><td className="text-right font-semibold tabular-nums">{formatINR(b.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="space-y-4">
          <Card><p className="mb-3 text-sm font-bold text-ink-900">Today&apos;s Channel Split <span className="font-normal text-ink-400">(net)</span></p>{today.length === 0 ? <p className="py-6 text-center text-sm text-ink-400">No sales today.</p> : (["offline", "online", "service"] as const).map((s) => { const r = today.filter((b) => b.source === s).reduce((n, b) => n + extractGst(goods(b), rate).net, 0); return <div key={s} className="mb-3 flex items-center justify-between text-xs"><span className="uppercase text-ink-500">{s}</span><span className="font-bold tabular-nums">{formatINR(r)}</span></div>; })}</Card>
          <Card><p className="mb-3 text-sm font-bold text-ink-900">Today&apos;s Top Items</p>{today.length === 0 ? <p className="py-6 text-center text-sm text-ink-400">No items sold today.</p> : <p className="text-sm text-ink-500">{items} pcs across {today.length} bills</p>}</Card>
        </div>
      </div>
    </div>
  );
}

/* ── Coupons tab ── */
function CouponsTab({ scoped, query, setQuery }: { scoped: ReturnType<typeof usePOS.getState>["bills"]; query: string; setQuery: (v: string) => void; couponCount: number; }) {
  const used = scoped.filter((b) => b.coupon && b.discount > 0);
  const totalDisc = used.reduce((n, b) => n + b.discount, 0);
  const rows = used.filter((b) => (b.coupon || "").toLowerCase().includes(query.toLowerCase()) || b.phone.includes(query.trim()) || String(b.discount).includes(query.trim()));
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="space-y-4">
        <p className="text-lg font-bold text-ink-900">Discount Summary</p>
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Total Discounts Given</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{formatINR(totalDisc)}</p></Card>
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Discounted Orders</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{used.length}</p></Card>
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Avg Discount / Order</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{formatINR(used.length ? Math.round(totalDisc / used.length) : 0)}</p></Card>
      </div>
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-ink-900">Promo Campaign Performance</p>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search code/mobile/amount…" className="rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
        </div>
        {rows.length === 0 ? <p className="py-12 text-center text-sm text-ink-400">No coupon usage in this view.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400"><th className="py-3">Transaction ID</th><th>Customer Mobile</th><th>Coupon</th><th className="text-right">Order Total</th><th className="text-right">Discount Applied</th></tr></thead>
              <tbody className="divide-y divide-ink-50">
                {rows.map((b) => (
                  <tr key={b.id}><td className="py-3.5 font-semibold text-ink-900">{b.id}</td><td className="text-ink-600">{b.phone || "—"}</td><td className="font-semibold text-gold-600">{b.coupon}</td><td className="text-right font-semibold tabular-nums">{formatINR(b.total)}</td><td className="text-right font-semibold tabular-nums text-success">- {formatINR(b.discount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
