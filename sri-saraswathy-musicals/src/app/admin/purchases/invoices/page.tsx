"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, Plus, Search, FileText, Package, BadgeCheck, AlertCircle, BarChart3, Loader2, X, History } from "lucide-react";
import { Segmented } from "@/components/admin/Segmented";
import { LoadingPanel } from "@/components/admin/LoadState";
import { AdminStat } from "@/components/admin/AdminStat";
import { useVendors } from "@/lib/store/vendors";
import { useBranchScope } from "@/lib/store/branch";
import { useAuth } from "@/lib/store/auth";
import { formatINR, cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { BRANCH_KEYS, branchLabel } from "@/lib/stock";
import { Pager } from "@/components/ui/Pager";
import { PaymentDialog } from "@/components/purchases/PaymentDialog";
import { PurchaseEditDialog } from "@/components/purchases/PurchaseEditDialog";
import { OpeningBalanceDialog } from "@/components/purchases/OpeningBalanceDialog";
import { BillDetailPanel, type BillDetail } from "@/components/purchases/BillDetailPanel";
import { VendorRollupView } from "@/components/purchases/VendorRollupView";
import type { BillRow, BillsPage } from "@/lib/db/queries/purchaseBills";

const PAGE_SIZES = [10, 25, 50, 100];
type Status = "all" | "open" | "paid";

const day = (d: string) => {
  const x = new Date(`${d}T12:00:00`);
  return isNaN(+x) ? d : x.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

interface Query {
  q: string;
  vendor: string;
  branch: string;
  status: Status;
  from: string;
  to: string;
  sort: "newest" | "oldest" | "balance" | "amount";
  page: number;
  pageSize: number;
}

const toParams = (s: Query, over: Partial<Query> = {}) => {
  const x = { ...s, ...over };
  const p = new URLSearchParams({ page: String(x.page), pageSize: String(x.pageSize), sort: x.sort });
  if (x.q.trim()) p.set("q", x.q.trim());
  if (x.vendor) p.set("vendor", x.vendor);
  if (x.branch !== "all") p.set("branch", x.branch);
  if (x.status !== "all") p.set("status", x.status);
  if (x.from) p.set("from", x.from);
  if (x.to) p.set("to", x.to);
  return p;
};

export default function VendorBillsPage() {
  const vendors = useVendors((s) => s.vendors);
  const hydrateVendors = useVendors((s) => s.hydrate);
  const allowed = useBranchScope((s) => s.allowed);
  const isAdmin = useAuth((s) => s.isAdmin);

  const [state, setState] = useState<Query>({ q: "", vendor: "", branch: "all", status: "all", from: "", to: "", sort: "newest", page: 1, pageSize: 10 });
  const [qInput, setQInput] = useState("");
  const [data, setData] = useState<BillsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<"bills" | "vendors">("bills");
  /** A vendor whose statement opens straight away (from a link). */
  const [linkedVendor, setLinkedVendor] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  /** Bumped after a payment or edit so the list and the open bill reload. */
  const [version, setVersion] = useState(0);
  const [paying, setPaying] = useState<BillDetail | null>(null);
  const [editing, setEditing] = useState<BillDetail | null>(null);
  const [addingOpening, setAddingOpening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /** Change a filter (and go back to the first page). */
  const set = useCallback((patch: Partial<Query>) => setState((s) => ({ ...s, page: 1, ...patch })), []);

  useEffect(() => { void hydrateVendors(); }, [hydrateVendors]);
  // A link from the Vendors page: ?vendor=<id>
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get("vendor");
    if (sp.get("view") === "vendors") { setView("vendors"); if (v) setLinkedVendor(v); }
    else if (v) setState((s) => ({ ...s, vendor: v }));
  }, []);
  // Search waits until typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setState((s) => (s.q === qInput ? s : { ...s, q: qInput, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const key = toParams(state).toString();
  useEffect(() => {
    if (view !== "bills") return;
    const ctl = new AbortController();
    setLoading(true);
    fetch(`/api/vendor-bills?${key}`, { cache: "no-store", signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<BillsPage>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setData(d);
        setError(false);
        setLoading(false);
        if (d.page !== state.page) setState((s) => ({ ...s, page: d.page })); // the page asked for was past the end
      })
      .catch(() => { if (!ctl.signal.aborted) { setError(true); setLoading(false); } });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version, view]);

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  };
  const changed = (m: string) => { setPaying(null); setEditing(null); setAddingOpening(false); notify(m); setVersion((v) => v + 1); };

  const vendorOptions = useMemo(() => [...vendors].sort((a, b) => a.name.localeCompare(b.name)), [vendors]);
  const hasFilter = !!(state.q || state.vendor || state.from || state.to || state.branch !== "all" || state.status !== "all");
  const clear = () => { setQInput(""); set({ q: "", vendor: "", from: "", to: "", branch: "all", status: "all" }); };

  const exportCSV = async () => {
    try {
      const res = await fetch(`/api/vendor-bills?${toParams(state, { page: 1, pageSize: 1000 })}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const all = (await res.json()) as BillsPage;
      const r2 = (paise: number) => (paise / 100).toFixed(2);
      const head = ["Date", "Vendor", "Vendor invoice", "Items", "Total", "Paid", "Left", "Status", ...BRANCH_KEYS.flatMap((b) => [`${branchLabel(b)} pcs`, `${branchLabel(b)} bill`, `${branchLabel(b)} paid`, `${branchLabel(b)} left`])];
      const body = all.rows.map((r) => [
        r.date, r.vendorName, r.invoiceNo, r.items.join("; "), r2(r.total), r2(r.paid), r2(r.left), r.status,
        ...BRANCH_KEYS.flatMap((b) => {
          const x = r.branches.find((y) => y.branch === b);
          return x ? [String(x.qty), r2(x.bill), r2(x.paid), r2(x.left)] : ["", "", "", ""];
        }),
      ]);
      downloadCsv(`vendor-bills-${Date.now()}.csv`, [head, ...body]);
      if (all.total > all.rows.length) notify(`Exported the first ${all.rows.length} of ${all.total} bills — narrow the filters for the rest.`);
    } catch {
      notify("Couldn't export. Try again.");
    }
  };

  const input = "h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const sum = data?.summary;
  const showBranches = allowed.length > 1 || state.branch === "all";
  const from = data && data.rows.length ? (data.page - 1) * data.pageSize + 1 : 0;
  const firstLoad = !data && loading && !error;
  const wait = "…";
  const setLink = (id: string, on: boolean) => setData((d) => (d ? { ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, inAnalytics: on } : r)) } : d));

  return (
    <div className="p-5 md:p-8">
      {paying && (
        <PaymentDialog purchase={paying} vendorName={data?.rows.find((r) => r.id === paying.id)?.vendorName ?? vendors.find((v) => v.id === paying.vendorId)?.name ?? ""} onClose={() => setPaying(null)} onDone={changed} />
      )}
      {(addingOpening || editing?.openingBranch) && (
        <OpeningBalanceDialog existing={editing?.openingBranch ? editing : undefined} onClose={() => { setAddingOpening(false); setEditing(null); }} onDone={changed} />
      )}
      {editing && !editing.openingBranch && <PurchaseEditDialog purchase={editing} onClose={() => setEditing(null)} onDone={changed} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>}

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink-900 text-gold-400"><FileText className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Vendor Bills</h1>
            <p className="mt-0.5 text-sm text-ink-500">{view === "bills" ? "Every purchase is one line — open it to see branches, items and payments." : "What you bought from each vendor, and what each branch still owes."}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && <button onClick={() => setAddingOpening(true)} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5"><History className="h-4 w-4" /> Opening balance</button>}
          <Link href="/admin/purchases" className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900"><Plus className="h-4 w-4" /> New purchase</Link>
        </div>
      </div>

      <Segmented value={view} options={[["bills", "Bills"], ["vendors", "By vendor"]] as const} onChange={setView} className="mb-5" />

      {view === "vendors" ? (
        <VendorRollupView
          version={version}
          openVendor={linkedVendor}
          onShowBills={(id) => { set({ vendor: id }); setView("bills"); }}
          onChanged={() => setVersion((v) => v + 1)}
        />
      ) : (
        <>
      {/* Totals for everything the filters match */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Bills" value={sum ? String(sum.bills) : wait} hint={firstLoad ? "Loading…" : "Matching the filters"} icon={<FileText className="h-4 w-4" />} accent="ink"
          details={sum ? [{ label: "Bills matching the filters", value: String(sum.bills) }, { label: "Bought on them", value: formatINR(sum.bought) }, { label: "Still to pay", value: formatINR(sum.left), tone: sum.left > 0 ? "minus" : "muted" }] : undefined} />
        <AdminStat label="Bought" value={sum ? formatINR(sum.bought) : wait} hint="Bill totals incl. GST" icon={<Package className="h-4 w-4" />} accent="gold"
          details={sum ? [...Object.entries(sum.branches).map(([b, t]) => ({ label: `${branchLabel(b)} · ${t.qty} pcs`, value: formatINR(t.bought) })), { label: "Total bought", value: formatINR(sum.bought), tone: "total" as const }] : undefined} />
        <AdminStat label="Paid" value={sum ? formatINR(sum.paid) : wait} hint="At purchase + later payments" icon={<BadgeCheck className="h-4 w-4" />} accent="green"
          details={sum ? [...Object.entries(sum.branches).map(([b, t]) => ({ label: branchLabel(b), value: formatINR(t.paid), tone: "plus" as const })), { label: "Total paid", value: formatINR(sum.paid), tone: "total" as const }] : undefined} />
        <AdminStat label="Left to pay" value={sum ? formatINR(sum.left) : wait} hint={sum && sum.left > 0 ? "Still owed to vendors" : "Nothing owed"} icon={<AlertCircle className="h-4 w-4" />} accent={sum && sum.left > 0 ? "danger" : "ink"}
          details={sum ? [...Object.entries(sum.branches).map(([b, t]) => ({ label: branchLabel(b), value: t.left < 0 ? `${formatINR(-t.left)} paid extra` : formatINR(t.left), tone: t.left > 0 ? ("minus" as const) : ("muted" as const) })), { label: "Total left", value: formatINR(sum.left), tone: "total" as const }] : undefined} />
      </div>
      {sum && showBranches && Object.keys(sum.branches).length > 0 && (
        <div className="mb-5 grid overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50 sm:grid-cols-3 sm:divide-x sm:divide-ink-100">
          {Object.entries(sum.branches).map(([b, t]) => (
            <div key={b} className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 last:border-b-0 sm:border-b-0">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-700">{branchLabel(b)}</p>
                <p className="truncate text-[11px] text-ink-500">{t.qty} pcs · bought {formatINR(t.bought)} · paid <span className="text-success">{formatINR(t.paid)}</span></p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] uppercase tracking-wider text-ink-400">{t.left < 0 ? "Paid extra" : "Has to pay"}</p>
                <p className={cn("text-sm font-bold tabular-nums", t.left > 0 ? "text-danger" : "text-ink-900")}>{formatINR(Math.abs(t.left))}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 space-y-3 rounded-2xl border border-ink-100 bg-ivory-50 p-4">
        <div className="flex flex-col gap-2.5 md:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search vendor, invoice no or product…" className={cn(input, "w-full pl-10")} />
            {qInput && <button onClick={() => setQInput("")} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:bg-ink-900/5"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:flex">
            <select value={state.vendor} onChange={(e) => set({ vendor: e.target.value })} aria-label="Vendor" className={cn(input, "md:w-48")}>
              <option value="">All vendors</option>
              {vendorOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {allowed.length > 1 && (
              <select value={state.branch} onChange={(e) => set({ branch: e.target.value })} aria-label="Branch" className={cn(input, "md:w-44")}>
                <option value="all">All branches</option>
                {allowed.map((b) => <option key={b} value={b}>{branchLabel(b)}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <Segmented label="Show" value={state.status} options={[["all", "All"], ["open", "To pay"], ["paid", "Paid"]] as const} onChange={(k) => set({ status: k })} />
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Dates</span>
            <input type="date" value={state.from} max={state.to || undefined} onChange={(e) => set({ from: e.target.value })} aria-label="From date" className={cn(input, "h-9 w-[9.5rem] max-w-full px-2.5 text-xs")} />
            <span className="text-ink-300">–</span>
            <input type="date" value={state.to} min={state.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="To date" className={cn(input, "h-9 w-[9.5rem] max-w-full px-2.5 text-xs")} />
          </div>
          <select value={state.sort} onChange={(e) => set({ sort: e.target.value as Query["sort"] })} aria-label="Sort" className={cn(input, "h-9 text-xs")}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="balance">Most left to pay</option>
            <option value="amount">Biggest bill</option>
          </select>
          {hasFilter && <button onClick={clear} className="text-xs font-semibold text-gold-700 hover:underline">Clear filters</button>}
          <button onClick={() => void exportCSV()} disabled={!data || data.total === 0} className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Export CSV</button>
        </div>
      </div>

      {/* One line per purchase */}
      {firstLoad ? (
        <LoadingPanel label="Loading vendor bills…" />
      ) : (
        <div className="relative" aria-busy={loading}>
          {loading && data && (
            <span className="absolute -top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3 py-1 text-[11px] font-semibold text-ivory-50 shadow"><Loader2 className="h-3 w-3 animate-spin" /> Updating…</span>
          )}
          <div className={cn("space-y-2.5 transition-opacity", loading && data && "opacity-50")}>
            {data?.rows.map((r) => (
              <BillLine key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)}>
                {open === r.id && <BillDetailPanel id={r.id} version={version} canEdit={isAdmin} onPay={setPaying} onEdit={setEditing} onLinkChange={(on) => setLink(r.id, on)} onDeleted={() => { setOpen(null); changed("Bill deleted."); }} />}
              </BillLine>
            ))}
            {data && data.rows.length === 0 && (
              <div className="grid place-items-center rounded-2xl border border-dashed border-ink-200 px-4 py-14 text-center">
                <FileText className="h-6 w-6 text-ink-300" />
                <p className="mt-2 text-sm font-semibold text-ink-600">{hasFilter ? "No bills match these filters" : "No purchases yet"}</p>
                {hasFilter && <button onClick={clear} className="mt-1 text-xs font-semibold text-gold-700 hover:underline">Clear filters</button>}
              </div>
            )}
          </div>
          {error && (
            <p className="mt-3 rounded-2xl border border-danger/30 bg-danger/5 px-4 py-4 text-sm text-danger">Couldn&apos;t load the bills. <button onClick={() => setVersion((v) => v + 1)} className="font-semibold underline">Try again</button></p>
          )}
        </div>
      )}
      {data && (
        <Pager
          className="mt-4"
          page={data.page} pages={data.pages} total={data.total} from={from} to={from ? from + data.rows.length - 1 : 0}
          onPage={(p) => setState((s) => ({ ...s, page: p }))}
          pageSize={state.pageSize} pageSizes={PAGE_SIZES} onPageSize={(n) => set({ pageSize: n })}
        />
      )}
        </>
      )}
    </div>
  );
}

const BADGE = {
  paid: { text: "Paid", cls: "bg-success/15 text-success" },
  part: { text: "Part paid", cls: "bg-warning/20 text-warning" },
  unpaid: { text: "Not paid", cls: "bg-danger/10 text-danger" },
} as const;

/** One purchase, as one compact line: who and what, which branches still owe, and the money. */
function BillLine({ r, open, onToggle, children }: { r: BillRow; open: boolean; onToggle: () => void; children?: React.ReactNode }) {
  const badge = BADGE[r.status];
  const more = r.itemCount - r.items.length;
  const owing = r.branches.filter((b) => b.left > 0);
  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-ivory-50 transition-shadow", open ? "border-gold-400 shadow-md" : "border-ink-100 hover:border-ink-200 hover:shadow-sm")}>
      <button onClick={onToggle} aria-expanded={open} className="grid w-full items-center gap-3 px-4 py-3.5 text-left md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_19rem] md:gap-5">
        <div className="flex min-w-0 items-start gap-2.5">
          <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-ink-400 transition-transform", open && "rotate-180")} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-[15px] font-bold text-ink-900">{r.vendorName}</span>
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", badge.cls)}>{badge.text}</span>
              {r.inAnalytics && <span title="Payments on this bill are subtracted in analytics" className="inline-flex items-center gap-1 rounded bg-danger/[0.08] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger"><BarChart3 className="h-3 w-3" /> In analytics</span>}
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-500">
              {day(r.date)} · {r.openingBranch ? "Old balance" : r.invoiceNo ? `Inv ${r.invoiceNo}` : "No invoice no"}
              {r.paymentMode && r.paymentMode !== "CREDIT" ? ` · ${r.paymentMode}` : ""}
              {r.items.length > 0 && <span className="text-ink-600"> · {r.items.join(" · ")}{more > 0 ? ` +${more} more` : ""}</span>}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap gap-1.5 pl-6 md:pl-0">
          {owing.length === 0 ? (
            <span className="rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">✓ All branches paid</span>
          ) : (
            owing.map((b) => (
              <span key={b.branch} className="max-w-full truncate rounded-full bg-danger/[0.07] px-2.5 py-1 text-[11px] text-ink-700">
                <b className="font-semibold">{branchLabel(b.branch)}</b> <span className="font-semibold tabular-nums text-danger">{formatINR(b.left)}</span>
              </span>
            ))
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 pl-6 text-right md:pl-0">
          <div className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-ink-400">Total</p><p className="truncate text-sm font-bold tabular-nums text-ink-900">{formatINR(r.total)}</p></div>
          <div className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-ink-400">Paid</p><p className="truncate text-sm font-bold tabular-nums text-success">{formatINR(r.paid)}</p></div>
          <div className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-ink-400">Left</p><p className={cn("truncate text-sm font-bold tabular-nums", r.left > 0 ? "text-danger" : "text-ink-300")}>{r.left > 0 ? formatINR(r.left) : "—"}</p></div>
        </div>
      </button>
      {children}
    </div>
  );
}
