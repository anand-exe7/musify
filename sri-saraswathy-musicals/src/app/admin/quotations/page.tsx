"use client";
import { LoadingInline } from "@/components/admin/LoadState";
import { Pager } from "@/components/ui/Pager";
import { usePaged } from "@/lib/client/usePaged";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileSignature, Plus, Search, Sheet } from "lucide-react";
import type { Quotation } from "@/types";
import { formatINR } from "@/lib/utils";
import { branchLabel } from "@/lib/stock";
import { RowOutputMenu } from "@/components/print/RowOutputMenu";
import { QuotationSheet, QUOTATION_PRINT_CSS } from "@/components/quotation/QuotationSheet";
import { quotationToDoc } from "@/lib/print/doc";
import { BranchOptions } from "@/components/admin/BranchOptions";
import { PERIODS, periodBounds, dayKey, type ReportPeriod } from "@/components/admin/ServiceReport";
import { downloadXlsx, rupeesNum } from "@/lib/reports/excel";
import { cn } from "@/lib/utils";

function fmtDate(d: string) {
  const date = new Date(d);
  return isNaN(+date) ? d : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function QuotationsPage() {
  const [list, setList] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branch, setBranch] = useState<string>("all");

  useEffect(() => {
    let alive = true;
    fetch("/api/quotations")
      .then((r) => {
        if (!r.ok) throw new Error("quotations");
        return r.json();
      })
      .then((data) => alive && (setList(Array.isArray(data) ? data : []), setLoading(false)))
      .catch(() => alive && (setError(true), setLoading(false)));
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    const s = query.trim().toLowerCase();
    const bounds = periodBounds(period, from, to);
    return list.filter((q) => {
      if (branch !== "all" && q.branch !== branch) return false;
      if (bounds) {
        const d = dayKey(q.date);
        if (d < bounds.lo || d > bounds.hi) return false;
      }
      if (!s) return true;
      return q.number.toLowerCase().includes(s) || q.customer.toLowerCase().includes(s) || (q.customerPhone ?? "").includes(s);
    });
  }, [list, query, period, from, to, branch]);
  const pg = usePaged(rows, `${query}|${period}|${from}|${to}|${branch}`);
  const filteredTotal = useMemo(() => rows.reduce((n, q) => n + q.total, 0), [rows]);

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "All";
  const exportXlsx = () => {
    void downloadXlsx(`Quotations-${periodLabel.replace(/\s+/g, "-")}-${dayKey(new Date().toISOString())}`, [
      {
        name: "Quotations",
        rows: [
          ["Quotation", "Date", "Valid until", "Customer", "Phone", "GSTIN", "Branch", "Status", "Items", "Subtotal (Rs)", "Discount (Rs)", "GST (Rs)", "Total (Rs)"],
          ...rows.map((q) => [
            q.number,
            q.date,
            q.validUntil,
            q.customer,
            q.customerPhone ?? "",
            q.customerGstin ?? "",
            branchLabel(q.branch),
            q.status,
            (q.items ?? []).map((l) => `${l.name} x ${l.qty}`).join("; "),
            rupeesNum(q.subtotal),
            rupeesNum(q.discount ?? 0),
            rupeesNum((q.cgst ?? 0) + (q.sgst ?? 0) + (q.igst ?? 0)),
            rupeesNum(q.total),
          ]),
          [],
          ["", "", "", "", "", "", "", "", `${rows.length} quotation${rows.length === 1 ? "" : "s"}`, null, null, null, rupeesNum(filteredTotal)],
        ],
      },
    ]);
  };

  return (
    <div className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-900"><FileSignature className="h-6 w-6 text-gold-600" /> Quotations</h1>
          <p className="mt-1 text-sm text-ink-500">Price offers for customers. Valid for 30 days; an advance is needed to start work or process the order.</p>
        </div>
        <Link href="/admin/quotations/new" className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900">
          <Plus className="h-4 w-4" /> New quotation
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search number, customer or phone…"
              className="w-full rounded-xl border border-ink-200 bg-ivory-50 py-2.5 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none"
            />
          </div>

          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            aria-label="Branch"
            className="rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm focus:border-gold-500 focus:outline-none"
          >
            <option value="all">All branches</option>
            <BranchOptions />
          </select>

          <button
            type="button"
            onClick={exportXlsx}
            disabled={rows.length === 0}
            className="ml-auto inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-gold-400 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sheet className="h-4 w-4 text-gold-600" /> Excel
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                period === p.key
                  ? "border-ink-900 bg-ink-900 text-ivory-50"
                  : "border-ink-200 bg-ivory-50 text-ink-600 hover:border-gold-400",
              )}
            >
              {p.label}
            </button>
          ))}
          {period === "custom" && (
            <span className="flex items-center gap-2 text-xs text-ink-500">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" className="rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-xs" />
              to
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" className="rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-xs" />
            </span>
          )}
          {!loading && (
            <span className="ml-auto text-xs text-ink-500">
              {rows.length} of {list.length} · <b className="tabular-nums text-ink-800">{formatINR(filteredTotal)}</b>
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white" aria-busy={loading}>
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-ivory-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            <tr>
              <th className="px-4 py-3">Quotation</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Valid until</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {pg.items.map((q) => (
              <tr key={q.id} className="border-t border-ink-100">
                <td className="px-4 py-3 font-semibold text-ink-900">{q.number}</td>
                <td className="px-4 py-3 text-ink-600">{fmtDate(q.date)}</td>
                <td className="px-4 py-3 text-ink-600">{fmtDate(q.validUntil)}</td>
                <td className="px-4 py-3 text-ink-800">{q.customer}{q.customerPhone && <span className="block text-xs text-ink-400">{q.customerPhone}</span>}</td>
                <td className="px-4 py-3 text-ink-600">{branchLabel(q.branch)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-900">{formatINR(q.total)}</td>
                <td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-2"><Link href={`/admin/quotations/${encodeURIComponent(q.id)}`} className="font-semibold text-gold-600 hover:underline">View</Link><RowOutputMenu href={`/admin/quotations/${encodeURIComponent(q.id)}`} doc={quotationToDoc(q)} phone={q.customerPhone} shareLink={typeof window !== "undefined" ? `${window.location.origin}/quotation/${encodeURIComponent(q.id)}` : undefined} sheet={{ node: <QuotationSheet quotation={q} />, css: QUOTATION_PRINT_CSS, id: "quotation-sheet" }} pdfName={`Quotation-${q.number}`} /></div></td>
              </tr>
            ))}
            {loading && Array.from({ length: 6 }, (_, i) => (
              <tr key={`sk-${i}`} className="border-t border-ink-100" aria-hidden>
                {[28, 20, 20, 36, 16, 16, 10].map((w, j) => (
                  <td key={j} className="px-4 py-4"><div className="h-3.5 animate-pulse rounded bg-ink-100" style={{ width: `${w * 2.2}%`, minWidth: 40 }} /></td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-400">{error ? "Couldn’t load quotations." : list.length === 0 ? "No quotations yet." : "No quotations match these filters."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <p className="py-6 text-center"><LoadingInline label="Loading quotations…" /></p>}
      {!loading && <Pager className="mt-4" {...pg.pager} />}
    </div>
  );
}
