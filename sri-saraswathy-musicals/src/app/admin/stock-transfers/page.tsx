"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Search, ArrowRight, Trash2, X, Sheet } from "lucide-react";
import { usePOS, useInventory, productStockAt, variantStockAt, type Branch, type InvProduct } from "@/lib/store/pos";
import { useBranchScope, effectiveBranch } from "@/lib/store/branch";
import { cn } from "@/lib/utils";
import { BRANCH_KEYS, branchLabel } from "@/lib/stock";
import { BranchOptions } from "@/components/admin/BranchOptions";
import { downloadXlsx } from "@/lib/reports/excel";

interface TransferRow {
  id: string;
  productName: string;
  variant: string;
  quantity: number;
  fromBranch: string;
  toBranch: string;
  note: string;
  transferredAt: string;
  createdBy?: string;
  /** Readable staff name resolved by the API (INV-06); falls back to the id. */
  createdByName?: string;
}

/** yyyy-mm-dd of a timestamp in local time. */
function localDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(+d)) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** One editable table line; the product is resolved live so stock stays fresh. */
interface Line {
  key: string;
  productId: string;
  variantIndex: number;
  qty: number;
}

const toInt = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

function fmt(d: string) {
  const x = new Date(d);
  return isNaN(+x) ? d : x.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Period = "all" | "today" | "week" | "month" | "year" | "custom";
const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The from/to dates a period button fills in. "This week" starts on Monday. */
function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  const today = iso(now);
  if (p === "today") return { from: today, to: today };
  if (p === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return { from: iso(d), to: today };
  }
  if (p === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  if (p === "year") return { from: iso(new Date(now.getFullYear(), 0, 1)), to: today };
  return { from: "", to: "" }; // all / custom
}

/** Default destination for a source: the next branch in the list. */
const otherBranch = (b: Branch): Branch => BRANCH_KEYS[(BRANCH_KEYS.indexOf(b) + 1) % BRANCH_KEYS.length];

export default function StockTransfersPage() {
  const invProducts = useInventory();
  const hydratePOS = usePOS((s) => s.hydrate);
  const canSwitch = useBranchScope((s) => s.canSwitch);
  const allowedBranches = useBranchScope((s) => s.allowed);
  const scopeSelected = useBranchScope((s) => s.selected);
  // Branch users are pinned as source; admins pick either direction.
  const lockedSource: Branch | null =
    !canSwitch && allowedBranches.length === 1 ? allowedBranches[0] : null;

  const [fromBranch, setFromBranch] = useState<Branch>(lockedSource ?? effectiveBranch(scopeSelected));
  const [toBranch, setToBranch] = useState<Branch>(otherBranch(lockedSource ?? effectiveBranch(scopeSelected)));
  const [productTerm, setProductTerm] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // One id per submission: if the request is retried (timeout, double-click) the
  // server recognises it and returns the original transfer instead of repeating it.
  const batchRef = useRef<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);

  // INV-05: filters for the recent-transfers log.
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fSrc, setFSrc] = useState<string>("all");
  const [fDest, setFDest] = useState<string>("all");
  const [fProduct, setFProduct] = useState<string>("all");
  const [fQuery, setFQuery] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const shownTransfers = useMemo(() => {
    const q = fQuery.trim().toLowerCase();
    return transfers.filter((r) => {
      const day = localDay(r.transferredAt);
      return (
        (!fFrom || day >= fFrom) &&
        (!fTo || day <= fTo) &&
        (fSrc === "all" || r.fromBranch === fSrc) &&
        (fDest === "all" || r.toBranch === fDest) &&
        (fProduct === "all" || r.productName === fProduct) &&
        (!q || r.productName.toLowerCase().includes(q) || r.variant.toLowerCase().includes(q) || (r.createdByName || "").toLowerCase().includes(q))
      );
    });
  }, [transfers, fFrom, fTo, fSrc, fDest, fProduct, fQuery]);
  const hasTransferFilter = !!(fFrom || fTo || fSrc !== "all" || fDest !== "all" || fProduct !== "all" || fQuery || period !== "all");
  /** Every product that has ever been transferred, for the product filter. */
  const transferredProducts = useMemo(
    () => [...new Set(transfers.map((r) => r.productName))].sort((a, b) => a.localeCompare(b)),
    [transfers],
  );
  const movedUnits = useMemo(() => shownTransfers.reduce((n, r) => n + r.quantity, 0), [shownTransfers]);
  /** A period button fills the two date boxes; typing in them switches to Custom. */
  const applyPeriod = (p: Period) => {
    setPeriod(p);
    const range = periodRange(p);
    setFFrom(range.from);
    setFTo(range.to);
  };
  const clearFilters = () => { setPeriod("all"); setFFrom(""); setFTo(""); setFSrc("all"); setFDest("all"); setFProduct("all"); setFQuery(""); };

  /** The transfer history on screen, as a spreadsheet — same rows, same order as the table. */
  const exportXlsx = () => {
    void downloadXlsx(`Stock-transfers-${localDay(new Date().toISOString())}`, [
      {
        name: "Stock transfers",
        rows: [
          ["Date", "Time", "Product", "Variant", "Quantity", "From", "To", "Moved by", "Note"],
          ...shownTransfers.map((r) => [
            localDay(r.transferredAt),
            new Date(r.transferredAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            r.productName,
            r.variant,
            r.quantity,
            branchLabel(r.fromBranch),
            branchLabel(r.toBranch),
            r.createdByName || r.createdBy || "",
            r.note || "",
          ]),
          [],
          ["", "", `${shownTransfers.length} transfer${shownTransfers.length === 1 ? "" : "s"}`, "", movedUnits, "", "", "", ""],
        ],
      },
    ]);
  };

  useEffect(() => {
    setFromBranch(lockedSource ?? effectiveBranch(scopeSelected));
    setToBranch(otherBranch(lockedSource ?? effectiveBranch(scopeSelected)));
  }, [lockedSource, scopeSelected]);

  const loadTransfers = async () => {
    try {
      const res = await fetch("/api/stock-transfers", { cache: "no-store" });
      if (res.ok) setTransfers((await res.json()) as TransferRow[]);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void loadTransfers();
  }, []);

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  };

  const productMatches = useMemo(
    () =>
      productTerm.trim()
        ? invProducts.filter((p) => p.name.toLowerCase().includes(productTerm.toLowerCase())).slice(0, 8)
        : [],
    [invProducts, productTerm],
  );

  const addLine = (p: InvProduct) => {
    setLines((ls) => [...ls, { key: crypto.randomUUID(), productId: p.id, variantIndex: 0, qty: 1 }]);
    setProductTerm("");
  };
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const productOf = (l: Line) => invProducts.find((p) => p.id === l.productId);
  const onHandAt = (l: Line, branch: Branch) => {
    const v = productOf(l)?.variants[l.variantIndex];
    return v ? variantStockAt(v, branch) : 0;
  };

  // Combined demand per product/variant, so the same item on two rows can't
  // together exceed what the source branch holds.
  const demand = new Map<string, number>();
  for (const l of lines) {
    const k = `${l.productId}#${l.variantIndex}`;
    demand.set(k, (demand.get(k) ?? 0) + l.qty);
  }
  const lineError = (l: Line): string | null => {
    if (!productOf(l)) return "Product not found";
    if (l.qty < 1) return "Qty must be ≥ 1";
    const src = onHandAt(l, fromBranch);
    if (l.qty > src) return `Only ${src} at ${branchLabel(fromBranch)}`;
    if ((demand.get(`${l.productId}#${l.variantIndex}`) ?? 0) > src) return `Rows together exceed ${src} at ${branchLabel(fromBranch)}`;
    return null;
  };
  const totalQty = lines.reduce((n, l) => n + l.qty, 0);
  const canSubmit = !saving && lines.length > 0 && fromBranch !== toBranch && lines.every((l) => !lineError(l));

  const submit = async () => {
    if (fromBranch === toBranch) return notify("Source and destination must differ.");
    if (lines.length === 0) return notify("Add at least one product.");
    if (lines.some(lineError)) return notify("Fix the highlighted lines first.");
    setSaving(true);
    try {
      const batchId = (batchRef.current ??= crypto.randomUUID());
      const res = await fetch("/api/stock-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          fromBranch,
          toBranch,
          note,
          lines: lines.map((l) => ({ productId: l.productId, variantIndex: l.variantIndex, quantity: l.qty })),
        }),
      });
      if (!res.ok) {
        batchRef.current = null; // a refused request starts a fresh submission next time
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "save failed");
      }
      await hydratePOS();
      await loadTransfers();
      notify(`Transferred ${totalQty} unit${totalQty === 1 ? "" : "s"} across ${lines.length} product${lines.length === 1 ? "" : "s"}`);
      batchRef.current = null;
      setLines([]);
      setNote("");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Couldn't record the transfer.");
    } finally {
      setSaving(false);
    }
  };

  const swapDirection = () => {
    if (lockedSource) return;
    setFromBranch(toBranch);
    setToBranch(fromBranch);
  };

  const field =
    "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";
  // The transfer log's filter controls: one height, one shape.
  const filterCls = "h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 focus:border-gold-500 focus:outline-none";
  const chip = (active: boolean) => cn("h-8 rounded-lg px-3 text-xs font-semibold transition-colors", active ? "bg-ink-900 text-ivory-50" : "text-ink-600 hover:text-ink-900");

  return (
    <div className="p-5 md:p-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>
      )}

      <div className="mb-6 border-l-4 border-ink-900 pl-4">
        <h1 className="text-2xl font-bold text-ink-900">Stock Transfers</h1>
        <p className="mt-1 text-sm text-ink-500">Move several products between branches at once — updates both on-hand buckets.</p>
      </div>

      <div className="space-y-6">
        <section className="space-y-5 rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
          <div className="grid gap-5 md:grid-cols-2">
            {/* Direction */}
            <div>
              <label className={label}>Direction</label>
              <div className="flex items-center gap-2">
                <select value={fromBranch} onChange={(e) => setFromBranch(e.target.value as Branch)} disabled={!!lockedSource} className={cn(field, "disabled:cursor-not-allowed disabled:opacity-70")}>
                  <BranchOptions />
                </select>
                <button
                  onClick={swapDirection}
                  disabled={!!lockedSource}
                  title="Swap direction"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-ink-200 bg-ivory-50 text-ink-500 hover:bg-ink-900/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                </button>
                <select value={toBranch} onChange={(e) => setToBranch(e.target.value as Branch)} className={field}>
                  {BRANCH_KEYS.map((b) => <option key={b} value={b}>{branchLabel(b)}</option>)}
                </select>
              </div>
              {fromBranch === toBranch && (
                <p className="mt-1 text-[11px] text-warning">Pick different source and destination branches.</p>
              )}
            </div>

            {/* Product lookup — each pick adds a table line */}
            <div>
              <label className={label}>Add product to this transfer</label>
              <div className="relative">
                <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2.5 focus-within:border-gold-500">
                  <Search className="h-4 w-4 shrink-0 text-ink-400" />
                  <input value={productTerm} onChange={(e) => setProductTerm(e.target.value)} placeholder="Search inventory…" className="w-full bg-transparent text-sm focus:outline-none" />
                </div>
                {productMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-ink-100 bg-white shadow-lg">
                    {productMatches.map((p) => (
                      <button key={p.id} onClick={() => addLine(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gold-50">
                        <span className="font-medium text-ink-900">{p.name}</span>
                        <span className="text-xs text-ink-400">{productStockAt(p, fromBranch)} at {branchLabel(fromBranch)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Editable lines */}
          <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-3 py-3">#</th>
                  <th>Product</th>
                  <th>Variant</th>
                  <th className="w-28 pr-2 text-right">At {branchLabel(fromBranch)}</th>
                  <th className="w-24 pr-2 text-right">Qty</th>
                  <th className="w-36 pr-2 text-right">After (src → dest)</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {lines.map((l, i) => {
                  const p = productOf(l);
                  const err = lineError(l);
                  const src = onHandAt(l, fromBranch);
                  const dst = onHandAt(l, toBranch);
                  return (
                    <tr key={l.key} className={cn("align-middle", err && "bg-danger/5")}>
                      <td className="px-3 py-2 text-xs text-ink-400">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <p className="font-medium text-ink-900">{p?.name ?? "—"}</p>
                        {err && <p className="text-[11px] text-danger">{err}</p>}
                      </td>
                      <td className="pr-2">
                        <select value={l.variantIndex} onChange={(e) => patch(l.key, { variantIndex: Number(e.target.value) })} className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-xs focus:outline-none">
                          {(p?.variants ?? []).map((v, vi) => (
                            <option key={vi} value={vi}>{v.attr}{v.finish ? ` · ${v.finish}` : ""} — {variantStockAt(v, fromBranch)} at {branchLabel(fromBranch)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="pr-2 text-right tabular-nums text-ink-600">{src}</td>
                      <td className="pr-2">
                        <input type="number" min={1} max={src} step={1} value={l.qty || ""} onChange={(e) => patch(l.key, { qty: toInt(e.target.value) })} className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gold-500 focus:outline-none" />
                      </td>
                      <td className="pr-2 text-right text-xs tabular-nums text-ink-600">{Math.max(0, src - l.qty)} → {dst + l.qty}</td>
                      <td className="pr-2">
                        <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line" className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-400">Search above to add products to this transfer.</td></tr>
                )}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr className="border-t border-ink-100 bg-[#FAF7EF] text-xs font-semibold text-ink-900">
                    <td colSpan={4} className="px-3 py-3 text-right uppercase tracking-wider text-ink-500">Total units</td>
                    <td className="pr-2 text-right tabular-nums">{totalQty}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="grid gap-3 border-t border-ink-100 pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className={label}>Note (optional, applies to all lines)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this moving?" className={field} />
            </div>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
            >
              <ArrowRight className="h-4 w-4" /> {saving ? "Transferring…" : "Transfer stock"}
            </button>
          </div>
        </section>

        {/* Recent transfers */}
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">Recent transfers</h2>
            <span className="text-[11px] text-ink-400">
              Showing <b className="text-ink-700">{shownTransfers.length}</b> of {transfers.length} · <b className="text-ink-700">{movedUnits}</b> unit{movedUnits === 1 ? "" : "s"} moved
            </span>
          </div>

          {/* INV-05: period, branches, product and a free search — everything a transfer can be tracked by. */}
          <div className="mb-3 space-y-3 rounded-2xl border border-ink-100 bg-ivory-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1 rounded-xl bg-ink-900/[0.04] p-1">
                {PERIODS.map((p) => (
                  <button key={p.key} onClick={() => applyPeriod(p.key)} className={chip(period === p.key)}>{p.label}</button>
                ))}
              </div>
              {period === "custom" && (
                <div className="flex items-center gap-2">
                  <input type="date" value={fFrom} max={fTo || undefined} onChange={(e) => setFFrom(e.target.value)} aria-label="From date" className={filterCls} />
                  <span className="text-xs text-ink-400">to</span>
                  <input type="date" value={fTo} min={fFrom || undefined} onChange={(e) => setFTo(e.target.value)} aria-label="To date" className={filterCls} />
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                {hasTransferFilter && (
                  <button onClick={clearFilters} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-600 hover:border-gold-500 hover:text-gold-600">
                    <X className="h-3.5 w-3.5" /> Clear filters
                  </button>
                )}
                <button
                  type="button"
                  onClick={exportXlsx}
                  disabled={shownTransfers.length === 0}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sheet className="h-3.5 w-3.5 text-gold-600" /> Excel
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select value={fSrc} onChange={(e) => setFSrc(e.target.value)} aria-label="From branch" className={filterCls}>
                <option value="all">From: all branches</option>
                {BRANCH_KEYS.map((b) => <option key={b} value={b}>From: {branchLabel(b)}</option>)}
              </select>
              <select value={fDest} onChange={(e) => setFDest(e.target.value)} aria-label="To branch" className={filterCls}>
                <option value="all">To: all branches</option>
                {BRANCH_KEYS.map((b) => <option key={b} value={b}>To: {branchLabel(b)}</option>)}
              </select>
              <select value={fProduct} onChange={(e) => setFProduct(e.target.value)} aria-label="Product" className={cn(filterCls, "max-w-[220px]")}>
                <option value="all">All products</option>
                {transferredProducts.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <div className="ml-auto flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 focus-within:border-gold-500 lg:max-w-sm">
                <Search className="h-4 w-4 shrink-0 text-ink-400" />
                <input value={fQuery} onChange={(e) => setFQuery(e.target.value)} placeholder="Product, variant, note or who moved it…" className="w-full bg-transparent text-sm focus:outline-none" />
                {fQuery && <button onClick={() => setFQuery("")} aria-label="Clear search" className="text-ink-400 hover:text-ink-700"><X className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
            <table className="w-full min-w-[760px] text-sm">
              <colgroup><col className="w-44" /><col /><col className="w-56" /><col className="w-40" /><col className="w-28" /><col className="w-24" /></colgroup>
              <thead>
                <tr className="border-b border-ink-100 bg-white/50 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-4 py-3">When</th>
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3">Direction</th>
                  <th className="px-3 py-3">By</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {shownTransfers.map((r) => (
                  <tr key={r.id} className="h-16 align-middle text-ink-700 transition-colors hover:bg-ink-900/[0.03]">
                    <td className="whitespace-nowrap px-4 text-xs text-ink-600">{fmt(r.transferredAt)}</td>
                    <td className="px-3">
                      <p className="truncate font-semibold text-ink-900" title={r.productName}>{r.productName}</p>
                      {r.variant && <p className="truncate text-[11px] text-ink-400">{r.variant}</p>}
                    </td>
                    <td className="px-3">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink-900/[0.05] px-2.5 py-1 text-[11px] font-semibold text-ink-700">
                        {branchLabel(r.fromBranch)} <ArrowRight className="h-3 w-3 text-gold-600" /> {branchLabel(r.toBranch)}
                      </span>
                      {r.note && <p className="mt-0.5 truncate text-[10px] text-ink-400" title={r.note}>{r.note}</p>}
                    </td>
                    <td className="px-3 text-xs text-ink-600">
                      <span className="truncate" title={r.createdByName || r.createdBy || ""}>{r.createdByName || r.createdBy || "—"}</span>
                    </td>
                    <td className="px-3">
                      <span className="whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-success/15 text-success">Completed</span>
                    </td>
                    <td className="px-4 text-right font-bold tabular-nums text-ink-900">{r.quantity}</td>
                  </tr>
                ))}
                {shownTransfers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-sm text-ink-400">
                      <ArrowRightLeft className="mx-auto mb-2 h-6 w-6 text-ink-300" />
                      {transfers.length === 0 ? "No transfers yet." : "No transfers match these filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
