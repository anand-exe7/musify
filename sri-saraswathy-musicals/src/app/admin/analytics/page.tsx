"use client";
import { useEffect, useMemo, useState } from "react";
import { usePOS, useInventory, filterBills, inPeriod, productStock, type Bill, type Period, type BranchFilter, type Source } from "@/lib/store/pos";
import { useAllSales } from "@/lib/client/sales";
import { useGst, extractGst } from "@/lib/store/gst";
import { useExpenses } from "@/lib/store/expenses";
import { useBranchScope } from "@/lib/store/branch";
import { LoadingPanel, OfflinePanel } from "@/components/admin/LoadState";
import { formatINR, cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import {
  Download, FileSpreadsheet, Loader2, TrendingUp, TrendingDown, Coins, Wallet, Receipt, IndianRupee, Landmark, ShoppingBag,
  Store, Globe, Wrench, ClipboardList, Scale, MinusCircle, Search,
} from "lucide-react";
import { MonthBars } from "@/components/admin/MonthBars";
import { Segmented } from "@/components/admin/Segmented";
import { downloadXlsx, rupeesNum } from "@/lib/reports/excel";
import { fetchJson } from "@/lib/client/api";
import { useAuth } from "@/lib/store/auth";
import { isBranch, BRANCH_KEYS, branchLabel } from "@/lib/stock";
import { AdminStat, StatModal } from "@/components/admin/AdminStat";
import { Pager } from "@/components/ui/Pager";
import { usePaged } from "@/lib/client/usePaged";
import type { Invoice } from "@/types";

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
const TABS = ["revenue", "today", "sales", "products", "coupons"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  revenue: "Revenue",
  today: "Today's Sales",
  sales: "Sales Report",
  products: "Products",
  coupons: "Coupons",
};

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-ink-100 bg-ivory-50 p-5", className)}>{children}</div>;
}

/** Small heading over a group of tiles, so profit, sales and channels read as separate blocks. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-500"><span className="h-3 w-1 rounded-full bg-gold-500" />{children}</h2>;
}

/** The trend chart stacks each month by channel, in the same colours as everywhere else. */
const TREND_SERIES = [
  { key: "offline", label: "In-store", color: "#C9A24B" },
  { key: "online", label: "Online", color: "#2563EB" },
  { key: "service", label: "Service", color: "#8B5CF6" },
];
const BRANCH_COLOR = ["#0A0908", "#C9A24B", "#2563EB", "#16A34A"];

/** ANA-01: bucket a free-text payment label into a reporting mode. */
function paymentModeOf(label: string | undefined | null): "Cash" | "UPI" | "Card" | "Online" | "Other" {
  const s = (label || "").toLowerCase();
  if (s.includes("cash")) return "Cash";
  if (s.includes("upi") || s.includes("gpay") || s.includes("google pay") || s.includes("phonepe") || s.includes("paytm")) return "UPI";
  if (s.includes("card")) return "Card";
  if (s.includes("razor") || s.includes("online") || s.includes("netbank") || s.includes("bank")) return "Online";
  return "Other";
}
const PAYMODE_COLOR: Record<string, string> = { Cash: "#16A34A", UPI: "#2563EB", Card: "#C9A24B", Online: "#8B5CF6", Other: "#9CA3AF" };

/** Re-export the shared stat tile under the local name used in this file. */
const Stat = AdminStat;

export default function AnalyticsPage() {
  const { sales: bills, loading, error } = useAllSales();
  const invProducts = useInventory();
  const coupons = usePOS((s) => s.coupons);
  const gstRate = useGst((s) => s.standardRate);
  const expensesAll = useExpenses((s) => s.expenses);
  const hydrateExpenses = useExpenses((s) => s.hydrate);
  const expensesReady = useExpenses((s) => s.hydrated);

  // Branch scope: a branch user is locked to their own branch.
  const canSwitchBranch = useBranchScope((s) => s.canSwitch);
  const allowedBranches = useBranchScope((s) => s.allowed);
  const lockedBranch: BranchFilter | null =
    !canSwitchBranch && allowedBranches.length === 1 ? allowedBranches[0] : null;

  const [tab, setTab] = useState<(typeof TABS)[number]>("revenue");
  const [period, setPeriod] = useState<Period>("all");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [channel, setChannel] = useState<Source | "all">("all");
  const [salesClass, setSalesClass] = useState<SalesClass>("all");
  const [branch, setBranch] = useState<BranchFilter>(lockedBranch ?? "all");
  const [prodQuery, setProdQuery] = useState("");
  const [couponQuery, setCouponQuery] = useState("");
  const [txnQuery, setTxnQuery] = useState("");
  const [salesQuery, setSalesQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  // ANA-04 / EXP-01: expenses & vendor-bill payments linked to analytics (admin only).
  const isAdmin = useAuth((s) => s.adminAccess === "all" || Array.isArray(s.adminAccess));
  const [deductions, setDeductions] = useState<{ modes: string[]; entries: { kind: string; id: string; date: string; branch: string; mode: string; amount: number; label: string }[] } | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetchJson<NonNullable<typeof deductions>>("/api/analytics/deductions")
      .then((d) => alive && setDeductions(d))
      .catch(() => alive && setDeductions(null));
    return () => {
      alive = false;
    };
  }, [isAdmin]);

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
    const deliveryTotal = scoped.reduce((n, b) => n + Math.max(0, b.delivery || 0), 0);
    // Gross sales = total actually billed to customers (post-discount, incl. GST + delivery).
    const grossSales = scoped.reduce((n, b) => n + Math.max(0, b.total), 0);
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
    // ANA-01: billed total split by payment mode (Cash / UPI / Card / Online / Other).
    const payModeMap = new Map<string, number>();
    scoped.forEach((b) => {
      // A split bill (cash + card…) is counted under each mode for its own amount, not as "Other".
      if (b.payments && b.payments.length > 0) {
        for (const p of b.payments) {
          const k = paymentModeOf(p.method);
          payModeMap.set(k, (payModeMap.get(k) || 0) + Math.max(0, p.amount));
        }
        return;
      }
      const k = paymentModeOf(b.payment);
      payModeMap.set(k, (payModeMap.get(k) || 0) + Math.max(0, b.total));
    });
    const paymentModes = [...payModeMap.entries()].sort((a, b) => b[1] - a[1]);
    return {
      totalRevenue,
      paymentModes,
      gstCollected,
      deliveryTotal,
      grossSales,
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

  // Net revenue trend by month (respects branch + channel, ignores the period
  // filter so a whole year reads at once). Buckets are for ONE calendar year —
  // keying by month alone would add January 2025 to January 2026.
  const trendBase = useMemo(
    () =>
      filterBills(bills, { period: "all", branch, source: channel }).filter(
        (b) => salesClass === "all" || (salesClass === "gst") === isGstBill(b),
      ),
    [bills, branch, channel, salesClass],
  );
  // Every year with sales, plus this year and last year — so the year picker always has something to switch to.
  const trendYears = useMemo(() => {
    const now = new Date().getFullYear();
    return [...new Set([now, now - 1, ...trendBase.map((b) => new Date(b.createdAt).getFullYear()).filter((y) => !Number.isNaN(y))])].sort((a, b) => b - a);
  }, [trendBase]);
  const [trendYearPick, setTrendYearPick] = useState<number | null>(null);
  // Default to the latest year that has sales (else the current year).
  const trendYear = trendYearPick ?? new Date().getFullYear();
  const { monthly, monthlyCount, monthlyByChannel } = useMemo(() => {
    const totals = new Array(12).fill(0);
    const counts = new Array(12).fill(0);
    const byChannel = Array.from({ length: 12 }, () => ({ offline: 0, online: 0, service: 0 }) as Record<string, number>);
    trendBase.forEach((b) => {
      const d = new Date(b.createdAt);
      if (d.getFullYear() !== trendYear) return;
      const net = billNet(b);
      totals[d.getMonth()] += net;
      counts[d.getMonth()] += 1;
      byChannel[d.getMonth()][b.source] = (byChannel[d.getMonth()][b.source] ?? 0) + net;
    });
    return { monthly: totals, monthlyCount: counts, monthlyByChannel: byChannel };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendBase, trendYear, gstRate]);
  const yearTotal = monthly.reduce((a, b) => a + b, 0);

  // Expenses for the current period + branch → true net profit.
  const expensesInView = useMemo(
    () => expensesAll.filter((e) => (branch === "all" || e.branch === branch) && inPeriod(e.expenseDate, period, new Date(), custom)),
    [expensesAll, branch, period, custom],
  );
  const totalExpenses = expensesInView.reduce((n, e) => n + e.amount, 0);
  const expenseByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expensesInView) m.set(e.category || "Other", (m.get(e.category || "Other") ?? 0) + e.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [expensesInView]);

  // Estimated COGS: match each sold item's name to its inventory purchase cost.
  const cogs = useMemo(() => {
    const costByName = new Map(invProducts.map((p) => [p.name, p.cost ?? 0]));
    return scoped.reduce((n, b) => n + b.items.reduce((s, i) => s + (costByName.get(i.name) ?? 0) * i.qty, 0), 0);
  }, [scoped, invProducts]);

  // ANA-04: linked deductions in this period + branch, for the payment modes switched on in expense settings.
  const ded = useMemo(() => {
    const list = (deductions?.entries ?? []).filter(
      (d) => (deductions?.modes ?? []).includes(d.mode) && (branch === "all" || d.branch === branch) && inPeriod(d.date, period, new Date(), custom),
    );
    const byMode = new Map<string, number>();
    for (const d of list) {
      const k = paymentModeOf(d.mode === "BANK" ? "bank" : d.mode);
      byMode.set(k, (byMode.get(k) || 0) + d.amount);
    }
    return { list, total: list.reduce((n, d) => n + d.amount, 0), byMode };
  }, [deductions, branch, period, custom]);
  const netAfterDeductions = m.grossSales - ded.total;

  // ANA-05: CGST / SGST split of the tax collected (POS bills keep their own split; the rest is intra-state halves).
  const taxSplit = useMemo(() => {
    let cgst = 0;
    let sgst = 0;
    for (const b of scoped) {
      if (b.source === "offline" && (b.cgst !== undefined || b.sgst !== undefined)) {
        if (!b.gstEnabled) continue;
        cgst += b.cgst ?? 0;
        sgst += b.sgst ?? 0;
      } else {
        const g = billGst(b);
        const half = Math.round(g / 2);
        cgst += half;
        sgst += g - half;
      }
    }
    return { cgst, sgst };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, gstRate]);

  // ANA-05: branch-wise comparison (always across all branches the user may see, for the same period / channel).
  const byBranch = useMemo(() => {
    const base = filterBills(bills, { period, branch: "all", source: channel, custom }).filter(
      (b) => salesClass === "all" || (salesClass === "gst") === isGstBill(b),
    );
    return BRANCH_KEYS.filter((k) => !lockedBranch || k === lockedBranch).map((k) => {
      const list = base.filter((b) => b.branch === k);
      return { branch: k, count: list.length, gross: list.reduce((n, b) => n + Math.max(0, b.total), 0), net: list.reduce((n, b) => n + billNet(b), 0) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills, period, channel, custom, salesClass, lockedBranch, gstRate]);

  // ANA-02: Excel export of everything on this view (respects period, branch, channel and tax filters).
  const exportExcel = async () => {
    setExporting(true);
    try {
      const periodLabel = period === "custom" ? `${custom.from || "start"} to ${custom.to || "today"}` : (PERIODS.find((p) => p.key === period)?.label ?? period);
      const dedModes = new Map(ded.byMode);
      await downloadXlsx(`analytics-${new Date().toISOString().slice(0, 10)}`, [
        {
          name: "Summary",
          rows: [
            ["Item", "Value"],
            ["Period", periodLabel],
            ["Branch", branch === "all" ? "All branches" : branchLabel(branch)],
            ["Channel", channel === "all" ? "All channels" : channel],
            ["Tax filter", salesClass],
            ["Bills", m.count],
            ["Gross sales (₹, incl. GST + delivery)", rupeesNum(m.grossSales)],
            ["Net sales (₹, ex-GST, ex-delivery)", rupeesNum(m.totalRevenue)],
            ["GST collected (₹)", rupeesNum(m.gstCollected)],
            ["CGST (₹)", rupeesNum(taxSplit.cgst)],
            ["SGST (₹)", rupeesNum(taxSplit.sgst)],
            ["Delivery (₹)", rupeesNum(m.deliveryTotal)],
            ["Linked expenses & vendor payments (₹)", rupeesNum(ded.total)],
            ["Net sales after expenses (₹)", rupeesNum(netAfterDeductions)],
            ["All expenses in period (₹)", rupeesNum(totalExpenses)],
            ["Net profit (₹)", rupeesNum(netProfit)],
          ],
        },
        {
          name: "Payment modes",
          rows: [["Mode", "Billed (₹)", "Deducted (₹)", "Net (₹)"], ...m.paymentModes.map(([mode, v]) => [mode, rupeesNum(v), rupeesNum(dedModes.get(mode) ?? 0), rupeesNum(v - (dedModes.get(mode) ?? 0))])],
        },
        {
          name: "Branches",
          rows: [["Branch", "Bills", "Gross sales (₹)", "Net sales (₹)"], ...byBranch.map((b) => [branchLabel(b.branch), b.count, rupeesNum(b.gross), rupeesNum(b.net)])],
        },
        {
          name: "Bills",
          rows: [
            ["Date", "Bill", "Customer", "Phone", "Branch", "Channel", "Products", "Units", "Subtotal (₹)", "Discount (₹)", "GST (₹)", "Delivery (₹)", "Total (₹)", "Payment"],
            ...scoped.map((b) => [
              new Date(b.createdAt).toLocaleDateString("en-IN"), b.id, b.customerName || "", b.phone || "", branchLabel(b.branch), b.source,
              b.items.map((i) => `${i.name} × ${i.qty}`).join("; "), b.items.reduce((n, i) => n + i.qty, 0),
              rupeesNum(b.subtotal), rupeesNum(b.discount), rupeesNum(billGst(b)), rupeesNum(b.delivery || 0), rupeesNum(b.total), b.payment ?? "",
            ]),
          ],
        },
        {
          name: "Top items",
          rows: [["Item", "Units", "Net revenue (₹)"], ...m.topItems.map(([name, rev]) => [name, m.qtyByItem.get(name) ?? 0, rupeesNum(rev)])],
        },
        {
          name: "Deductions",
          rows: [["Date", "Type", "Detail", "Branch", "Mode", "Amount (₹)"], ...ded.list.map((d) => [String(d.date).slice(0, 10), d.kind === "expense" ? "Expense" : "Vendor bill", d.label, branchLabel(d.branch), d.mode, rupeesNum(d.amount)])],
        },
      ]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't create the Excel file");
    } finally {
      setExporting(false);
    }
  };

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


  // Until the sales feed resolves, show a loading (or offline) panel rather than
  // a wall of ₹0 stats that reads like the business has no sales.
  if (loading || error) {
    return (
      <div className="p-5 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink-900">Sales Analytics</h1>
          <p className="mt-1 text-sm text-ink-500">In-store, online and service sales together</p>
        </div>
        {error ? (
          <OfflinePanel hint="We couldn't load your sales data. Check your connection and refresh." />
        ) : (
          <LoadingPanel label="Loading analytics…" />
        )}
      </div>
    );
  }

  const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%");
  const signed = (n: number) => `${n < 0 ? "-" : ""}${formatINR(Math.abs(n))}`;

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Sales Analytics</h1>
          <p className="mt-1 text-sm text-ink-500">In-store, online and service sales together · cancelled bills are never counted · tap any box for its details</p>
        </div>
        {tab !== "today" && (
          <button onClick={() => void exportExcel()} disabled={exporting} className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-xs font-semibold text-ink-700 shadow-sm hover:border-gold-500 hover:text-gold-700 disabled:opacity-50 sm:self-auto">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} {exporting ? "Preparing…" : "Export to Excel"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-6 overflow-x-auto border-b border-ink-100">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("relative -mb-px whitespace-nowrap border-b-2 pb-3 text-sm font-semibold uppercase tracking-wider transition-colors", tab === t ? "border-ink-900 text-ink-900" : "border-transparent text-ink-400 hover:text-ink-700")}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* Filters — one tidy card, one row per filter */}
      <div className="mb-6 grid gap-2.5 rounded-2xl border border-ink-100 bg-ivory-50 p-4 xl:grid-cols-2">
        {tab !== "today" && (
          <div className="flex flex-wrap items-center gap-2 xl:col-span-2">
            <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS.map((p) => [p.key, p.label] as const)} />
            {period === "custom" && (
              <span className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                <input type="date" value={custom.from ?? ""} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
                →
                <input type="date" value={custom.to ?? ""} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
                <span>{scoped.length} bill(s)</span>
              </span>
            )}
          </div>
        )}
        <Segmented
          label="Channel"
          value={channel}
          onChange={setChannel}
          options={[
            ["all", "All channels"],
            ["offline", <span key="o" className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-gold-500" />In-store</span>],
            ["online", <span key="n" className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-info" />Online</span>],
            ["service", <span key="s" className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" />Service</span>],
          ] as const}
        />
        {lockedBranch ? (
          <div className="flex items-center gap-2.5"><span className="w-16 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Branch</span><span className="rounded-lg bg-gold-100 px-3 py-1.5 text-xs font-semibold text-gold-800">{branchLabel(lockedBranch)}</span></div>
        ) : (
          <Segmented label="Branch" value={branch} onChange={setBranch} options={[["all", "All branches"], ...BRANCH_KEYS.map((b) => [b, branchLabel(b)] as const)] as const} />
        )}
        <Segmented label="Tax" value={salesClass} onChange={setSalesClass} options={[["all", "All sales"], ["gst", "GST bills"], ["nongst", "Non-GST bills"]] as const} />
      </div>

      {/* ── REVENUE ── */}
      {tab === "revenue" && (
        <div className="space-y-6">
          {/* Profit & expenses */}
          <section>
            <SectionTitle>Profit &amp; expenses</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Net Profit" value={expensesReady ? signed(netProfit) : "…"} hint={expensesReady ? "Net sales − all expenses" : "Loading expenses…"} accent={netProfit >= 0 ? "green" : "danger"} icon={netProfit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                details={[{ label: "Net sales (ex-GST)", value: formatINR(m.totalRevenue), tone: "plus" }, { label: `Expenses (${expensesInView.length})`, value: `− ${formatINR(totalExpenses)}`, tone: "minus" }, { label: "Net profit", value: signed(netProfit), tone: "total" }]}
                note="Net sales are after discounts, without GST and delivery. Expenses are every expense recorded for this period and branch." />
              <Stat label="Est. Gross Profit" value={signed(grossProfit)} hint="Net sales − cost of goods sold" accent={grossProfit >= 0 ? "green" : "danger"} icon={<Coins className="h-4 w-4" />}
                details={[{ label: "Net sales (ex-GST)", value: formatINR(m.totalRevenue), tone: "plus" }, { label: "Cost of goods sold (matched)", value: `− ${formatINR(cogs)}`, tone: "minus" }, { label: "Est. gross profit", value: signed(grossProfit), tone: "total" }]}
                note="Cost is each sold product's purchase cost from Inventory, matched by name. Products with no cost entered count as zero, so this is an estimate." />
              <Stat label="Total Expenses" value={expensesReady ? formatINR(totalExpenses) : "…"} hint={expensesReady ? `${expensesInView.length} expense${expensesInView.length === 1 ? "" : "s"} · this period` : "Loading expenses…"} accent="danger" icon={<Wallet className="h-4 w-4" />}
                details={expenseByCategory.length ? [...expenseByCategory.slice(0, 8).map(([c, v]) => ({ label: c, value: formatINR(v), tone: "minus" as const })), { label: "Total", value: formatINR(totalExpenses), tone: "total" as const }] : [{ label: "No expenses in this view", value: "₹0.00", tone: "muted" }]} />
              <Card className="flex flex-col justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-500">Sales Mix <span className="normal-case tracking-normal text-ink-300">(incl. GST)</span></p>
                {(() => {
                  const tot = split.gstSales + split.nonGstSales || 1;
                  return (
                    <div className="mt-3 space-y-2.5">
                      {([["GST bills", split.gstSales, "#2563EB"], ["Non-GST bills", split.nonGstSales, "#9CA3AF"]] as const).map(([label, val, color]) => (
                        <div key={label}>
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-ink-600">{label}</span><span className="truncate tabular-nums text-ink-700">{formatINR(val)} · {Math.round((val / tot) * 100)}%</span></div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full" style={{ width: `${(val / tot) * 100}%`, background: color }} /></div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </Card>
            </div>
          </section>

          {/* How net sales is worked out — small, between the groups */}
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 rounded-xl border border-dashed border-ink-200 bg-white/60 px-4 py-2.5 text-[11px] text-ink-500">
            <span className="font-semibold uppercase tracking-wider text-ink-400">How net sales is worked out</span>
            <span className="rounded-md bg-gold-50 px-2 py-0.5 font-semibold tabular-nums text-gold-800">Billed {formatINR(m.grossSales)}</span>
            <span>−</span>
            <span className="rounded-md bg-ink-900/[0.05] px-2 py-0.5 font-semibold tabular-nums text-ink-700">Delivery {formatINR(m.deliveryTotal)}</span>
            <span>−</span>
            <span className="rounded-md bg-info/10 px-2 py-0.5 font-semibold tabular-nums text-info">GST {formatINR(m.gstCollected)}</span>
            <span>=</span>
            <span className="rounded-md bg-success/10 px-2 py-0.5 font-bold tabular-nums text-success">Net {formatINR(m.totalRevenue)}</span>
            <span className="w-full text-center text-[10px] text-ink-400 sm:w-auto">discounts already off · repair part-payments count the day they are received</span>
          </div>

          {/* Sales */}
          <section>
            <SectionTitle>Sales</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Gross Sales" value={formatINR(m.grossSales)} hint="Billed total · incl. GST + delivery" accent="gold" icon={<Receipt className="h-4 w-4" />}
                details={[{ label: "Net sales", value: formatINR(m.totalRevenue) }, { label: "GST", value: `+ ${formatINR(m.gstCollected)}` }, { label: "Delivery", value: `+ ${formatINR(m.deliveryTotal)}` }, { label: "Gross sales (billed)", value: formatINR(m.grossSales), tone: "total" }]} />
              <Stat label="Net Sales" value={formatINR(m.totalRevenue)} hint="After discounts · ex-GST · ex-delivery" accent="green" icon={<IndianRupee className="h-4 w-4" />}
                details={[{ label: "Billed total", value: formatINR(m.grossSales) }, { label: "Delivery", value: `− ${formatINR(m.deliveryTotal)}`, tone: "minus" }, { label: "GST", value: `− ${formatINR(m.gstCollected)}`, tone: "minus" }, { label: "Net sales", value: formatINR(m.totalRevenue), tone: "total" }]} />
              <Stat label="GST Collected" value={formatINR(m.gstCollected)} hint={`CGST ${formatINR(taxSplit.cgst)} · SGST ${formatINR(taxSplit.sgst)}`} accent="info" icon={<Landmark className="h-4 w-4" />}
                details={[{ label: "CGST", value: formatINR(taxSplit.cgst) }, { label: "SGST", value: formatINR(taxSplit.sgst) }, { label: "Total GST", value: formatINR(m.gstCollected), tone: "total" }]}
                note="Output tax on these sales — payable to the government, so it is not part of your revenue." />
              <Stat label="Avg Order Value" value={formatINR(m.aov)} hint="Net sales per bill" accent="ink" icon={<ShoppingBag className="h-4 w-4" />}
                details={[{ label: "Net sales", value: formatINR(m.totalRevenue) }, { label: "Bills", value: String(m.count) }, { label: "Average per bill", value: formatINR(m.aov), tone: "total" }]} />
            </div>
          </section>

          {/* By channel */}
          <section>
            <SectionTitle>By channel</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="In-store Net Sales" value={formatINR(m.offlineRev)} hint={`${m.offlineCount} POS bill${m.offlineCount === 1 ? "" : "s"} · ${pct(m.offlineRev, m.totalRevenue)} of net`} accent="gold" icon={<Store className="h-4 w-4" />}
                details={[{ label: "Bills", value: String(m.offlineCount) }, { label: "Share of net sales", value: pct(m.offlineRev, m.totalRevenue) }, { label: "In-store net sales", value: formatINR(m.offlineRev), tone: "total" }]} />
              <Stat label="Online Net Sales" value={formatINR(m.onlineRev)} hint={`${m.onlineCount} storefront order${m.onlineCount === 1 ? "" : "s"} · ${pct(m.onlineRev, m.totalRevenue)} of net`} accent="info" icon={<Globe className="h-4 w-4" />}
                details={[{ label: "Orders", value: String(m.onlineCount) }, { label: "Share of net sales", value: pct(m.onlineRev, m.totalRevenue) }, { label: "Online net sales", value: formatINR(m.onlineRev), tone: "total" }]} />
              <Stat label="Service Net Sales" value={formatINR(m.serviceRev)} hint={`${m.serviceCount} repair entr${m.serviceCount === 1 ? "y" : "ies"} · ${pct(m.serviceRev, m.totalRevenue)} of net`} accent="violet" icon={<Wrench className="h-4 w-4" />}
                details={[{ label: "Repair entries", value: String(m.serviceCount) }, { label: "Share of net sales", value: pct(m.serviceRev, m.totalRevenue) }, { label: "Service net sales", value: formatINR(m.serviceRev), tone: "total" }]}
                note="Finished repairs count in full; part payments on unfinished repairs count on the day they are received." />
              <Stat label="Completed Bills" value={String(m.count)} hint={`${m.items} item${m.items === 1 ? "" : "s"} sold`} accent="ink" icon={<ClipboardList className="h-4 w-4" />}
                details={[{ label: "In-store", value: String(m.offlineCount) }, { label: "Online", value: String(m.onlineCount) }, { label: "Service", value: String(m.serviceCount) }, { label: "Items sold", value: String(m.items) }, { label: "Total bills", value: String(m.count), tone: "total" }]} />
            </div>
          </section>

          {/* ANA-04: net view after linked expenses / vendor bills */}
          {deductions && (
            <section>
              <SectionTitle>After linked expenses &amp; vendor payments</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Net Sales after Expenses" value={signed(netAfterDeductions)} hint="Gross sales − linked expenses & vendor bills" accent={netAfterDeductions >= 0 ? "green" : "danger"} icon={<Scale className="h-4 w-4" />}
                  details={[{ label: "Gross sales", value: formatINR(m.grossSales), tone: "plus" }, { label: "Linked deductions", value: `− ${formatINR(ded.total)}`, tone: "minus" }, { label: "Net after expenses", value: signed(netAfterDeductions), tone: "total" }]} />
                <Stat label="Linked Deductions" value={formatINR(ded.total)} hint={`${ded.list.length} entr${ded.list.length === 1 ? "y" : "ies"} · modes: ${deductions.modes.join(", ") || "none"}`} accent="danger" icon={<MinusCircle className="h-4 w-4" />}
                  details={ded.byMode.size ? [...[...ded.byMode.entries()].map(([k, v]) => ({ label: k, value: `− ${formatINR(v)}`, tone: "minus" as const })), { label: "Total", value: formatINR(ded.total), tone: "total" as const }] : [{ label: "Nothing linked in this view", value: "₹0.00", tone: "muted" }]}
                  note="Expenses and vendor-bill payments switched on for analytics in Expenses → settings." />
              </div>
            </section>
          )}

          {/* Trend — compact, full width */}
          <Card>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-ink-900">Net Sales Trend <span className="font-normal text-ink-400">(ex-GST)</span></p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900">{formatINR(yearTotal)}</p>
                <p className="text-xs text-ink-500">Avg {formatINR(Math.round(yearTotal / 12))} a month · hover or tap a month</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-3 text-[11px] text-ink-500 sm:flex">
                  {TREND_SERIES.map((x) => <span key={x.key} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.color }} />{x.label}</span>)}
                </div>
                <select value={trendYear} onChange={(e) => setTrendYearPick(Number(e.target.value))} aria-label="Trend year" className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink-800 focus:border-gold-500 focus:outline-none">
                  {trendYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <MonthBars totals={monthly} parts={monthlyByChannel} series={TREND_SERIES} year={trendYear} format={formatINR} height={170} unit={(i) => `${monthlyCount[i]} bill${monthlyCount[i] === 1 ? "" : "s"}`} />
          </Card>

          {/* Breakdowns */}
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {/* ANA-01: payment-mode breakdown */}
            <Card>
              <p className="mb-4 text-sm font-bold text-ink-900">Payment Mode Split <span className="font-normal text-ink-400">(billed)</span></p>
              {m.paymentModes.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-400">No sales in this view.</p>
              ) : (
                (() => {
                  const tot = m.paymentModes.reduce((n, [, v]) => n + v, 0) || 1;
                  return m.paymentModes.map(([mode, val]) => (
                    <div key={mode} className="mb-4 last:mb-0">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-ink-500"><span className="h-2 w-2 rounded-full" style={{ background: PAYMODE_COLOR[mode] ?? PAYMODE_COLOR.Other }} />{mode}</span>
                        <span className="truncate font-bold tabular-nums text-ink-900">{formatINR(val)} <span className="font-medium text-ink-400">· {Math.round((val / tot) * 100)}%</span></span>
                      </div>
                      {(ded.byMode.get(mode) ?? 0) > 0 && (
                        <p className="mb-1 text-right text-[11px] tabular-nums text-ink-500"><span className="text-danger">− {formatINR(ded.byMode.get(mode) ?? 0)}</span> expenses = <b className="text-ink-800">{formatINR(val - (ded.byMode.get(mode) ?? 0))}</b></p>
                      )}
                      <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                        <div className="h-full rounded-full" style={{ width: `${(val / tot) * 100}%`, background: PAYMODE_COLOR[mode] ?? PAYMODE_COLOR.Other }} />
                      </div>
                    </div>
                  ));
                })()
              )}
            </Card>
            {/* ANA-05: branch-wise comparison */}
            <Card>
              <p className="mb-4 text-sm font-bold text-ink-900">Branch Comparison <span className="font-normal text-ink-400">(net sales)</span></p>
              {(() => {
                const top = Math.max(1, ...byBranch.map((b) => b.net));
                return byBranch.map((b, i) => (
                  <div key={b.branch} className="mb-4 last:mb-0">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold uppercase tracking-wider text-ink-500">{branchLabel(b.branch)} <span className="font-medium normal-case tracking-normal text-ink-400">· {b.count} bill{b.count === 1 ? "" : "s"}</span></span>
                      <span className="truncate font-bold tabular-nums text-ink-900">{formatINR(b.net)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full" style={{ width: `${(b.net / top) * 100}%`, background: BRANCH_COLOR[i % BRANCH_COLOR.length] }} />
                    </div>
                  </div>
                ));
              })()}
            </Card>
            <Card>
              <p className="mb-4 text-sm font-bold text-ink-900">Order Source <span className="font-normal text-ink-400">(net sales)</span></p>
              {([["In-store", m.offlineRev, m.offlineCount, "#C9A24B"], ["Online", m.onlineRev, m.onlineCount, "#2563EB"], ["Service", m.serviceRev, m.serviceCount, "#8B5CF6"]] as const).map(([label, rev, cnt, color]) => (
                <div key={label} className="mb-4 last:mb-0">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wider text-ink-500">{label} <span className="font-medium normal-case tracking-normal text-ink-400">· {cnt}</span></span>
                    <span className="truncate font-bold tabular-nums text-ink-900">{formatINR(rev)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full" style={{ width: `${m.totalRevenue ? (rev / m.totalRevenue) * 100 : 0}%`, background: color }} />
                  </div>
                </div>
              ))}
            </Card>
            <Card>
              <p className="mb-3 text-sm font-bold text-ink-900">Top Items <span className="font-normal text-ink-400">(net revenue)</span></p>
              <ol className="space-y-2.5 text-sm">
                {m.topItems.slice(0, 5).map(([name, rev], i) => (
                  <li key={name} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-ink-700"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold-100 text-[10px] font-bold text-gold-800">{i + 1}</span><span className="truncate">{name}</span></span>
                    <span className="shrink-0 font-bold tabular-nums text-ink-900">{formatINR(rev)}</span>
                  </li>
                ))}
                {m.topItems.length === 0 && <li className="text-ink-400">No sales in this view.</li>}
              </ol>
            </Card>
          </div>
        </div>
      )}

      {/* ── TODAY'S SALES ── */}
      {tab === "today" && <TodayTab bills={bills} branch={branch} channel={channel} query={txnQuery} setQuery={setTxnQuery} rate={gstRate} />}

      {/* ── SALES REPORT ── */}
      {tab === "sales" && <SalesTab scoped={scoped} query={salesQuery} setQuery={setSalesQuery} billGst={billGst} rate={gstRate} />}

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
        <Stat label="Today's Net Sales" value={formatINR(rev)} hint="Ex-GST · today" accent="green" />
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

/* ── Sales report tab ── */
function SalesTab({ scoped, query, setQuery, billGst, rate }: { scoped: Bill[]; query: string; setQuery: (v: string) => void; billGst: (b: Bill) => number; rate: number }) {
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // Tax invoices keyed by the bill/order they were raised for, so each row shows its branch number and GST number.
  const [invByRef, setInvByRef] = useState<Record<string, Invoice>>({});
  useEffect(() => {
    let alive = true;
    fetch("/api/invoices")
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((data: Invoice[]) => {
        if (!alive || !Array.isArray(data)) return;
        const m: Record<string, Invoice> = {};
        for (const inv of data) if (inv.refId) m[inv.refId] = inv;
        setInvByRef(m);
      });
    return () => { alive = false; };
  }, []);
  const refOf = (b: Bill) => invByRef[b.id]?.reference || b.id;
  const gstNoOf = (b: Bill) => invByRef[b.id]?.number ?? "";

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = q
      ? scoped.filter(
          (b) =>
            b.id.toLowerCase().includes(q) ||
            (invByRef[b.id]?.reference ?? "").toLowerCase().includes(q) ||
            (invByRef[b.id]?.number ?? "").toLowerCase().includes(q) ||
            (b.customerName || "").toLowerCase().includes(q) ||
            b.phone.includes(query.trim()) ||
            (b.customerGstin || "").toLowerCase().includes(q) ||
            b.items.some((i) => i.name.toLowerCase().includes(q)),
        )
      : scoped;
    return [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [scoped, q, query, invByRef]);
  const pg = usePaged(rows, query);

  const totals = useMemo(() => {
    let subtotal = 0, discount = 0, gst = 0, delivery = 0, total = 0, units = 0;
    for (const b of rows) {
      subtotal += b.subtotal;
      discount += b.discount;
      gst += billGst(b);
      delivery += b.delivery;
      total += b.total;
      units += b.items.reduce((n, i) => n + i.qty, 0);
    }
    return { subtotal, discount, gst, delivery, total, units };
  }, [rows, billGst]);

  const r2 = (paise: number) => (paise / 100).toFixed(2);
  /** One line of a bill: what the customer paid for it (after its own discount) and the GST inside that. */
  const lineAmounts = (b: Bill, i: Bill["items"][number]) => {
    const gross = Math.max(0, i.price * i.qty - (i.discount ?? 0));
    const lineRate = i.gstRate === null ? 0 : (i.gstRate ?? (b.source === "offline" && !b.gstEnabled ? 0 : rate));
    return { gross, gst: extractGst(gross, lineRate).gst, lineRate };
  };

  // Bill-wise: one row per bill, its products listed in one cell.
  const exportBills = () => {
    const head = ["Date", "Invoice", "Tax invoice no.", "Customer", "Phone", "GSTIN", "Branch", "Source", "Products", "Units", "Subtotal", "Discount", "GST", "Delivery", "Total", "Payment", "Status"];
    const body = rows.map((b) => [
      fmtDate(b.createdAt), refOf(b), gstNoOf(b), b.customerName || "", b.phone || "", b.customerGstin || "", branchLabel(b.branch), b.source,
      b.items.map((i) => `${i.name} × ${i.qty}`).join("; "), String(b.items.reduce((n, i) => n + i.qty, 0)),
      r2(b.subtotal), r2(b.discount), r2(billGst(b)), r2(b.delivery), r2(b.total), b.payment ?? "", b.status,
    ]);
    downloadCsv(`sales-report-bills-${Date.now()}.csv`, [head, ...body]);
  };
  // Product-wise: one row per product sold, with the customer repeated on each — ready to sort or pivot.
  const exportItems = () => {
    const head = ["Date", "Invoice", "Tax invoice no.", "Customer", "Phone", "GSTIN", "Branch", "Source", "Product", "HSN", "Qty", "Rate", "MRP", "Line discount", "GST %", "GST", "Line amount", "Payment", "Status"];
    const body = rows.flatMap((b) =>
      b.items.map((i) => {
        const a = lineAmounts(b, i);
        return [fmtDate(b.createdAt), refOf(b), gstNoOf(b), b.customerName || "", b.phone || "", b.customerGstin || "", branchLabel(b.branch), b.source,
          i.name, i.hsn ?? "", String(i.qty), r2(i.price), i.mrp ? r2(i.mrp) : "", r2(i.discount ?? 0), String(a.lineRate), r2(a.gst), r2(a.gross), b.payment ?? "", b.status];
      }),
    );
    downloadCsv(`sales-report-products-${Date.now()}.csv`, [head, ...body]);
  };

  const [openBill, setOpenBill] = useState<Bill | null>(null);
  const btn = "flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 text-sm font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-700 disabled:cursor-not-allowed disabled:opacity-50";
  const SRC: Record<string, { label: string; tone: string }> = {
    offline: { label: "In-store", tone: "bg-gold-100 text-gold-800" },
    online: { label: "Online", tone: "bg-info/10 text-info" },
    service: { label: "Service", tone: "bg-[#8B5CF6]/10 text-[#6D28D9]" },
  };
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const th = "px-3 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400";

  return (
    <div className="space-y-4">
      {openBill && (
        <StatModal
          label={`${refOf(openBill)}${gstNoOf(openBill) ? ` · ${gstNoOf(openBill)}` : ""}`}
          value={formatINR(openBill.total)}
          hint={`${openBill.customerName || "Walk-in"}${openBill.phone ? ` · ${openBill.phone}` : ""} · ${day(openBill.createdAt)} ${time(openBill.createdAt)} · ${branchLabel(openBill.branch)} · ${SRC[openBill.source]?.label ?? openBill.source}`}
          accent="gold"
          details={[
            ...openBill.items.map((i) => ({ label: `${i.name} × ${i.qty}${i.discount ? ` (− ${formatINR(i.discount)})` : ""}`, value: formatINR(Math.max(0, i.price * i.qty - (i.discount ?? 0))) })),
            { label: "Subtotal", value: formatINR(openBill.subtotal), tone: "muted" as const },
            ...(openBill.discount ? [{ label: `Discount${openBill.coupon ? ` (${openBill.coupon})` : ""}`, value: `− ${formatINR(openBill.discount)}`, tone: "minus" as const }] : []),
            ...(billGst(openBill) ? [{ label: "GST (included)", value: formatINR(billGst(openBill)), tone: "muted" as const }] : []),
            ...(openBill.delivery ? [{ label: "Delivery", value: `+ ${formatINR(openBill.delivery)}` }] : []),
            { label: "Total", value: formatINR(openBill.total), tone: "total" as const },
          ]}
          note={<>Paid by <b className="text-ink-700">{openBill.payments?.length ? openBill.payments.map((p) => `${p.method.charAt(0) + p.method.slice(1).toLowerCase()} ${formatINR(p.amount)}`).join(" + ") : openBill.payment || "—"}</b>{openBill.customerGstin ? <> · Customer GSTIN <span className="font-mono">{openBill.customerGstin}</span></> : null}</>}
          onClose={() => setOpenBill(null)}
        />
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {([
          ["Bills", String(rows.length), "text-ink-900"],
          ["Units sold", String(totals.units), "text-ink-900"],
          ["Total billed", formatINR(totals.total), "text-gold-700"],
          ["Discounts", formatINR(totals.discount), "text-danger"],
          ["GST inside", formatINR(totals.gst), "text-info"],
        ] as const).map(([l, v, tone]) => (
          <div key={l} className="min-w-0 rounded-xl border border-ink-100 bg-ivory-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">{l}</p>
            <p className={cn("mt-1 truncate text-lg font-bold tabular-nums", tone)} title={v}>{v}</p>
          </div>
        ))}
      </div>

      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold text-ink-900">Sales Report</p>
            <p className="mt-0.5 text-xs text-ink-500">Every bill in the current filters · click a row for its full breakdown</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Invoice, customer, phone, GSTIN, product…" className="h-10 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none sm:w-80" />
            </div>
            <button onClick={exportBills} disabled={rows.length === 0} className={btn} title="One row per bill, with its products in one cell"><Download className="h-4 w-4" /> Bills CSV</button>
            <button onClick={exportItems} disabled={rows.length === 0} className={btn} title="One row per product sold, with the customer on every row"><Download className="h-4 w-4" /> Products CSV</button>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="py-14 text-center text-sm text-ink-400">No sales match the current filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-[#F4F1EA]/60">
                  <tr className="text-left">
                    <th className={cn(th, "pl-4")}>Date</th>
                    <th className={th}>Invoice</th>
                    <th className={th}>Customer</th>
                    <th className={cn(th, "w-full")}>Products</th>
                    <th className={th}>Branch</th>
                    <th className={th}>Payment</th>
                    <th className={cn(th, "text-right")}>Discount</th>
                    <th className={cn(th, "text-right")}>GST</th>
                    <th className={cn(th, "pr-4 text-right")}>Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100/70">
                  {pg.items.map((b) => {
                    const src = SRC[b.source] ?? { label: b.source, tone: "bg-ink-100 text-ink-600" };
                    return (
                      <tr key={b.id} onClick={() => setOpenBill(b)} className="cursor-pointer align-top text-ink-800 transition-colors hover:bg-[#FAF7EF] [&>td]:px-3 [&>td]:py-3">
                        <td className="whitespace-nowrap !pl-4">
                          <p className="font-medium text-ink-800">{day(b.createdAt)}</p>
                          <p className="text-[11px] text-ink-400">{time(b.createdAt)}</p>
                        </td>
                        <td className="whitespace-nowrap">
                          <p className="font-semibold text-ink-900">{refOf(b)}</p>
                          {gstNoOf(b) && <p className="text-[11px] text-ink-400">{gstNoOf(b)}</p>}
                        </td>
                        <td className="max-w-[11rem]">
                          <p className="truncate font-medium text-ink-900">{b.customerName || <span className="text-ink-300">Walk-in</span>}</p>
                          <p className="text-[11px] text-ink-500">{b.phone || "—"}</p>
                        </td>
                        <td className="min-w-[16rem]">
                          <ul className="space-y-0.5">
                            {b.items.slice(0, 2).map((i, k) => (
                              <li key={k} className="flex items-baseline justify-between gap-3 text-[12px]">
                                <span className="min-w-0 truncate text-ink-800">{i.name} <span className="font-semibold text-ink-400">× {i.qty}</span></span>
                                <span className="shrink-0 tabular-nums text-ink-500">{formatINR(Math.max(0, i.price * i.qty - (i.discount ?? 0)))}</span>
                              </li>
                            ))}
                            {b.items.length > 2 && <li className="text-[11px] font-semibold text-gold-700">+ {b.items.length - 2} more</li>}
                          </ul>
                        </td>
                        <td className="whitespace-nowrap">
                          <p className="text-[12px] text-ink-700">{branchLabel(b.branch)}</p>
                          <span className={cn("mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", src.tone)}>{src.label}</span>
                        </td>
                        <td className="whitespace-nowrap"><span className="rounded-md bg-ink-900/[0.05] px-2 py-0.5 text-[11px] font-semibold capitalize text-ink-600">{(b.payment || "—").toLowerCase()}</span></td>
                        <td className="whitespace-nowrap text-right tabular-nums">{b.discount ? <span className="text-danger">− {formatINR(b.discount)}</span> : <span className="text-ink-300">—</span>}</td>
                        <td className="whitespace-nowrap text-right tabular-nums text-ink-600">{billGst(b) ? formatINR(billGst(b)) : <span className="text-ink-300">—</span>}</td>
                        <td className="whitespace-nowrap !pr-4 text-right text-base font-bold tabular-nums text-ink-900">{formatINR(b.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-200 bg-[#F4F1EA]/60 font-bold text-ink-900 [&>td]:px-3 [&>td]:py-3">
                    <td className="!pl-4 text-[10px] uppercase tracking-wider text-ink-500" colSpan={6}>Totals · {rows.length} bill(s), {totals.units} unit(s){totals.delivery ? ` · delivery ${formatINR(totals.delivery)}` : ""}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-danger">{totals.discount ? `− ${formatINR(totals.discount)}` : "—"}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-ink-700">{formatINR(totals.gst)}</td>
                    <td className="whitespace-nowrap !pr-4 text-right tabular-nums">{formatINR(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-4 pb-4"><Pager className="mt-3" {...pg.pager} /></div>
          </>
        )}
      </Card>
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
