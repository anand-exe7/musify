"use client";
import { useEffect, useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import { fetchJson, errMsg } from "@/lib/client/api";
import { branchLabel } from "@/lib/stock";
import { cn } from "@/lib/utils";

interface Movement {
  id: string;
  at: string;
  productName: string;
  variant: string;
  branch: string;
  delta: number;
  reason: string;
  ref: string;
  note: string;
}

const REASON_LABEL: Record<string, string> = {
  bill_cancelled: "Bill cancelled",
  order_cancelled: "Order cancelled",
  invoice_cancelled: "Invoice cancelled",
  transfer: "Transfer",
  purchase: "Purchase / inward",
  purchase_deleted: "Purchase deleted",
  repair: "Repair parts",
  adjustment: "Adjustment",
};

/** LED-04: read-only stock movement log — shows the put-back from every cancelled bill / order, plus transfers and purchases. */
export function StockLogModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Movement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("all");

  useEffect(() => {
    let alive = true;
    fetchJson<Movement[]>("/api/stock-movements")
      .then((r) => alive && setRows(r))
      .catch((e: unknown) => alive && setError(errMsg(e, "Couldn't load the stock log")));
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (reason === "all" || r.reason === reason) &&
        (!s || r.productName.toLowerCase().includes(s) || r.variant.toLowerCase().includes(s) || r.ref.toLowerCase().includes(s)),
    );
  }, [rows, q, reason]);

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain bg-ink-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-auto w-full max-w-3xl rounded-2xl bg-ivory-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-ink-100 p-5">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-ink-900">Stock movement log</h3>
            <p className="text-sm text-ink-500">Stock returned by cancelled bills and orders, transfers and purchases — newest first.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-4">
          <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product, variant or bill / order no…" className="w-full bg-transparent text-sm focus:outline-none" />
          </div>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm">
            <option value="all">All reasons</option>
            {Object.entries(REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {error && <p className="p-6 text-sm text-danger">{error}</p>}
          {!error && rows === null && <p className="p-6 text-sm text-ink-400">Loading…</p>}
          {rows !== null && (
            <table className="w-full min-w-[620px] text-sm">
              <thead className="sticky top-0 bg-ivory-100 text-left text-[10px] uppercase tracking-wider text-ink-500">
                <tr className="[&>th]:px-4 [&>th]:py-2.5"><th>When</th><th>Item</th><th>Branch</th><th className="text-right">Qty</th><th>Reason</th><th>Ref</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t border-ink-100 [&>td]:px-4 [&>td]:py-2.5">
                    <td className="whitespace-nowrap text-xs text-ink-500">{new Date(r.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td><p className="font-semibold text-ink-900">{r.productName}</p>{r.variant && <p className="text-xs text-ink-500">{r.variant}</p>}</td>
                    <td className="text-xs text-ink-600">{branchLabel(r.branch)}</td>
                    <td className={cn("text-right font-bold tabular-nums", r.delta > 0 ? "text-success" : "text-danger")}>{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                    <td className="text-xs text-ink-700">{REASON_LABEL[r.reason] ?? r.reason}</td>
                    <td className="font-mono text-[11px] text-ink-500">{r.ref || "—"}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-400">{rows.length === 0 ? "No stock movements logged yet." : "Nothing matches these filters."}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
