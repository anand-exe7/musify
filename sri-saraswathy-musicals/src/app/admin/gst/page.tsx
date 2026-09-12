"use client";
import { useMemo, useState } from "react";
import { Receipt, Save, RotateCcw, MapPin, ArrowLeftRight, Building2, Info } from "lucide-react";
import { useGst, extractGst, IN_STATES } from "@/lib/store/gst";
import { usePOS, filterBills, type Period, type BranchFilter } from "@/lib/store/pos";
import { formatINR, cn } from "@/lib/utils";

type Tab = "rules" | "collections";

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
  const bills = usePOS((s) => s.bills);
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
        {(["rules", "collections"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("relative -mb-px border-b-2 pb-3 text-sm font-semibold uppercase tracking-wider transition-colors",
              tab === t ? "border-ink-900 text-ink-900" : "border-transparent text-ink-400 hover:text-ink-700")}>
            {t === "rules" ? "Tax Rules" : "GST Collections"}
          </button>
        ))}
      </div>

      {tab === "rules" ? (
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
        <CollectionsTab bills={bills} rate={gst.standardRate} labels={gst} />
      )}
    </div>
  );
}

function PreviewTable({ rate, labels }: { rate: number; labels: { cgstLabel: string; sgstLabel: string; igstLabel: string } }) {
  const base = 10000;
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

function CollectionsTab({ bills, rate, labels }: { bills: ReturnType<typeof usePOS.getState>["bills"]; rate: number; labels: { cgstLabel: string; sgstLabel: string; igstLabel: string } }) {
  const [period, setPeriod] = useState<Period>("all");
  const [branch, setBranch] = useState<BranchFilter>("all");

  const m = useMemo(() => {
    const scoped = filterBills(bills, { period, branch });
    let taxable = 0, gstColl = 0, cgst = 0, sgst = 0, igst = 0, intraCount = 0, interCount = 0;
    for (const b of scoped) {
      const goods = Math.max(0, b.subtotal - b.discount); // GST-inclusive goods value
      const { gst, net } = extractGst(goods, rate);
      taxable += net;
      gstColl += gst;
      // Offline (walk-in) = intra-state; online (shipped) = treated inter-state
      if (b.source === "offline") { cgst += gst / 2; sgst += gst / 2; intraCount++; }
      else { igst += gst; interCount++; }
    }
    return { count: scoped.length, taxable, gstColl, cgst: Math.round(cgst), sgst: Math.round(sgst), igst: Math.round(igst), intraCount, interCount };
  }, [bills, period, branch, rate]);

  const pill = "rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all";

  return (
    <div className="space-y-6">
      {/* filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Period</span>
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className={cn(pill, period === p.key ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900")}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Branch</span>
          {(["all", "Branch 1", "Branch 2"] as BranchFilter[]).map((b) => (
            <button key={b} onClick={() => setBranch(b)} className={cn(pill, branch === b ? "bg-gold-500 text-ink-900" : "text-ink-500 hover:text-ink-900")}>{b === "all" ? "Overall" : b}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Taxable Value</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900 md:text-3xl">{formatINR(m.taxable)}</p><p className="mt-1 text-xs text-ink-400">Net of GST · {m.count} bills</p></Card>
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">GST Collected</p><p className="mt-2 text-2xl font-bold tabular-nums text-gold-600 md:text-3xl">{formatINR(m.gstColl)}</p><p className="mt-1 text-xs text-ink-400">Output tax @ {rate}%</p></Card>
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">{labels.cgstLabel} + {labels.sgstLabel}</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900 md:text-3xl">{formatINR(m.cgst + m.sgst)}</p><p className="mt-1 text-xs text-ink-400">In-state · {m.intraCount} bills</p></Card>
        <Card><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">{labels.igstLabel}</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink-900 md:text-3xl">{formatINR(m.igst)}</p><p className="mt-1 text-xs text-ink-400">Inter-state · {m.interCount} bills</p></Card>
      </div>

      {/* Breakdown */}
      <Card>
        <p className="mb-4 text-sm font-bold text-ink-900">Output Tax Breakdown</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                <th className="py-3">Component</th><th>Supply Type</th><th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              <tr className="text-ink-800"><td className="py-3.5 font-semibold text-ink-900">{labels.cgstLabel}</td><td className="text-ink-500">Intra-state</td><td className="text-right tabular-nums">{formatINR(m.cgst)}</td></tr>
              <tr className="text-ink-800"><td className="py-3.5 font-semibold text-ink-900">{labels.sgstLabel}</td><td className="text-ink-500">Intra-state</td><td className="text-right tabular-nums">{formatINR(m.sgst)}</td></tr>
              <tr className="text-ink-800"><td className="py-3.5 font-semibold text-ink-900">{labels.igstLabel}</td><td className="text-ink-500">Inter-state</td><td className="text-right tabular-nums">{formatINR(m.igst)}</td></tr>
              <tr className="font-bold text-ink-900"><td className="py-3.5">Total GST</td><td></td><td className="text-right tabular-nums text-gold-600">{formatINR(m.gstColl)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-ink-400">Walk-in (offline) bills are treated as intra-state supply; online orders as inter-state. GST is extracted from GST-inclusive sale values at {rate}%.</p>
      </Card>
    </div>
  );
}
