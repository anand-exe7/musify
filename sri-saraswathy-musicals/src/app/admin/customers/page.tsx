"use client";
import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, ExternalLink, Search, UsersRound } from "lucide-react";
import { Pager } from "@/components/ui/Pager";
import { LoadErrorBanner } from "@/components/admin/LoadState";
import { fetchJson, errMsg } from "@/lib/client/api";
import { downloadCsv, rupees, stamp } from "@/lib/csv";
import { formatPhone } from "@/lib/customers/phone";
import { branchLabel } from "@/lib/stock";
import { useAuth } from "@/lib/store/auth";
import { formatINR, cn } from "@/lib/utils";
import type { Invoice } from "@/types";

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  gstin: string | null;
  createdAt: string;
  bills: number;
  total: number;
  lastPurchase: string | null;
}
interface CustomersPage { items: CustomerRow[]; total: number; page: number; pages: number; pageSize: number }
interface Detail { customer: Omit<CustomerRow, "bills" | "total" | "lastPurchase">; invoices: Invoice[] }

const PAGE_SIZES = [10, 25, 50, 100];
const SOURCE: Record<string, string> = { web: "Online", pos: "Counter", service: "Repair", manual: "Manual" };
const STATUS_TONE: Record<string, string> = {
  paid: "bg-success/15 text-success",
  pending: "bg-warning/15 text-[#8a6a1f]",
  cancelled: "bg-danger/10 text-danger",
};

const sourceLabel = (s?: string) => SOURCE[s ?? ""] ?? s ?? "";
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** The address of an invoice a staff member may open: the customer-facing sheet, or the admin one when there is no link. */
function invoiceHref(inv: Invoice, fullAdmin: boolean): string | null {
  if (inv.refId) return `/invoice/${inv.refId}`;
  return fullAdmin ? `/admin/invoices/${inv.id}` : null;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function CustomerDetail({ id, fullAdmin }: { id: string; fullAdmin: boolean }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchJson<Detail>(`/api/customers/${id}`, { cache: "no-store" })
      .then((x) => { if (alive) setD(x); })
      .catch((e) => { if (alive) setError(errMsg(e, "Couldn't load this customer")); });
    return () => { alive = false; };
  }, [id]);

  if (error) return <p className="px-5 py-5 text-sm text-danger">{error}. Close it and open it again.</p>;
  if (!d) return <p className="px-5 py-5 text-sm text-ink-400">Loading…</p>;

  const c = d.customer;
  const counted = d.invoices.filter((i) => i.status !== "cancelled");
  const spent = counted.reduce((n, i) => n + i.total, 0);

  const exportInvoices = () =>
    downloadCsv(`customer-${c.phone}-invoices-${stamp()}.csv`, [
      ["Customer", "Mobile", "GSTIN"],
      [c.name, c.phone, c.gstin ?? ""],
      [],
      ["Date", "Reference", "Tax invoice no.", "Branch", "Source", "Items", "Payment", "Status", "Total"],
      ...d.invoices.map((i) => [
        fmtDate(i.date), i.reference ?? "", i.number, branchLabel(i.branch), sourceLabel(i.source),
        i.items.map((l) => `${l.name} × ${l.qty}`).join("; "), i.paymentMode, i.status, rupees(i.total),
      ]),
    ]);

  const th = "px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400";
  return (
    <div className="space-y-5 border-t border-ink-100 bg-[#FAF7EF] px-4 py-5 md:px-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Name", c.name || "—"],
          ["Mobile", formatPhone(c.phone)],
          ["GST number", c.gstin || "—"],
          ["Customer since", fmtDate(c.createdAt)],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">{k}</p>
            <p className={cn("mt-1 text-sm font-semibold text-ink-900", k === "GST number" && "font-mono")}>{v}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-500">
            Invoices · {counted.length} bill{counted.length === 1 ? "" : "s"} · {formatINR(spent)}
          </h4>
          <button
            onClick={exportInvoices}
            disabled={d.invoices.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Export invoices
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left">
                <th className={th}>Date</th><th className={th}>Invoice</th><th className={th}>Branch</th><th className={th}>Items</th>
                <th className={th}>Payment</th><th className={th}>Status</th><th className={cn(th, "text-right")}>Total</th><th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {d.invoices.map((i) => {
                const href = invoiceHref(i, fullAdmin);
                return (
                  <tr key={i.id} className={cn("align-top text-ink-700", i.status === "cancelled" && "opacity-60")}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-600">{fmtDate(i.date)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <p className="font-semibold text-ink-900">{i.reference || i.number}</p>
                      {i.reference && <p className="text-[11px] text-ink-400">{i.number}</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">{branchLabel(i.branch)}<p className="text-[10px] uppercase tracking-wider text-ink-400">{sourceLabel(i.source)}</p></td>
                    <td className="min-w-[200px] px-3 py-2.5 text-[12px] leading-snug">
                      {i.items.slice(0, 3).map((l, k) => <p key={k}>{l.name} <span className="font-semibold text-ink-500">× {l.qty}</span></p>)}
                      {i.items.length > 3 && <p className="text-ink-400">+ {i.items.length - 3} more</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs uppercase text-ink-600">{i.paymentMode}</td>
                    <td className="px-3 py-2.5"><span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", STATUS_TONE[i.status] ?? "bg-ink-100 text-ink-500")}>{i.status}</span></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-ink-900">{formatINR(i.total)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {href && (
                        <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:text-gold-700">
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
              {d.invoices.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-ink-400">No invoices to show.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function CustomersPage() {
  const fullAdmin = useAuth((s) => s.adminAccess === "all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<CustomersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => { setPage(1); }, [q, pageSize]);

  // One page at a time. A newer request replaces an older one, so a slow reply can't overwrite a fresher list.
  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    fetchJson<CustomersPage>(`/api/customers?${new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) })}`, { cache: "no-store", signal: ctl.signal })
      .then((d) => { setData(d); setError(null); if (d.page !== page) setPage(d.page); })
      .catch((e) => { if (!ctl.signal.aborted) setError(errMsg(e, "Couldn't load customers")); })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [q, page, pageSize, retry]);

  /** Every customer matching the search (not just this page) as a spreadsheet. */
  const exportAll = async () => {
    setExporting(true);
    try {
      const all = await fetchJson<CustomersPage>(`/api/customers?${new URLSearchParams({ q, page: "1", pageSize: "5000" })}`, { cache: "no-store" });
      downloadCsv(`customers-${stamp()}.csv`, [
        ["Name", "Mobile", "GST number", "Customer since", "Bills", "Total spent", "Last purchase"],
        ...all.items.map((c) => [c.name, c.phone, c.gstin ?? "", fmtDate(c.createdAt), c.bills, rupees(c.total), fmtDate(c.lastPurchase)]),
      ]);
    } catch (e) {
      alert(`Couldn't export: ${errMsg(e)}`);
    } finally {
      setExporting(false);
    }
  };

  const items = data?.items ?? [];
  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  const th = "px-4 py-3";

  return (
    <div className="p-5 md:p-8">
      <LoadErrorBanner message={error} onRetry={() => setRetry((n) => n + 1)} />

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="border-l-4 border-ink-900 pl-4">
          <h1 className="text-2xl font-bold text-ink-900">Customers</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data ? `${data.total} customer${data.total === 1 ? "" : "s"}` : "…"} · everyone who has bought or had work done, found by mobile number
          </p>
        </div>
        <button
          onClick={() => void exportAll()}
          disabled={exporting || (data?.total ?? 0) === 0}
          className="flex items-center gap-2 self-start rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-ivory-100 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> {exporting ? "Preparing…" : "Export CSV"}
        </button>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 focus-within:border-gold-500 md:max-w-md">
        <Search className="h-4 w-4 shrink-0 text-ink-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or mobile number…" className="w-full bg-transparent text-sm focus:outline-none" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              <th className={cn(th, "w-10")} />
              <th className={th}>Customer</th>
              <th className={th}>Mobile</th>
              <th className={cn(th, "text-right")}>Bills</th>
              <th className={cn(th, "text-right")}>Total spent</th>
              <th className={cn(th, "pr-4")}>Last purchase</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            {items.map((c) => {
              const isOpen = open === c.id;
              return (
                <Fragment key={c.id}>
                  <tr onClick={() => setOpen(isOpen ? null : c.id)} className={cn("cursor-pointer align-top text-ink-700 hover:bg-ink-900/[0.03]", isOpen && "bg-ink-900/[0.03]")}>
                    <td className="py-3 pl-4 text-ink-400">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">{c.name || <span className="font-normal text-ink-300">No name</span>}</p>
                      {c.gstin && <p className="font-mono text-[11px] text-ink-400">{c.gstin}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatPhone(c.phone)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.bills}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-ink-900">{formatINR(c.total)}</td>
                    <td className="whitespace-nowrap px-4 py-3 pr-4 text-xs text-ink-600">{fmtDate(c.lastPurchase)}</td>
                  </tr>
                  {isOpen && <tr><td colSpan={6} className="p-0"><CustomerDetail id={c.id} fullAdmin={fullAdmin} /></td></tr>}
                </Fragment>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-14 text-center text-sm text-ink-400">
                  <UsersRound className="mx-auto mb-2 h-6 w-6 text-ink-300" />
                  {q ? "No customer matches that search." : "No customers yet. They appear here as bills are made with a mobile number."}
                </td>
              </tr>
            )}
            {loading && items.length === 0 && <tr><td colSpan={6} className="px-4 py-14 text-center text-sm text-ink-400">Loading…</td></tr>}
          </tbody>
        </table>
      </div>

      {data && <Pager className="mt-4" page={data.page} pages={data.pages} total={data.total} from={from} to={to} onPage={setPage} pageSize={pageSize} pageSizes={PAGE_SIZES} onPageSize={setPageSize} />}
    </div>
  );
}
