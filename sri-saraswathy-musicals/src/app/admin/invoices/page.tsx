"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Search, Globe, Store, ExternalLink } from "lucide-react";
import type { Invoice } from "@/types";
import { formatINR, cn } from "@/lib/utils";

type SourceFilter = "all" | "web" | "pos" | "manual";

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
  const [source, setSource] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/invoices")
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((data) => {
        if (!alive) return;
        setInvoices(Array.isArray(data) ? data : []);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter(
      (v) =>
        (source === "all" || (v.source ?? "manual") === source) &&
        (q === "" ||
          v.number.toLowerCase().includes(q) ||
          v.customer.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q)),
    );
  }, [invoices, source, query]);

  const stats = useMemo(() => {
    const sum = (list: Invoice[]) => list.reduce((n, v) => n + v.total, 0);
    return {
      count: invoices.length,
      total: sum(invoices),
      web: invoices.filter((v) => v.source === "web").length,
      pos: invoices.filter((v) => v.source === "pos").length,
    };
  }, [invoices]);

  const filters: { key: SourceFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "web", label: "Online" },
    { key: "pos", label: "In-store" },
    { key: "manual", label: "Manual" },
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
        <Stat label="Invoices" value={String(stats.count)} />
        <Stat label="Total billed" value={formatINR(stats.total)} />
        <Stat label="Online" value={String(stats.web)} />
        <Stat label="In-store" value={String(stats.pos)} />
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 focus-within:border-gold-500 sm:w-72">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search number or customer…"
            className="w-full bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left [&>th]:px-4 [&>th]:py-3 [&>th]:text-[10px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[0.14em] [&>th]:text-ink-500">
              <th>Invoice</th>
              <th>Date</th>
              <th>Customer</th>
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
              <tr><td colSpan={9} className="px-4 py-16 text-center text-ink-400">Loading ledger…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-16 text-center text-ink-400">No invoices yet.</td></tr>
            ) : (
              rows.map((v) => (
                <tr key={v.id} className="border-b border-ink-100 last:border-0 hover:bg-ivory-100/60">
                  <td className="px-4 py-3 font-semibold text-ink-900">{v.number}</td>
                  <td className="px-4 py-3 text-ink-600">{fmtDate(v.date)}</td>
                  <td className="px-4 py-3 text-ink-700">{v.customer}</td>
                  <td className="px-4 py-3 text-ink-600">{v.branch}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      v.source === "web" ? "bg-info/10 text-info" : v.source === "pos" ? "bg-gold-100 text-gold-700" : "bg-ink-100 text-ink-600",
                    )}>
                      {v.source === "web" ? <Globe className="h-3 w-3" /> : v.source === "pos" ? <Store className="h-3 w-3" /> : null}
                      {v.source === "web" ? "Online" : v.source === "pos" ? "In-store" : "Manual"}
                    </span>
                  </td>
                  <td className="px-4 py-3 uppercase text-ink-600">{v.paymentMode}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-900">{formatINR(v.total)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", STATUS_TONE[v.status] ?? "bg-ink-100 text-ink-600")}>{v.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/invoices/${v.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:text-gold-700">
                      View <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">{label}</p>
      <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-ink-900">{value}</p>
    </div>
  );
}
