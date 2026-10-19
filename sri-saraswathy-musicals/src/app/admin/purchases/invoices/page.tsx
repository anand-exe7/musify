"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, Plus, Search, FileText, Package, BadgeCheck, AlertCircle } from "lucide-react";
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

  const input = "rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none";
  const lab = "text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500";
  const sum = data?.summary;
  const showBranches = allowed.length > 1 || state.branch === "all";
  const from = data && data.rows.length ? (data.page - 1) * data.pageSize + 1 : 0;

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

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-l-4 border-ink-900 pl-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Vendor Bills</h1>
          <p className="mt-1 text-sm text-ink-500">{view === "bills" ? "Every purchase is one line. Open a line to see what each branch has to pay." : "What you bought from each vendor, and what each branch still owes."}</p>
          <div className="mt-3 inline-flex rounded-lg border border-ink-200 bg-ivory-50 p-0.5">
            {([["bills", "Bills"], ["vendors", "By vendor"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} className={cn("rounded-md px-4 py-1.5 text-xs font-semibold", view === k ? "bg-ink-900 text-ivory-50" : "text-ink-600 hover:text-ink-900")}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && <button onClick={() => setAddingOpening(true)} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Opening balance</button>}
          <Link href="/admin/purchases" className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900"><Plus className="h-4 w-4" /> New purchase</Link>
        </div>
      </div>

      {view === "vendors" ? (
        <VendorRollupView
          version={version}
          openVendor={linkedVendor}
          onShowBills={(id) => { set({ vendor: id }); setView("bills"); }}
          onChanged={() => setVersion((v) => v + 1)}
        />
      ) : (
        <>
      {/* Totals for everything the filters match, then each branch */}
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Bills" value={sum ? String(sum.bills) : "—"} icon={<FileText className="h-4 w-4" />} accent="ink" />
        <AdminStat label="Bought" value={sum ? formatINR(sum.bought) : "—"} icon={<Package className="h-4 w-4" />} accent="gold" />
        <AdminStat label="Paid" value={sum ? formatINR(sum.paid) : "—"} icon={<BadgeCheck className="h-4 w-4" />} accent="green" />
        <AdminStat
          label="Left to pay"
          value={sum ? formatINR(sum.left) : "—"}
          icon={<AlertCircle className="h-4 w-4" />}
          accent={sum && sum.left > 0 ? "danger" : "ink"}
        />
      </div>
      {sum && showBranches && Object.keys(sum.branches).length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {Object.entries(sum.branches).map(([b, t]) => (
            <div key={b} className="rounded-xl border border-ink-100 bg-ivory-50 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-700">{branchLabel(b)}</p>
              <p className="mt-1.5 text-xs text-ink-500">Bought <b className="tabular-nums text-ink-900">{formatINR(t.bought)}</b> · {t.qty} pcs</p>
              <p className="text-xs text-ink-500">Paid <b className="tabular-nums text-success">{formatINR(t.paid)}</b></p>
              {t.left < 0
                ? <p className="text-xs text-ink-500">Paid <b className="tabular-nums text-ink-900">{formatINR(-t.left)}</b> extra <span className="text-ink-400">(for other branches)</span></p>
                : <p className="text-xs text-ink-500">Has to pay <b className={cn("tabular-nums", t.left > 0 ? "text-danger" : "text-ink-900")}>{formatINR(t.left)}</b></p>}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className={cn(lab, "relative")}>Search
          <span className="relative mt-1 block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
            <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Vendor, invoice no, product…" className={cn(input, "w-64 pl-8")} />
          </span>
        </label>
        <label className={lab}>Vendor
          <select value={state.vendor} onChange={(e) => set({ vendor: e.target.value })} className={cn(input, "mt-1 block w-48")}>
            <option value="">All vendors</option>
            {vendorOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        {allowed.length > 1 && (
          <label className={lab}>Branch
            <select value={state.branch} onChange={(e) => set({ branch: e.target.value })} className={cn(input, "mt-1 block")}>
              <option value="all">All branches</option>
              {allowed.map((b) => <option key={b} value={b}>{branchLabel(b)}</option>)}
            </select>
          </label>
        )}
        <div>
          <p className={lab}>Show</p>
          <div className="mt-1 flex rounded-lg border border-ink-200 bg-ivory-50 p-0.5">
            {([["all", "All"], ["open", "To pay"], ["paid", "Paid"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => set({ status: k })} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", state.status === k ? "bg-ink-900 text-ivory-50" : "text-ink-600 hover:text-ink-900")}>{l}</button>
            ))}
          </div>
        </div>
        <label className={lab}>From<input type="date" value={state.from} max={state.to || undefined} onChange={(e) => set({ from: e.target.value })} className={cn(input, "mt-1 block")} /></label>
        <label className={lab}>To<input type="date" value={state.to} min={state.from || undefined} onChange={(e) => set({ to: e.target.value })} className={cn(input, "mt-1 block")} /></label>
        <label className={lab}>Sort
          <select value={state.sort} onChange={(e) => set({ sort: e.target.value as Query["sort"] })} className={cn(input, "mt-1 block")}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="balance">Most left to pay</option>
            <option value="amount">Biggest bill</option>
          </select>
        </label>
        {hasFilter && <button onClick={clear} className="pb-2 text-xs font-semibold text-gold-600 hover:underline">Clear filters</button>}
        <button onClick={() => void exportCSV()} disabled={!data || data.total === 0} className="ml-auto flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-50"><Download className="h-4 w-4" /> Export CSV</button>
      </div>

      {/* One line per purchase */}
      <div className={cn("space-y-3 transition-opacity", loading && data && "opacity-60")} aria-busy={loading}>
        {data?.rows.map((r) => (
          <BillLine key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)}>
            {open === r.id && <BillDetailPanel id={r.id} version={version} canEdit={isAdmin} onPay={setPaying} onEdit={setEditing} />}
          </BillLine>
        ))}
        {!data && loading && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-100/60" />)}
        {data && data.rows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-ink-200 px-4 py-14 text-center text-sm text-ink-400">{hasFilter ? "No bills match these filters." : "No purchases yet."}</p>
        )}
        {error && (
          <p className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-4 text-sm text-danger">Couldn&apos;t load the bills. <button onClick={() => setVersion((v) => v + 1)} className="font-semibold underline">Try again</button></p>
        )}
      </div>
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

/** One purchase, as one line: who, what, what each branch still has to pay, and the money. */
function BillLine({ r, open, onToggle, children }: { r: BillRow; open: boolean; onToggle: () => void; children?: React.ReactNode }) {
  const badge = BADGE[r.status];
  const more = r.itemCount - r.items.length;
  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-ivory-50 transition-shadow", open ? "border-gold-400 shadow-md" : "border-ink-100 hover:border-ink-200")}>
      <button onClick={onToggle} aria-expanded={open} className="grid w-full gap-3 p-4 text-left md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_auto] md:items-center md:gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-400 transition-transform", open && "rotate-180")} />
            <span className="truncate text-base font-bold text-ink-900">{r.vendorName}</span>
            <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", badge.cls)}>{badge.text}</span>
          </div>
          <p className="mt-1 pl-6 text-xs text-ink-500">{day(r.date)} · {r.openingBranch ? "Old balance (before this software)" : r.invoiceNo ? `Invoice ${r.invoiceNo}` : "No invoice number"}</p>
          {r.items.length > 0 && (
            <p className="mt-0.5 truncate pl-6 text-xs text-ink-600">{r.items.join(" · ")}{more > 0 ? ` · +${more} more` : ""}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pl-6 md:pl-0">
          {r.branches.map((b) => (
            <span key={b.branch} className={cn("rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight", b.left > 0 ? "border-danger/25 bg-danger/5" : "border-success/25 bg-success/5")}>
              <b className="text-ink-900">{branchLabel(b.branch)}</b>{b.qty > 0 && <span className="text-ink-500"> · {b.qty} pcs</span>}
              <span className={cn("block font-semibold tabular-nums", b.left > 0 ? "text-danger" : "text-success")}>{b.left > 0 ? `has to pay ${formatINR(b.left)}` : "✓ paid"}</span>
            </span>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 pl-6 text-right text-xs md:min-w-[17rem] md:pl-0">
          <div><p className="text-[10px] uppercase tracking-wider text-ink-400">Total</p><p className="font-bold tabular-nums text-ink-900">{formatINR(r.total)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-ink-400">Paid</p><p className="font-bold tabular-nums text-success">{formatINR(r.paid)}</p></div>
          <div><p className="text-[10px] uppercase tracking-wider text-ink-400">Left</p><p className={cn("font-bold tabular-nums", r.left > 0 ? "text-danger" : "text-ink-400")}>{r.left > 0 ? formatINR(r.left) : "—"}</p></div>
        </div>
      </button>
      {children}
    </div>
  );
}

