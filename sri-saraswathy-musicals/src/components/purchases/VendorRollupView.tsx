"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { formatINR, cn } from "@/lib/utils";
import { branchLabel } from "@/lib/stock";
import { useBranchScope } from "@/lib/store/branch";
import { Pager } from "@/components/ui/Pager";
import { StatementDrawer } from "./StatementDrawer";
import type { VendorRollupPage, VendorRollupRow } from "@/lib/db/queries/purchaseViews";

const PAGE_SIZES = [10, 25, 50, 100];

const day = (d: string) => {
  const x = new Date(`${d}T12:00:00`);
  return isNaN(+x) ? d : x.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/** What a branch owes a vendor, in words an owner reads at a glance. A minus is explained, not just shown. */
function BranchOwes({ left }: { left: number }) {
  if (left > 0) return <span className="font-semibold tabular-nums text-danger">owes {formatINR(left)}</span>;
  if (left < 0) return <span className="font-semibold tabular-nums text-ink-700">paid {formatINR(-left)} extra</span>;
  return <span className="font-semibold text-success">✓ settled</span>;
}

/**
 * The "By vendor" tab: one card per vendor with what each branch bought, paid and still owes. A branch that paid
 * for another branch's goods says so in plain words. "View bills" jumps to that vendor's bills; "Pay / Statement"
 * opens the ledger where payments are made.
 */
export function VendorRollupView({
  version, openVendor, onShowBills, onChanged,
}: {
  version: number;
  /** A vendor whose statement should open straight away (from a link). */
  openVendor?: string;
  onShowBills: (vendorId: string) => void;
  onChanged: () => void;
}) {
  const allowed = useBranchScope((s) => s.allowed);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("all");
  const [openOnly, setOpenOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<VendorRollupPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statement, setStatement] = useState<VendorRollupRow | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const key = new URLSearchParams({ view: "vendors", page: String(page), pageSize: String(pageSize), ...(q.trim() ? { q: q.trim() } : {}), ...(branch !== "all" ? { branch } : {}), ...(openOnly ? { status: "open" } : {}) }).toString();
  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    fetch(`/api/vendor-bills?${key}`, { cache: "no-store", signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<VendorRollupPage>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { setData(d); setError(false); setLoading(false); })
      .catch(() => { if (!ctl.signal.aborted) { setError(true); setLoading(false); } });
    return () => ctl.abort();
  }, [key, version, retry]);

  // A link to one vendor opens its statement as soon as the vendor is known.
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    if (linked || !openVendor || !data) return;
    const row = data.rows.find((r) => r.vendorId === openVendor);
    if (row) { setStatement(row); setLinked(true); }
  }, [data, openVendor, linked]);

  const input = "rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none";
  const lab = "text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500";
  const sum = data?.summary;
  const from = data && data.rows.length ? (data.page - 1) * data.pageSize + 1 : 0;

  return (
    <div>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Vendors" value={sum ? String(sum.vendors) : "—"} />
        <Tile label="Bought" value={sum ? formatINR(sum.bought) : "—"} />
        <Tile label="Paid" value={sum ? formatINR(sum.paid) : "—"} tone="good" />
        <Tile label="You owe" value={sum ? formatINR(sum.left) : "—"} tone={sum && sum.left > 0 ? "bad" : undefined} />
      </div>
      {sum && Object.keys(sum.branches).length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {Object.values(sum.branches).map((t) => (
            <div key={t.branch} className="rounded-xl border border-ink-100 bg-ivory-50 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-700">{branchLabel(t.branch)}</p>
              <p className="mt-1.5 text-xs text-ink-500">Bought <b className="tabular-nums text-ink-900">{formatINR(t.bought)}</b></p>
              <p className="text-xs text-ink-500">Paid <b className="tabular-nums text-success">{formatINR(t.paid)}</b></p>
              <p className="text-xs text-ink-500"><BranchOwes left={t.left} /></p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className={lab}>Search
          <span className="relative mt-1 block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
            <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Vendor name…" className={cn(input, "w-60 pl-8")} />
          </span>
        </label>
        {allowed.length > 1 && (
          <label className={lab}>Branch
            <select value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1); }} className={cn(input, "mt-1 block")}>
              <option value="all">All branches</option>
              {allowed.map((b) => <option key={b} value={b}>{branchLabel(b)}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 pb-2 text-xs font-semibold text-ink-700">
          <input type="checkbox" checked={openOnly} onChange={(e) => { setOpenOnly(e.target.checked); setPage(1); }} /> Only vendors I owe
        </label>
      </div>

      <div className={cn("space-y-3 transition-opacity", loading && data && "opacity-60")} aria-busy={loading}>
        {data?.rows.map((v) => (
          <div key={v.vendorId} className="rounded-2xl border border-ink-100 bg-ivory-50 p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_auto] md:items-center md:gap-5">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-ink-900">{v.vendorName}</p>
                <p className="mt-0.5 text-xs text-ink-500">{v.bills} bill{v.bills === 1 ? "" : "s"}{v.lastDate ? ` · last ${day(v.lastDate)}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {v.branches.map((b) => (
                  <span key={b.branch} className={cn("rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight", b.left > 0 ? "border-danger/25 bg-danger/5" : "border-ink-100 bg-white")}>
                    <b className="text-ink-900">{branchLabel(b.branch)}</b>
                    <span className="block"><BranchOwes left={b.left} /></span>
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4 text-right text-xs md:min-w-[17rem]">
                <div><p className="text-[10px] uppercase tracking-wider text-ink-400">Bought</p><p className="font-bold tabular-nums text-ink-900">{formatINR(v.bought)}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-ink-400">Paid</p><p className="font-bold tabular-nums text-success">{formatINR(v.paid)}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-ink-400">{v.left < 0 ? "Credit" : "Owed"}</p><p className={cn("font-bold tabular-nums", v.left > 0 ? "text-danger" : "text-ink-500")}>{v.left === 0 ? "—" : formatINR(Math.abs(v.left))}</p></div>
              </div>
            </div>
            {v.branches.some((b) => b.left < 0) && v.branches.some((b) => b.left > 0) && (
              <p className="mt-2 text-[11px] text-ink-500">A branch that &ldquo;paid extra&rdquo; settled for another branch&apos;s goods — the branches add up to what you owe the vendor.</p>
            )}
            {v.unapplied.count > 0 && (
              <p className="mt-2 rounded-lg bg-gold-500/10 px-3 py-1.5 text-[11px] text-ink-700">
                {formatINR(v.unapplied.amount)} was paid in {v.unapplied.count} payment{v.unapplied.count === 1 ? "" : "s"} that name no bill. Open the statement to match {v.unapplied.count === 1 ? "it" : "them"} to bills.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => onShowBills(v.vendorId)} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-900/5">View bills</button>
              <button onClick={() => setStatement(v)} className="rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-ivory-50 hover:bg-ink-800">Pay / Statement</button>
            </div>
          </div>
        ))}
        {!data && loading && Array.from({ length: 3 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-ink-100/60" />)}
        {data && data.rows.length === 0 && <p className="rounded-2xl border border-dashed border-ink-200 px-4 py-14 text-center text-sm text-ink-400">{openOnly || q ? "No vendors match." : "No vendor bills yet."}</p>}
        {error && <p className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-4 text-sm text-danger">Couldn&apos;t load the vendors. <button onClick={() => setRetry((n) => n + 1)} className="font-semibold underline">Try again</button></p>}
      </div>
      {data && (
        <Pager
          className="mt-4"
          page={data.page} pages={data.pages} total={data.total} from={from} to={from ? from + data.rows.length - 1 : 0}
          onPage={setPage} pageSize={pageSize} pageSizes={PAGE_SIZES} onPageSize={(n) => { setPageSize(n); setPage(1); }}
        />
      )}

      {statement && (
        <StatementDrawer
          vendorId={statement.vendorId}
          vendorName={statement.vendorName}
          lockedBranch={null}
          onClose={() => setStatement(null)}
          onChanged={async () => onChanged()}
        />
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className={cn("rounded-xl border p-4", tone === "bad" ? "border-danger/30 bg-danger/5" : "border-ink-100 bg-ivory-50")}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-ink-900")}>{value}</p>
    </div>
  );
}
