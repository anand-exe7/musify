"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Receipt, Save, RotateCcw, MapPin, ArrowLeftRight, Building2, Info, FileText, ArrowRight, Download } from "lucide-react";
import { useGst, IN_STATES } from "@/lib/store/gst";
import { inPeriod, type Period, type BranchFilter } from "@/lib/store/pos";
import { useBranchScope } from "@/lib/store/branch";
import { buildGstr1, MONTHS, type Period as ReportRange } from "@/lib/gst/report";
import { rateWiseSummary, invoiceRateOf, toCsv } from "@/lib/gst/summary";
import type { Invoice } from "@/types";
import { formatINR, cn } from "@/lib/utils";

type Tab = "rules" | "collections" | "returns";

const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
];

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-ink-100 bg-ivory-50 p-5", className)}>{children}</div>;
}

export default function GstPage() {
  const gst = useGst();
  const [tab, setTab] = useState<Tab>("rules");

  // local draft for the config form
  const [draft, setDraft] = useState({
    homeState: gst.homeState,
    cgstLabel: gst.cgstLabel,
    sgstLabel: gst.sgstLabel,
    igstLabel: gst.igstLabel,
    standardRate: gst.standardRate,
    placeOfSupplyEnabled: gst.placeOfSupplyEnabled,
  });
  const [saved, setSaved] = useState(false);
  const dirty =
    draft.homeState !== gst.homeState || draft.cgstLabel !== gst.cgstLabel || draft.sgstLabel !== gst.sgstLabel ||
    draft.igstLabel !== gst.igstLabel || draft.standardRate !== gst.standardRate || draft.placeOfSupplyEnabled !== gst.placeOfSupplyEnabled;

  const save = () => {
    gst.set({ ...draft, standardRate: Number(draft.standardRate) || 0 });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const half = (Number(draft.standardRate) || 0) / 2;
  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="p-5 md:p-8">
      {saved && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">GST settings saved · live on storefront</div>
      )}

      {/* Header */}
      <div className="mb-6 border-l-4 border-ink-900 pl-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900"><Receipt className="h-6 w-6 text-gold-600" /> GST &amp; Tax</h1>
        <p className="mt-1 text-sm text-ink-500">Configure place-of-supply tax · updates the customer cart &amp; invoices instantly</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-6 border-b border-ink-100">
        {(["rules", "collections", "returns"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("relative -mb-px border-b-2 pb-3 text-sm font-semibold uppercase tracking-wider transition-colors",
              tab === t ? "border-ink-900 text-ink-900" : "border-transparent text-ink-400 hover:text-ink-700")}>
            {t === "rules" ? "Tax Rules" : t === "collections" ? "GST Collections" : "Returns"}
          </button>
        ))}
      </div>

      {tab === "returns" ? (
        <ReturnsTab rate={gst.standardRate} homeState={gst.homeState} />
      ) : tab === "rules" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Config */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-900">Configuration</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setDraft({ homeState: gst.homeState, cgstLabel: gst.cgstLabel, sgstLabel: gst.sgstLabel, igstLabel: gst.igstLabel, standardRate: gst.standardRate, placeOfSupplyEnabled: gst.placeOfSupplyEnabled })} disabled={!dirty} className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5 disabled:opacity-40" title="Revert"><RotateCcw className="h-4 w-4" /></button>
                <button onClick={save} disabled={!dirty} className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ivory-50 hover:bg-ink-800 disabled:opacity-40"><Save className="h-3.5 w-3.5" /> Save</button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className={label}>Seller&apos;s Home State</label>
                <select value={draft.homeState} onChange={(e) => setDraft((d) => ({ ...d, homeState: e.target.value }))} className={field}>
                  {IN_STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-ink-400">Sales to this state are intra-state ({draft.cgstLabel}+{draft.sgstLabel}); all others are inter-state ({draft.igstLabel}).</p>
              </div>

              <div>
                <label className={label}>Standard GST Slab (%)</label>
                <input type="number" value={draft.standardRate || ""} onChange={(e) => setDraft((d) => ({ ...d, standardRate: Number(e.target.value) }))} className={field} placeholder="18" />
                <p className="mt-1 text-[11px] text-ink-400">Default rate used for POS &amp; reports. Product listings keep their own HSN rate.</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div><label className={label}>Intra label A</label><input value={draft.cgstLabel} onChange={(e) => setDraft((d) => ({ ...d, cgstLabel: e.target.value }))} className={field} /></div>
                <div><label className={label}>Intra label B</label><input value={draft.sgstLabel} onChange={(e) => setDraft((d) => ({ ...d, sgstLabel: e.target.value }))} className={field} /></div>
                <div><label className={label}>Inter label</label><input value={draft.igstLabel} onChange={(e) => setDraft((d) => ({ ...d, igstLabel: e.target.value }))} className={field} /></div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-ink-100 bg-[#FAF7EF] px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-ink-900">Show place-of-supply to customers</p>
                  <p className="text-xs text-ink-500">{draft.placeOfSupplyEnabled ? "Cart asks for delivery state" : "Cart shows a single GST line"}</p>
                </div>
                <button onClick={() => setDraft((d) => ({ ...d, placeOfSupplyEnabled: !d.placeOfSupplyEnabled }))} className={cn("relative h-6 w-11 rounded-full transition-colors", draft.placeOfSupplyEnabled ? "bg-success" : "bg-ink-300")}>
                  <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", draft.placeOfSupplyEnabled ? "left-[22px]" : "left-0.5")} />
                </button>
              </div>
            </div>
          </Card>

          {/* Profiles + preview */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gold-300 bg-gold-50/40 p-5">
                <div className="flex items-center gap-2 text-gold-700"><Building2 className="h-4 w-4" /><p className="text-xs font-bold uppercase tracking-wider">In-state</p></div>
                <p className="mt-2 text-sm font-semibold text-ink-900">{draft.homeState}</p>
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-ink-600"><span>{draft.cgstLabel}</span><span className="font-semibold tabular-nums">{half}%</span></div>
                  <div className="flex justify-between text-ink-600"><span>{draft.sgstLabel}</span><span className="font-semibold tabular-nums">{half}%</span></div>
                  <div className="flex justify-between border-t border-gold-200 pt-1 font-bold text-ink-900"><span>Total</span><span className="tabular-nums">{draft.standardRate}%</span></div>
                </div>
              </div>
              <div className="rounded-2xl border border-info/30 bg-info/5 p-5">
                <div className="flex items-center gap-2 text-info"><ArrowLeftRight className="h-4 w-4" /><p className="text-xs font-bold uppercase tracking-wider">Inter-state</p></div>
                <p className="mt-2 text-sm font-semibold text-ink-900">All other states</p>
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-ink-600"><span>{draft.igstLabel}</span><span className="font-semibold tabular-nums">{draft.standardRate}%</span></div>
                  <div className="flex justify-between border-t border-info/20 pt-1 font-bold text-ink-900"><span>Total</span><span className="tabular-nums">{draft.standardRate}%</span></div>
                </div>
              </div>
            </div>

            {/* Live preview */}
            <Card>
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><MapPin className="h-4 w-4 text-gold-600" /> Live preview · on ₹10,000 taxable</p>
              <PreviewTable rate={Number(draft.standardRate) || 0} labels={draft} />
            </Card>

            <div className="flex items-start gap-2 rounded-xl border border-ink-100 bg-[#FAF7EF] p-4 text-xs text-ink-500">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              <p>Same-state supply splits into {draft.cgstLabel} + {draft.sgstLabel} (half each); inter-state supply is a single {draft.igstLabel} at the full rate. The customer picks their delivery state in the cart and the invoice follows automatically.</p>
            </div>
          </div>
        </div>
      ) : (
        <CollectionsTab labels={gst} />
      )}
    </div>
  );
}

function PreviewTable({ rate, labels }: { rate: number; labels: { cgstLabel: string; sgstLabel: string; igstLabel: string } }) {
  const base = 1000000; // ₹10,000 in paise — illustrative base for the preview
  const gst = (base * rate) / 100;
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="rounded-lg bg-gold-50/60 p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gold-700">In-state buyer</p>
        <div className="flex justify-between text-ink-600"><span>{labels.cgstLabel}</span><span className="tabular-nums">{formatINR(gst / 2)}</span></div>
        <div className="flex justify-between text-ink-600"><span>{labels.sgstLabel}</span><span className="tabular-nums">{formatINR(gst / 2)}</span></div>
        <div className="mt-1 flex justify-between border-t border-gold-200 pt-1 font-bold text-ink-900"><span>Payable</span><span className="tabular-nums">{formatINR(base + gst)}</span></div>
      </div>
      <div className="rounded-lg bg-info/5 p-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-info">Other-state buyer</p>
        <div className="flex justify-between text-ink-600"><span>{labels.igstLabel}</span><span className="tabular-nums">{formatINR(gst)}</span></div>
        <div className="flex justify-between text-ink-600"><span>&nbsp;</span><span>&nbsp;</span></div>
        <div className="mt-1 flex justify-between border-t border-info/20 pt-1 font-bold text-ink-900"><span>Payable</span><span className="tabular-nums">{formatINR(base + gst)}</span></div>
      </div>
    </div>
  );
}

function CollectionsTab({ labels }: { labels: { cgstLabel: string; sgstLabel: string; igstLabel: string } }) {
  const [period, setPeriod] = useState<Period>("month");
  const [branch, setBranch] = useState<BranchFilter>("all");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Branch users are pinned to their own branch.
  const canSwitch = useBranchScope((s) => s.canSwitch);
  const scopeAccess = useBranchScope((s) => s.access);
  const lockedBranch: BranchFilter | null =
    !canSwitch && (scopeAccess === "Branch 1" || scopeAccess === "Branch 2") ? scopeAccess : null;
  useEffect(() => {
    if (lockedBranch) setBranch(lockedBranch);
  }, [lockedBranch]);

  useEffect(() => {
    let alive = true;
    fetch("/api/invoices")
      .then((r) => { if (!r.ok) throw new Error("invoices"); return r.json(); })
      .then((d) => { if (!alive) return; setInvoices(Array.isArray(d) ? d : []); setStatus("ready"); })
      .catch(() => { if (alive) setStatus("error"); });
    return () => { alive = false; };
  }, []);

  const scoped = useMemo(
    () =>
      invoices.filter(
        (inv) => (branch === "all" || inv.branch === branch) && inPeriod(inv.date, period),
      ),
    [invoices, branch, period],
  );
  const { buckets, totals } = useMemo(() => rateWiseSummary(scoped), [scoped]);

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? period;

  const exportCsv = () => {
    const branchLabel = branch === "all" ? "All-Branches" : branch;
    // CSV money columns are in rupees (paise ÷ 100), 2 decimals — matches filings.
    const r2 = (paise: number) => (paise / 100).toFixed(2);
    const header: (string | number)[][] = [
      [`GST Summary — ${branchLabel} — ${periodLabel}`],
      [`Generated`, new Date().toLocaleString("en-IN")],
      [],
      ["Rate-wise summary"],
      ["GST Rate %", "Invoices", "Taxable Value", labels.cgstLabel, labels.sgstLabel, labels.igstLabel, "Total Tax", "Invoice Value"],
      ...buckets.map((b) => [b.rate, b.count, r2(b.taxable), r2(b.cgst), r2(b.sgst), r2(b.igst), r2(b.tax), r2(b.invoiceValue)]),
      ["Total", totals.count, r2(totals.taxable), r2(totals.cgst), r2(totals.sgst), r2(totals.igst), r2(totals.tax), r2(totals.invoiceValue)],
      [],
      ["Invoice-wise detail"],
      ["Invoice No", "Date", "Branch", "Customer", "Source", "GST Rate %", "Taxable", labels.cgstLabel, labels.sgstLabel, labels.igstLabel, "Total"],
      ...scoped.map((inv) => [
        inv.number, inv.date, inv.branch, inv.customer, inv.source ?? "", invoiceRateOf(inv),
        r2(inv.subtotal), r2(inv.cgst || 0), r2(inv.sgst || 0), r2(inv.igst || 0), r2(inv.total),
      ]),
    ];
    const blob = new Blob([toCsv(header)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gst-summary-${branchLabel}-${period}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const pill = "rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all";

  return (
    <div className="space-y-6">
      {/* filters + export */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Period</span>
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className={cn(pill, period === p.key ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900")}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Branch</span>
          {lockedBranch ? (
            <span className={cn(pill, "bg-gold-500 text-ink-900")}>{lockedBranch}</span>
          ) : (
            (["all", "Branch 1", "Branch 2"] as BranchFilter[]).map((b) => (
              <button key={b} onClick={() => setBranch(b)} className={cn(pill, branch === b ? "bg-gold-500 text-ink-900" : "text-ink-500 hover:text-ink-900")}>{b === "all" ? "Overall" : b}</button>
            ))
          )}
        </div>
        <button
          onClick={exportCsv}
          disabled={status !== "ready" || scoped.length === 0}
          className="ml-auto flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-ivory-50 transition-colors hover:bg-ink-800 disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {status === "error" && <p className="text-xs text-danger">Couldn&apos;t reach the server to load the ledger.</p>}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Taxable Value</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900 md:text-3xl">{formatINR(totals.taxable)}</p><p className="mt-1 text-xs text-ink-400">Net of GST · {totals.count} invoices</p></Card>
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">GST Collected</p><p className="mt-2 text-2xl font-bold tabular-nums text-gold-600 md:text-3xl">{formatINR(totals.tax)}</p><p className="mt-1 text-xs text-ink-400">Total output tax</p></Card>
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">{labels.cgstLabel} + {labels.sgstLabel}</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900 md:text-3xl">{formatINR(totals.cgst + totals.sgst)}</p><p className="mt-1 text-xs text-ink-400">Intra-state</p></Card>
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">{labels.igstLabel}</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900 md:text-3xl">{formatINR(totals.igst)}</p><p className="mt-1 text-xs text-ink-400">Inter-state</p></Card>
      </div>

      {/* Rate-wise breakdown */}
      <Card>
        <p className="mb-4 text-sm font-bold text-ink-900">GST Summary by Rate <span className="font-normal text-ink-400">· {branch === "all" ? "all branches" : branch} · {periodLabel}</span></p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                <th className="py-3">GST Rate</th><th className="text-center">Invoices</th><th className="text-right">Taxable Value</th><th className="text-right">{labels.cgstLabel}</th><th className="text-right">{labels.sgstLabel}</th><th className="text-right">{labels.igstLabel}</th><th className="text-right">Total Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {buckets.map((b) => (
                <tr key={b.rate} className="text-ink-800">
                  <td className="py-3.5 font-semibold text-ink-900">{b.rate === 0 ? "Non-GST / 0%" : `${b.rate}%`}</td>
                  <td className="text-center tabular-nums text-ink-500">{b.count}</td>
                  <td className="text-right tabular-nums">{formatINR(b.taxable)}</td>
                  <td className="text-right tabular-nums">{formatINR(b.cgst)}</td>
                  <td className="text-right tabular-nums">{formatINR(b.sgst)}</td>
                  <td className="text-right tabular-nums">{formatINR(b.igst)}</td>
                  <td className="text-right font-semibold tabular-nums text-gold-600">{formatINR(b.tax)}</td>
                </tr>
              ))}
              {buckets.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-sm text-ink-400">No invoices in this view.</td></tr>}
            </tbody>
            {buckets.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-ink-200 font-bold text-ink-900">
                  <td className="py-3.5">Total</td>
                  <td className="text-center tabular-nums">{totals.count}</td>
                  <td className="text-right tabular-nums">{formatINR(totals.taxable)}</td>
                  <td className="text-right tabular-nums">{formatINR(totals.cgst)}</td>
                  <td className="text-right tabular-nums">{formatINR(totals.sgst)}</td>
                  <td className="text-right tabular-nums">{formatINR(totals.igst)}</td>
                  <td className="text-right tabular-nums text-gold-600">{formatINR(totals.tax)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-3 text-[11px] text-ink-400">Sourced from the invoice ledger across all channels (POS, web, service). Each invoice is bucketed by its GST slab; taxable value is net of tax.</p>
      </Card>
    </div>
  );
}

/* ─────────────────────────  Returns (GSTR-1 / 3B)  ───────────────────────── */

function ReturnsTab({ rate, homeState }: { rate: number; homeState: string }) {
  const now = new Date();
  const [fromY, setFromY] = useState(now.getFullYear());
  const [fromM, setFromM] = useState(now.getMonth());
  const [toY, setToY] = useState(now.getFullYear());
  const [toM, setToM] = useState(now.getMonth());

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    fetch("/api/invoices")
      .then((r) => { if (!r.ok) throw new Error("invoices"); return r.json(); })
      .then((d) => { if (!alive) return; setInvoices(Array.isArray(d) ? d : []); setStatus("ready"); })
      .catch(() => { if (alive) setStatus("error"); });
    return () => { alive = false; };
  }, []);

  const range: ReportRange = { fromYear: fromY, fromMonth: fromM, toYear: toY, toMonth: toM };
  const g1 = useMemo(
    () => buildGstr1(invoices, range, { standardRate: rate, homeState }),
    [invoices, fromY, fromM, toY, toM, rate, homeState],
  );

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i);
  const qs = new URLSearchParams({ fy: String(fromY), fm: String(fromM), ty: String(toY), tm: String(toM) });
  const link = (type: "gstr1" | "gstr3b") => `/admin/gst/report?type=${type}&${qs.toString()}`;

  const field = "rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const lbl = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="space-y-6">
      {/* Period picker */}
      <Card>
        <p className="mb-4 flex items-center gap-2 text-sm font-bold text-ink-900"><FileText className="h-4 w-4 text-gold-600" /> Return period</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className={lbl}>From</span>
            <div className="flex gap-2">
              <select value={fromM} onChange={(e) => setFromM(Number(e.target.value))} className={field}>
                {MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
              </select>
              <select value={fromY} onChange={(e) => setFromY(Number(e.target.value))} className={field}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div>
            <span className={lbl}>To</span>
            <div className="flex gap-2">
              <select value={toM} onChange={(e) => setToM(Number(e.target.value))} className={field}>
                {MONTHS.map((mo, i) => <option key={mo} value={i}>{mo}</option>)}
              </select>
              <select value={toY} onChange={(e) => setToY(Number(e.target.value))} className={field}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-ink-400">Returns cover the whole GSTIN across both branches. Figures come from the invoice ledger; tax is extracted from GST-inclusive invoice values.</p>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Invoices in period</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900 md:text-3xl">{status === "ready" ? g1.sales.length : status === "loading" ? "…" : "—"}</p>
          <p className="mt-1 text-xs text-ink-400">Outward supplies</p>
        </Card>
        <Card>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Taxable value</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900 md:text-3xl">{status === "ready" ? formatINR(g1.totals.taxableValue) : status === "loading" ? "…" : "—"}</p>
          <p className="mt-1 text-xs text-ink-400">Net of GST</p>
        </Card>
        <Card>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Tax payable</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-gold-600 md:text-3xl">{status === "ready" ? formatINR(g1.totals.integratedTax + g1.totals.centralTax + g1.totals.stateTax) : status === "loading" ? "…" : "—"}</p>
          <p className="mt-1 text-xs text-ink-400">IGST + CGST + SGST</p>
        </Card>
      </div>

      {/* Export cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ReturnCard
          title="GSTR-1"
          desc="Outward supplies — invoice-wise sales & sale returns."
          href={link("gstr1")}
          disabled={status !== "ready"}
        />
        <ReturnCard
          title="GSTR-3B"
          desc="Summary return — outward supplies, ITC & exempt supplies."
          href={link("gstr3b")}
          disabled={status !== "ready"}
        />
      </div>

      {status === "error" && (
        <p className="text-center text-xs text-danger">Couldn&apos;t reach the server to load the ledger.</p>
      )}
    </div>
  );
}

function ReturnCard({ title, desc, href, disabled }: { title: string; desc: string; href: string; disabled: boolean }) {
  const body = (
    <div className={cn(
      "group flex items-center justify-between rounded-2xl border border-ink-100 bg-ivory-50 p-5 transition-all",
      disabled ? "opacity-50" : "hover:border-gold-400 hover:shadow-card",
    )}>
      <div className="flex items-center gap-4">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink-900 text-ivory-50"><FileText className="h-5 w-5" /></div>
        <div>
          <p className="text-base font-bold text-ink-900">{title}</p>
          <p className="mt-0.5 text-xs text-ink-500">{desc}</p>
        </div>
      </div>
      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-gold-600">
        Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </div>
  );
  if (disabled) return <div aria-disabled>{body}</div>;
  return <Link href={href} target="_blank" rel="noopener noreferrer">{body}</Link>;
}
