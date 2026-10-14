"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, X, Receipt, ChevronDown } from "lucide-react";
import { useVendors } from "@/lib/store/vendors";
import { useBranchScope } from "@/lib/store/branch";
import { formatINR, cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { LoadingPanel, OfflinePanel } from "@/components/admin/LoadState";
import { PaymentDialog } from "@/components/purchases/PaymentDialog";
import { PayVendorDialog } from "@/components/purchases/PayVendorDialog";
import { OpeningBalanceDialog } from "@/components/purchases/OpeningBalanceDialog";
import { ApplyPaymentDialog, type LoosePayment } from "@/components/purchases/ApplyPaymentDialog";
import type { PurchaseRow } from "@/components/purchases/types";
import { useAuth } from "@/lib/store/auth";
import { BRANCH_KEYS, type Branch, type BranchFilter, branchLabel } from "@/lib/stock";

interface OutstandingRow {
  vendorId: string;
  branch: Branch;
  purchased: number;
  paid: number;
  outstanding: number;
}

interface StatementEntry {
  kind: "purchase" | "payment";
  id: string;
  at: string;
  branch?: Branch | null;
  amount: number;
  reference?: string;
  invoiceNo?: string;
  mode?: string;
  lines?: { productName: string; variant: string; quantity: number; unitCost: number; branch: string }[];
}

interface StatementResponse {
  entries: StatementEntry[];
  byBranch: Record<Branch, number>;
}

export default function VendorOutstandingsPage() {
  const vendors = useVendors((s) => s.vendors);
  const hydrateVendors = useVendors((s) => s.hydrate);
  const canSwitch = useBranchScope((s) => s.canSwitch);
  const allowedBranches = useBranchScope((s) => s.allowed);
  const lockedBranch: BranchFilter | null = !canSwitch && allowedBranches.length === 1 ? allowedBranches[0] : null;

  const [rows, setRows] = useState<OutstandingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [branch, setBranch] = useState<BranchFilter>(lockedBranch ?? "all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, StatementEntry[] | "error">>({});

  const toggle = async (vendorId: string) => {
    if (expanded === vendorId) return setExpanded(null);
    setExpanded(vendorId);
    if (details[vendorId]) return;
    try {
      const res = await fetch(`/api/vendors/${vendorId}/statement`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as StatementResponse;
      setDetails((m) => ({ ...m, [vendorId]: d.entries }));
    } catch {
      setDetails((m) => ({ ...m, [vendorId]: "error" }));
    }
  };

  // Deep link from the Vendors page: /admin/vendors/outstandings?vendor=<id>
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("vendor");
    if (v) setOpen(v);
  }, []);

  useEffect(() => { void hydrateVendors(); }, [hydrateVendors]);
  useEffect(() => { if (lockedBranch) setBranch(lockedBranch); }, [lockedBranch]);

  const load = async () => {
    try {
      const res = await fetch("/api/vendor-outstandings", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setRows((await res.json()) as OutstandingRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load outstandings.");
    }
  };
  useEffect(() => { void load(); }, []);

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;

  // Aggregate per vendor (sum across branches shown), while still showing the branch split per row.
  const scoped = useMemo(() => {
    if (!rows) return [] as OutstandingRow[];
    return rows
      .filter((r) => branch === "all" || r.branch === branch)
      .filter((r) => {
        const q = query.trim().toLowerCase();
        return !q || vendorName(r.vendorId).toLowerCase().includes(q);
      });
  }, [rows, branch, query, vendors]);

  const grouped = useMemo(() => {
    const m = new Map<string, { vendorId: string; branches: OutstandingRow[]; purchased: number; paid: number; outstanding: number }>();
    for (const r of scoped) {
      const e = m.get(r.vendorId) ?? { vendorId: r.vendorId, branches: [], purchased: 0, paid: 0, outstanding: 0 };
      e.branches.push(r);
      e.purchased += r.purchased;
      e.paid += r.paid;
      e.outstanding += r.outstanding;
      m.set(r.vendorId, e);
    }
    return [...m.values()].sort((a, b) => b.outstanding - a.outstanding);
  }, [scoped]);

  const totals = useMemo(() => ({
    purchased: grouped.reduce((n, g) => n + g.purchased, 0),
    paid: grouped.reduce((n, g) => n + g.paid, 0),
    outstanding: grouped.reduce((n, g) => n + g.outstanding, 0),
  }), [grouped]);

  const exportCSV = () => {
    const r2 = (paise: number) => (paise / 100).toFixed(2);
    const head = ["Vendor", "Branch", "Purchased", "Paid", "Outstanding"];
    const body = scoped.map((r) => [vendorName(r.vendorId), branchLabel(r.branch), r2(r.purchased), r2(r.paid), r2(r.outstanding)]);
    downloadCsv(`vendor-outstandings-${Date.now()}.csv`, [head, ...body]);
  };

  const pill = "rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all";

  if (rows === null) {
    return (
      <div className="p-5 md:p-8">
        <h1 className="text-2xl font-bold text-ink-900">Vendor Outstandings</h1>
        <div className="mt-4">
          {error ? <OfflinePanel hint={error} /> : <LoadingPanel label="Loading vendor outstandings…" />}
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/vendors" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-900"><ArrowLeft className="h-3 w-3" /> Back to Vendors</Link>
          <h1 className="text-2xl font-bold text-ink-900">Vendor Outstandings</h1>
          <p className="mt-1 text-sm text-ink-500">Branch-wise balance. Purchased − Paid, with every receipt and payment accounted for.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendor…" className="w-56 rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
          <button onClick={exportCSV} disabled={scoped.length === 0} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-50">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      <details className="mb-6 rounded-xl border border-ink-100 bg-ivory-50 px-4 py-3 text-sm text-ink-600">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-ink-500">How this works</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li><b>Outstanding</b> for a branch = what it bought (goods + GST) − what it paid. A minus means that branch paid for another branch&apos;s goods.</li>
          <li><b>Starting balance:</b> open a vendor with <i>View</i> and use <i>+ Opening balance</i> (admin) to enter what a branch already owed before this system. It then behaves like a bill.</li>
          <li><b>Paying:</b> every payment is made against one bill. Open a vendor, press <i>Pay</i> on the bill, and enter how much each branch pays. Only branches that received that bill&apos;s stock can pay it.</li>
          <li><b>Pay vendor:</b> enter one amount and it is spread over the oldest unpaid bills. The table shows which bill gets what and which branch pays it before you save, and every bill keeps its own paid / left figures.</li>
          <li><b>Older payments</b> that weren&apos;t against a bill appear as &ldquo;Payments not against a bill&rdquo; — an admin can apply them to bills.</li>
        </ul>
      </details>

      {/* Branch filter */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Branch</span>
          {lockedBranch ? (
            <span className={cn(pill, "bg-gold-500 text-ink-900")}>{lockedBranch}</span>
          ) : (
            ([["all", "Overall"], ...BRANCH_KEYS.map((b) => [b, branchLabel(b)] as const)] as const).map(([k, label]) => (
              <button key={k} onClick={() => setBranch(k as BranchFilter)} className={cn(pill, branch === k ? "bg-gold-500 text-ink-900" : "text-ink-500 hover:text-ink-900")}>{label}</button>
            ))
          )}
        </div>
      </div>

      {/* Totals */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-ink-100 bg-ivory-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Total Purchased</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-ink-900">{formatINR(totals.purchased)}</p>
        </div>
        <div className="rounded-xl border border-ink-100 bg-ivory-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Total Paid</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-success">{formatINR(totals.paid)}</p>
        </div>
        <div className={cn("rounded-xl border p-4", totals.outstanding > 0 ? "border-danger/30 bg-danger/5" : "border-ink-100 bg-ivory-50")}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Total Outstanding</p>
          <p className={cn("mt-1 text-xl font-bold tabular-nums", totals.outstanding > 0 ? "text-danger" : "text-ink-900")}>{formatINR(totals.outstanding)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              <th className="px-4 py-3">Vendor</th>
              <th>Branch split</th>
              <th className="text-right">Purchased</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Outstanding</th>
              <th className="pr-4 text-right">Statement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            {grouped.map((g) => (
              <Fragment key={g.vendorId}>
              <tr className="text-ink-800">
                <td className="px-4 py-3 font-semibold text-ink-900">
                  <button onClick={() => void toggle(g.vendorId)} className="inline-flex items-center gap-1 hover:text-gold-600" title="Show what was bought">
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded === g.vendorId && "rotate-180")} />
                    {vendorName(g.vendorId)}
                  </button>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    {g.branches.map((b) => (
                      <span key={b.branch} className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", b.outstanding > 0 ? "bg-danger/10 text-danger" : "bg-success/10 text-success")}>
                        {branchLabel(b.branch)}: {formatINR(b.outstanding)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="text-right tabular-nums">{formatINR(g.purchased)}</td>
                <td className="text-right tabular-nums text-success">{formatINR(g.paid)}</td>
                <td className={cn("text-right font-semibold tabular-nums", g.outstanding > 0 ? "text-danger" : "text-ink-400")}>{formatINR(g.outstanding)}</td>
                <td className="pr-4 text-right">
                  <button onClick={() => setOpen(g.vendorId)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-900/5 hover:text-gold-600">
                    <FileText className="h-3.5 w-3.5" /> View
                  </button>
                </td>
              </tr>
              {expanded === g.vendorId && (
                <tr className="bg-[#FAF7EF]">
                  <td colSpan={6} className="px-4 py-3">
                    <PurchasedItems entries={details[g.vendorId]} branch={branch} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {grouped.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-400">No outstandings{branch !== "all" ? ` in ${branch}` : ""}.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <StatementDrawer
          vendorId={open}
          vendorName={vendorName(open)}
          lockedBranch={lockedBranch}
          onClose={() => setOpen(null)}
          onChanged={async () => { await load(); }}
        />
      )}
    </div>
  );
}

/* ──────────────── Items bought, shown under a vendor row ──────────────── */
function PurchasedItems({ entries, branch }: { entries: StatementEntry[] | "error" | undefined; branch: BranchFilter }) {
  if (!entries) return <p className="text-xs text-ink-400">Loading items…</p>;
  if (entries === "error") return <p className="text-xs text-danger">Couldn&apos;t load items.</p>;
  const purchases = entries.filter((e) => e.kind === "purchase");
  if (purchases.length === 0) return <p className="text-xs text-ink-400">No purchases yet.</p>;
  return (
    <div className="space-y-3">
      {purchases.map((p) => {
        const lines = (p.lines ?? []).filter((l) => branch === "all" || l.branch === branch);
        if (lines.length === 0) return null;
        return (
          <div key={p.id}>
            <p className="mb-1 text-[11px] font-semibold text-ink-700">
              {p.at.slice(0, 10)} · {p.id}{p.invoiceNo ? ` · Inv ${p.invoiceNo}` : ""} · <span className="tabular-nums">{formatINR(p.amount)}</span>
            </p>
            <table className="w-full max-w-3xl text-xs">
              <tbody className="divide-y divide-ink-100">
                {lines.map((l, i) => (
                  <tr key={i} className="text-ink-700">
                    <td className="py-1 font-medium text-ink-900">{l.productName}{l.variant ? ` (${l.variant})` : ""}</td>
                    <td>{branchLabel(l.branch)}</td>
                    <td className="text-right tabular-nums">{l.quantity} × {formatINR(l.unitCost)}</td>
                    <td className="text-right tabular-nums">{formatINR(l.quantity * l.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────── Statement drawer with on-account payment ──────────────── */
function StatementDrawer({
  vendorId, vendorName, lockedBranch, onClose, onChanged,
}: {
  vendorId: string;
  vendorName: string;
  lockedBranch: Branch | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [data, setData] = useState<StatementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = useAuth((s) => s.isAdmin);
  const [bills, setBills] = useState<PurchaseRow[]>([]);
  const [loose, setLoose] = useState<LoosePayment[]>([]);
  const [payBill, setPayBill] = useState<PurchaseRow | null>(null);
  const [payingVendor, setPayingVendor] = useState(false);
  const [applying, setApplying] = useState<LoosePayment | null>(null);
  const [addingOpening, setAddingOpening] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/vendors/${vendorId}/statement`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setData((await res.json()) as StatementResponse);
      const [pr, lr] = await Promise.all([
        fetch("/api/purchases", { cache: "no-store" }),
        fetch(`/api/vendors/${vendorId}/unapplied`, { cache: "no-store" }),
      ]);
      if (pr.ok) setBills(((await pr.json()) as PurchaseRow[]).filter((p) => p.vendorId === vendorId));
      if (lr.ok) setLoose((await lr.json()) as LoosePayment[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load statement.");
    }
  };
  useEffect(() => { void load(); }, [vendorId]);

  const rows = useMemo(() => {
    if (!data) return [] as (StatementEntry & { running: number })[];
    let running = 0;
    return data.entries.map((e) => {
      running += e.kind === "purchase" ? e.amount : -e.amount;
      return { ...e, running };
    });
  }, [data]);

  const outstanding = rows.length > 0 ? rows[rows.length - 1].running : 0;

  const done = async (msg: string) => {
    setPayBill(null); setPayingVendor(false); setApplying(null); setAddingOpening(false);
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
    await load();
    await onChanged();
  };
  const balanceOf = (p: PurchaseRow) => Math.max(0, p.totalAmount - p.amountPaid - p.paymentsTotal);
  const unpaid = bills.filter((p) => balanceOf(p) > 0).sort((x, y) => (x.purchaseDate || x.createdAt).localeCompare(y.purchaseDate || y.createdAt));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink-950/40 backdrop-blur-sm" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-ivory-50 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-ivory-50 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Vendor Statement</p>
            <h3 className="text-lg font-bold text-ink-900">{vendorName}</h3>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
        </header>

        <div className="px-5 py-4">
          {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">{error}</p>}
          <div className="mb-4 flex items-center justify-between rounded-xl bg-ink-900/5 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">Current outstanding</span>
            <span className={cn("text-lg font-bold tabular-nums", outstanding > 0 ? "text-danger" : "text-ink-900")}>{formatINR(outstanding)}</span>
          </div>

          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Unpaid bills</h4>
              <div className="flex items-center gap-3">
                {unpaid.length > 0 && (
                  <button onClick={() => setPayingVendor(true)} className="rounded-lg bg-gold-500 px-3 py-1 text-xs font-bold text-ink-900 hover:bg-gold-400">Pay vendor</button>
                )}
                {isAdmin && (
                  <button onClick={() => setAddingOpening(true)} className="text-xs font-semibold text-gold-600 hover:underline">+ Opening balance</button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {unpaid.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{b.openingBranch ? `Opening balance · ${branchLabel(b.openingBranch)}` : b.invoiceNo || b.id}</p>
                    <p className="text-[11px] text-ink-400">{b.purchaseDate || b.createdAt.slice(0, 10)} · total {formatINR(b.totalAmount)}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-danger">{formatINR(balanceOf(b))}</span>
                  <button onClick={() => setPayBill(b)} className="inline-flex items-center gap-1 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-ink-800">
                    <Receipt className="h-3.5 w-3.5" /> Pay
                  </button>
                </div>
              ))}
              {unpaid.length === 0 && <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-400">No unpaid bills.</p>}
            </div>
            <p className="mt-2 text-[11px] text-ink-400">Pay one bill with its Pay button, or use Pay vendor to spread one amount over the oldest bills. Either way each payment lands on a bill, so every invoice shows what is still owed on it.</p>
          </div>

          {loose.length > 0 && (
            <div className="mb-5 rounded-xl border border-gold-500/40 bg-gold-500/5 p-3">
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-ink-600">Payments not against a bill</h4>
              <p className="mb-2 text-[11px] text-ink-500">Paid to the vendor before payments had to name a bill.{isAdmin ? " Apply each one to the bills it settled." : " An admin can apply them to bills."}</p>
              <div className="space-y-1.5">
                {loose.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 text-xs">
                    <span className="flex-1 text-ink-700">{l.paidAt.slice(0, 10)} · {branchLabel(l.branch)} · {l.mode || "—"}</span>
                    <b className="tabular-nums text-ink-900">{formatINR(l.amount)}</b>
                    {isAdmin && <button onClick={() => setApplying(l)} className="rounded-lg border border-ink-200 px-2.5 py-1 font-semibold text-ink-700 hover:bg-ink-900/5">Apply to bills</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500">Ledger</h4>
          <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[9px] font-semibold uppercase tracking-wider text-ink-400">
                  <th className="px-3 py-2">Date</th>
                  <th>Entry</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th className="pr-3 text-right">Running</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {rows.map((r) => (
                  <tr key={r.id} className="text-ink-700">
                    <td className="px-3 py-2 text-ink-500">{r.at.slice(0, 10)}</td>
                    <td>
                      <p className="font-medium text-ink-900">{r.kind === "purchase" ? `Purchase ${r.id}` : `Payment${r.mode ? ` · ${r.mode}` : ""}`}</p>
                      <p className="text-[10px] text-ink-400">{branchLabel(r.branch)}{r.invoiceNo ? ` · Inv ${r.invoiceNo}` : ""}{r.reference ? ` · ${r.reference}` : ""}</p>
                      {r.lines && r.lines.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-[10px] text-ink-500">
                          {r.lines.map((l, i) => (
                            <li key={i}>
                              {l.productName}{l.variant ? ` (${l.variant})` : ""} — {l.quantity} × {formatINR(l.unitCost)}
                              <span className="text-ink-400"> · {branchLabel(l.branch)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{r.kind === "purchase" ? formatINR(r.amount) : "—"}</td>
                    <td className="text-right tabular-nums text-success">{r.kind === "payment" ? formatINR(r.amount) : "—"}</td>
                    <td className={cn("pr-3 text-right font-semibold tabular-nums", r.running > 0 ? "text-danger" : "text-ink-500")}>{formatINR(r.running)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-ink-400">No ledger entries yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {payingVendor && <PayVendorDialog vendorId={vendorId} vendorName={vendorName} bills={bills} onClose={() => setPayingVendor(false)} onDone={done} />}
        {payBill && <PaymentDialog purchase={payBill} vendorName={vendorName} onClose={() => setPayBill(null)} onDone={done} />}
        {addingOpening && <OpeningBalanceDialog vendorId={vendorId} onClose={() => setAddingOpening(false)} onDone={done} />}
        {applying && <ApplyPaymentDialog payment={applying} bills={bills} onClose={() => setApplying(null)} onDone={done} />}
        {toast && <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>}
      </aside>
    </div>
  );
}
