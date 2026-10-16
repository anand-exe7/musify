"use client";
import { Pager } from "@/components/ui/Pager";
import { usePaged } from "@/lib/client/usePaged";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileSignature, Plus, Search } from "lucide-react";
import type { Quotation } from "@/types";
import { formatINR } from "@/lib/utils";
import { branchLabel } from "@/lib/stock";

function fmtDate(d: string) {
  const date = new Date(d);
  return isNaN(+date) ? d : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function QuotationsPage() {
  const [list, setList] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

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
    if (!s) return list;
    return list.filter((q) => q.number.toLowerCase().includes(s) || q.customer.toLowerCase().includes(s) || (q.customerPhone ?? "").includes(s));
  }, [list, query]);
  const pg = usePaged(rows, query);

  return (
    <div className="space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-ink-900"><FileSignature className="h-6 w-6 text-gold-600" /> Quotations</h1>
          <p className="mt-1 text-sm text-ink-500">Price offers for customers. Valid for 30 days; an advance is needed to start work or process the order.</p>
        </div>
        <Link href="/admin/quotations/new" className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900">
          <Plus className="h-4 w-4" /> New quotation
        </Link>
      </div>

      <div className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search number, customer or phone…"
          className="w-full rounded-xl border border-ink-200 bg-ivory-50 py-2.5 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white">
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
                <td className="px-4 py-3 text-right"><Link href={`/admin/quotations/${encodeURIComponent(q.id)}`} className="font-semibold text-gold-600 hover:underline">View</Link></td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-400">{error ? "Couldn’t load quotations." : "No quotations yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager className="mt-4" {...pg.pager} />
    </div>
  );
}
