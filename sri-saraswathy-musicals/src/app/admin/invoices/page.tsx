"use client";
import { LoadingInline } from "@/components/admin/LoadState";
import { Pager } from "@/components/ui/Pager";
import { usePaged } from "@/lib/client/usePaged";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search, Globe, Store, Wrench, ChevronRight, Receipt, Banknote, Loader2 } from "lucide-react";
import type { Invoice } from "@/types";
import { formatINR, cn } from "@/lib/utils";
import { branchLabel } from "@/lib/stock";
import { RowOutputMenu } from "@/components/print/RowOutputMenu";
import { invoiceToDoc } from "@/lib/print/doc";
import { TaxInvoiceSheet, TAX_INVOICE_PRINT_CSS } from "@/components/invoice/TaxInvoiceSheet";
import { useBranchScope } from "@/lib/store/branch";
import { AdminStat } from "@/components/admin/AdminStat";

/** yyyy-mm-dd of an invoice's timestamp in the viewer's local time (so an evening bill stays on its day). */
function localDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(+d)) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type SourceFilter = "all" | "web" | "pos" | "service" | "manual";
type StatusFilter = "all" | "paid" | "pending" | "cancelled";

function fmtDate(d: string) {
  const date = new Date(d);
  return isNaN(+date) ? d : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_TONE: Record<string, string> = {
  paid: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  cancelled: "bg-danger/10 text-danger",
};

export default function InvoicesLedgerPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [source, setSource] = useState<SourceFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branch, setBranch] = useState("all");
  const allowed = useBranchScope((s) => s.allowed);
  const router = useRouter();
  // Which row is opening, so it shows a spinner until the invoice page takes over.
  const [opening, setOpening] = useState<string | null>(null);
  const [navPending, startNav] = useTransition();
  const openInvoice = (id: string) => {
    setOpening(id);
    startNav(() => router.push(`/admin/invoices/${encodeURIComponent(id)}`));
  };

  useEffect(() => {
    let alive = true;
    // Throw on a bad response so a failed fetch reads as "offline", not as an
    // empty ledger.
    fetch("/api/invoices")
      .then((r) => {
        if (!r.ok) throw new Error("invoices");
        return r.json();
      })
      .then((data) => {
        if (!alive) return;
        setInvoices(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // While the ledger is loading (or unreachable), the stat tiles show a
  // placeholder instead of a misleading 0.
  const stat = (v: string | number) => (loading ? "…" : error ? "—" : String(v));

  // Date range and branch narrow everything below (the totals too); source tabs and search narrow the table.
  const inScope = useMemo(
    () =>
      invoices.filter((v) => {
        const day = localDay(v.date);
        return (!from || day >= from) && (!to || day <= to) && (branch === "all" || v.branch === branch);
      }),
    [invoices, from, to, branch],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScope.filter(
      (v) =>
        (source === "all" || (v.source ?? "manual") === source) &&
        (status === "all" || v.status === status) &&
        (q === "" ||
          v.number.toLowerCase().includes(q) ||
          (v.reference ?? "").toLowerCase().includes(q) ||
          v.customer.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q)),
    );
  }, [inScope, source, status, query]);
  const pg = usePaged(rows, `${query}|${from}|${to}|${branch}|${status}|${source}`);

  const stats = useMemo(() => {
    const sum = (list: Invoice[]) => list.reduce((n, v) => n + v.total, 0);
    // LED-03: cancelled bills stay visible in the ledger but are never counted in "Total billed".
    // The count tiles leave them out too, so every tile describes the same set of live sales.
    const live = inScope.filter((v) => v.status !== "cancelled");
    return {
      count: live.length,
      cancelled: inScope.length - live.length,
      total: sum(live),
      web: live.filter((v) => v.source === "web").length,
      pos: live.filter((v) => v.source === "pos").length,
    };
  }, [inScope]);
  const hasFilter = !!(from || to || branch !== "all");

  const filters: { key: SourceFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "web", label: "Online" },
    { key: "pos", label: "In-store" },
    { key: "service", label: "Service" },
    { key: "manual", label: "Manual" },
  ];
  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "paid", label: "Paid" },
    { key: "pending", label: "Pending" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="border-l-4 border-ink-900 pl-4">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900">
            <FileText className="h-5 w-5 text-gold-600" /> Invoices ledger
          </h1>
          <p className="mt-1 text-sm text-ink-500">Sequential GST tax invoices for online orders and in-store POS bills. Admin only — customers see just their order invoice.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <AdminStat label="Invoices" value={stat(stats.count)} hint={!loading && !error && stats.cancelled > 0 ? `+ ${stats.cancelled} cancelled (not counted)` : undefined} icon={<Receipt className="h-4 w-4" />} accent="ink" />
        <AdminStat label="Total billed" value={loading ? "…" : error ? "—" : formatINR(stats.total)} icon={<Banknote className="h-4 w-4" />} accent="gold" />
        <AdminStat label="Online" value={stat(stats.web)} icon={<Globe className="h-4 w-4" />} accent="green" />
        <AdminStat label="In-store" value={stat(stats.pos)} icon={<Store className="h-4 w-4" />} accent="info" />
      </div>

      {/* Date + branch filters */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">From
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">To
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
        </label>
        {allowed.length > 1 && (
          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Branch
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="mt-1 block rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none">
              <option value="all">All branches</option>
              {allowed.map((b) => <option key={b} value={b}>{branchLabel(b)}</option>)}
            </select>
          </label>
        )}
        {hasFilter && (
          <button onClick={() => { setFrom(""); setTo(""); setBranch("all"); }} className="pb-2.5 text-xs font-semibold text-gold-600 hover:underline">Clear filters</button>
        )}
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-ivory-50 p-1 ring-1 ring-ink-100">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setSource(f.key)}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all",
                  source === f.key ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* LED-05: Paid / Pending / Cancelled status filter. */}
          <div className="flex items-center gap-1 rounded-full bg-ivory-50 p-1 ring-1 ring-ink-100">
            {statusFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatus(f.key)}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all",
                  status === f.key ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 focus-within:border-gold-500 sm:w-72">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search number, reference or customer…"
            className="w-full bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Table — click a row to open its invoice. Cells don't wrap; Customer takes the spare width. */}
      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3 [&>th]:text-[10px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.14em] [&>th]:text-ink-500">
              <th>Invoice</th>
              <th>Date</th>
              <th className="w-full">Customer</th>
              <th>Branch</th>
              <th>Source</th>
              <th>Payment</th>
              <th className="!text-right">Total</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-16 text-center text-ink-400"><LoadingInline label="Loading invoices…" /></td></tr>
            ) : error ? (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center">
                  <span className="block text-sm font-bold text-ink-900">You appear to be offline</span>
                  <span className="mt-1 block text-xs text-ink-500">We couldn&apos;t reach the server. Check your connection and try again.</span>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-16 text-center text-ink-400">{invoices.length === 0 ? "No invoices yet." : "No invoices match these filters."}</td></tr>
            ) : (
              pg.items.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => openInvoice(v.id)}
                  onKeyDown={(e) => e.key === "Enter" && openInvoice(v.id)}
                  tabIndex={0}
                  title="Open invoice"
                  className={cn(
                    "group cursor-pointer border-b border-ink-100 last:border-0 hover:bg-ivory-100/70 focus:bg-ivory-100/70 focus:outline-none [&>td]:whitespace-nowrap [&>td]:px-4 [&>td]:py-3 [&>td]:align-middle",
                    v.status === "cancelled" && "text-ink-400 [&_.amt]:line-through",
                  )}
                >
                  <td>
                    <p className="font-semibold text-ink-900 group-hover:text-gold-700">{v.number}</p>
                    {v.reference && <p className="text-[11px] text-ink-400">{v.reference}</p>}
                  </td>
                  <td className="text-ink-600">{fmtDate(v.date)}</td>
                  <td className="max-w-[16rem] truncate text-ink-700">{v.customer}</td>
                  <td className="text-ink-600">{branchLabel(v.branch)}</td>
                  <td>
                    <span className={cn(
                      "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      v.source === "web" ? "bg-info/10 text-info" : v.source === "pos" ? "bg-gold-100 text-gold-700" : v.source === "service" ? "bg-[#8B5CF6]/15 text-[#6D28D9]" : "bg-ink-100 text-ink-600",
                    )}>
                      {v.source === "web" ? <Globe className="h-3 w-3" /> : v.source === "pos" ? <Store className="h-3 w-3" /> : v.source === "service" ? <Wrench className="h-3 w-3" /> : null}
                      {v.source === "web" ? "Online" : v.source === "pos" ? "In-store" : v.source === "service" ? "Service" : "Manual"}
                    </span>
                  </td>
                  <td className="max-w-[10rem] truncate uppercase text-ink-600">{v.paymentMode}</td>
                  <td className="amt text-right font-semibold tabular-nums text-ink-900">{formatINR(v.total)}</td>
                  <td>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", STATUS_TONE[v.status] ?? "bg-ink-100 text-ink-600")}>{v.status}</span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      {/* LED-01: thermal / A4 / PDF print right here; WhatsApp sends from here. */}
                      <RowOutputMenu
                        href={`/admin/invoices/${v.id}`}
                        doc={invoiceToDoc(v)}
                        phone={v.customerPhone}
                        shareLink={v.refId && typeof window !== "undefined" ? `${window.location.origin}/invoice/${encodeURIComponent(v.refId)}` : undefined}
                        sheet={{ node: <TaxInvoiceSheet invoice={v} />, css: TAX_INVOICE_PRINT_CSS, id: "invoice-sheet" }}
                        pdfName={`Invoice-${v.number}`}
                      />
                      {navPending && opening === v.id ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gold-600"><Loader2 className="h-4 w-4 animate-spin" /> Opening…</span>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-ink-300 group-hover:text-gold-600" aria-hidden />
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager className="mt-4" {...pg.pager} />
    </div>
  );
}

