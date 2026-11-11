"use client";
import { Pager } from "@/components/ui/Pager";
import { usePaged } from "@/lib/client/usePaged";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench, Plus, Search, AlertTriangle,
  ExternalLink, Trash2, MessageCircle, ChevronRight,
} from "lucide-react";
import {
  useRepair, alertLevel, daysUntil, statusMeta, PRIORITY_META,
  chargeBase, grossTotal, balanceDue, isClosed, REPAIR_STATUS,
  type RepairStatus, type RepairTicket,
} from "@/lib/store/repair";
import { serviceEarned } from "@/lib/client/sales";
import { LoadErrorBanner, LoadingInline } from "@/components/admin/LoadState";
import { ticketPayments, modesLabel, REPAIR_PAY_MODES, PAY_MODE_LABEL } from "@/lib/billing/repairPayments";
import type { Branch } from "@/lib/store/pos";
import { waLink } from "@/lib/data/business";
import { useBranchContacts, phoneFor } from "@/lib/client/branchContacts";
import { RepairTicketModal, repairIntakeMessage } from "@/components/admin/RepairTicketModal";
import { formatINR, cn } from "@/lib/utils";
import { branchLabel } from "@/lib/stock";
import { BranchOptions } from "@/components/admin/BranchOptions";
import { ReportTab, PERIODS, periodBounds, dayKey, type ReportPeriod } from "@/components/admin/ServiceReport";

type Tab = "tickets" | "report";
type BranchFilter = Branch | "all";
type StatusFilter = RepairStatus | "all" | "active";
type PayFilter = "all" | "unpaid" | (typeof REPAIR_PAY_MODES)[number];
type SortKey = "deadline" | "new" | "old" | "amount-high" | "amount-low" | "priority";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function KpiCell({ label, value, sub, dot, tone }: { label: string; value: string; sub?: string; dot: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-ivory-50 px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">{label}</p>
      </div>
      <p className={cn("mt-1.5 text-xl font-bold tabular-nums md:text-2xl", tone ?? "text-ink-900")}>{value}</p>
      {sub && <p className="text-[11px] text-ink-400">{sub}</p>}
    </div>
  );
}

export default function ServicePage() {
  const router = useRouter();
  const tickets = useRepair((s) => s.tickets);
  const hydrated = useRepair((s) => s.hydrated);
  const loadError = useRepair((s) => s.loadError);
  const deleteTicket = useRepair((s) => s.deleteTicket);
  const updateTicket = useRepair((s) => s.updateTicket);
  const contacts = useBranchContacts();

  const [tab, setTab] = useState<Tab>("tickets");
  const [modal, setModal] = useState<{ open: boolean; ticket: RepairTicket | null }>({ open: false, ticket: null });
  const [statusF, setStatusF] = useState<StatusFilter>("all");
  const [branchF, setBranchF] = useState<BranchFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("deadline");
  const [payF, setPayF] = useState<PayFilter>("all");
  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const overdue = useMemo(() => tickets.filter((t) => alertLevel(t) === "overdue"), [tickets]);
  const dueSoon = useMemo(() => tickets.filter((t) => alertLevel(t) === "due-soon"), [tickets]);

  const rows = useMemo(() => {
    const bounds = periodBounds(period, from, to);
    let list = tickets.filter((t) => {
      if (bounds) {
        const k = dayKey(t.createdAt);
        if (k < bounds.lo || k > bounds.hi) return false;
      }
      if (payF !== "all") {
        const pays = ticketPayments(t);
        if (payF === "unpaid" ? pays.length > 0 : !pays.some((p) => p.mode === payF)) return false;
      }
      if (statusF === "active" && isClosed(t.status)) return false;
      if (statusF !== "all" && statusF !== "active" && t.status !== statusF) return false;
      if (branchF !== "all" && t.branch !== branchF) return false;
      const q = query.trim().toLowerCase();
      if (q && !(
        t.id.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.phone.includes(query.trim()) ||
        t.productName.toLowerCase().includes(q)
      )) return false;
      return true;
    });
    const prRank = { urgent: 0, high: 1, normal: 2, low: 3 };
    list = [...list].sort((a, b) => {
      if (sort === "new") return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sort === "old") return +new Date(a.createdAt) - +new Date(b.createdAt);
      if (sort === "amount-high") return grossTotal(b) - grossTotal(a);
      if (sort === "amount-low") return grossTotal(a) - grossTotal(b);
      if (sort === "priority") return prRank[a.priority] - prRank[b.priority] || +new Date(a.deadline) - +new Date(b.deadline);
      // deadline: open first (by soonest), closed last
      const ac = isClosed(a.status), bc = isClosed(b.status);
      if (ac !== bc) return ac ? 1 : -1;
      return +new Date(a.deadline) - +new Date(b.deadline);
    });
    return list;
  }, [tickets, statusF, branchF, query, sort, payF, period, from, to]);
  const pg = usePaged(rows, `${query}|${sort}|${statusF}|${branchF}|${payF}|${period}|${from}|${to}`);
  const filtered = statusF !== "all" || branchF !== "all" || payF !== "all" || period !== "all" || !!query.trim();
  const clearFilters = () => {
    setStatusF("all");
    setBranchF("all");
    setPayF("all");
    setPeriod("all");
    setFrom("");
    setTo("");
    setQuery("");
  };

  const kpi = useMemo(() => {
    const active = tickets.filter((t) => !isClosed(t.status));
    const completed = tickets.filter((t) => t.status === "completed");
    const now = new Date();
    const completedThisMonth = completed.filter((t) => {
      const d = new Date(t.completedAt || t.updatedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const revenue = tickets.reduce((n, t) => n + serviceEarned(t), 0);
    return {
      active: active.length,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      completedMonth: completedThisMonth.length,
      revenue,
    };
  }, [tickets, overdue, dueSoon]);

  const sendWhatsApp = (t: RepairTicket, e: React.MouseEvent) => {
    e.stopPropagation();
    updateTicket(t.id, { whatsappSentAt: new Date().toISOString() }, "Update sent via WhatsApp");
    window.open(waLink(t.phone, repairIntakeMessage(t, phoneFor(contacts, t.branch))), "_blank", "noopener,noreferrer");
  };

  const selCls = "w-full rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-700 focus:border-gold-500 focus:outline-none";

  return (
    <div className="p-5 md:p-8">
      <LoadErrorBanner message={loadError} onRetry={() => void useRepair.getState().hydrate()} />
      {modal.open && <RepairTicketModal ticket={modal.ticket} onClose={() => setModal({ open: false, ticket: null })} />}

      {/* Confirm delete */}
      {confirmId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4 backdrop-blur-sm" onClick={() => setConfirmId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink-900">Delete ticket?</h3>
            <p className="mt-2 text-sm text-ink-500">{confirmId} will be permanently removed from the service register. This cannot be undone.</p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmId(null)} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
              <button onClick={() => { deleteTicket(confirmId); setConfirmId(null); }} className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="border-l-4 border-ink-900 pl-4">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900"><Wrench className="h-6 w-6 text-gold-600" /> Service &amp; Repairs</h1>
          <p className="mt-1 text-sm text-ink-500">Raise tickets, track deadlines &amp; bill repairs · admin only</p>
        </div>
        <button onClick={() => setModal({ open: true, ticket: null })} className="flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800">
          <Plus className="h-4 w-4" /> New Repair Ticket
        </button>
      </div>

      {/* Deadline alert banner */}
      {(overdue.length > 0 || dueSoon.length > 0) && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-gold-300 bg-gradient-to-r from-gold-50 to-ivory-50">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-ink-900">Deadline alerts</p>
                <p className="text-sm text-ink-600">
                  {overdue.length > 0 && <span className="font-semibold text-danger">{overdue.length} overdue</span>}
                  {overdue.length > 0 && dueSoon.length > 0 && " · "}
                  {dueSoon.length > 0 && <span className="font-semibold text-[#8a6a1f]">{dueSoon.length} due within 2 days</span>}
                  {" — "}review and update these tickets.
                </p>
              </div>
            </div>
            <button onClick={() => { setTab("tickets"); setStatusF("active"); setSort("deadline"); }} className="shrink-0 rounded-xl bg-ink-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-ivory-50 hover:bg-ink-800">
              Review now
            </button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-gold-200/60 bg-ivory-50/40 px-4 py-3">
            {[...overdue, ...dueSoon].slice(0, 6).map((t) => {
              const d = daysUntil(t.deadline);
              const late = d < 0;
              return (
                <button key={t.id} onClick={() => router.push(`/admin/service/${t.id}`)}
                  className="flex items-center gap-2 rounded-full border border-ink-100 bg-ivory-50 px-3 py-1.5 text-xs hover:border-gold-400">
                  <span className={cn("h-1.5 w-1.5 rounded-full", late ? "bg-danger" : "bg-warning")} />
                  <span className="font-semibold text-ink-900">{t.productName}</span>
                  <span className="text-ink-400">{t.customerName}</span>
                  <span className={cn("font-bold", late ? "text-danger" : "text-[#8a6a1f]")}>
                    {late ? `${Math.abs(d)}d late` : d === 0 ? "today" : d === 1 ? "tomorrow" : `${d}d`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-6 border-b border-ink-100">
        {(["tickets", "report"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("relative -mb-px border-b-2 pb-3 text-sm font-semibold uppercase tracking-wider transition-colors",
              tab === t ? "border-ink-900 text-ink-900" : "border-transparent text-ink-400 hover:text-ink-700")}>
            {t === "tickets" ? "Tickets" : "Report"}
          </button>
        ))}
      </div>

      {tab === "tickets" ? (
        <>
          {/* KPI strip */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <KpiCell label="Open" value={String(kpi.active)} sub="in workshop" dot="bg-ink-400" />
            <KpiCell label="Overdue" value={String(kpi.overdue)} sub="past deadline" dot="bg-danger" tone="text-danger" />
            <KpiCell label="Due Soon" value={String(kpi.dueSoon)} sub="within 2 days" dot="bg-warning" tone="text-[#8a6a1f]" />
            <KpiCell label="Completed" value={String(kpi.completedMonth)} sub="this month" dot="bg-success" tone="text-success" />
            <KpiCell label="Revenue" value={formatINR(kpi.revenue)} sub="incl GST" dot="bg-gold-500" tone="text-gold-600" />
          </div>

          {/* Toolbar — search + filters, then the date range and sort. */}
          <div className="mb-3 space-y-2.5 rounded-2xl border border-ink-100 bg-ivory-50 p-3">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
              <div className="relative lg:flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ticket, name, phone, instrument…" className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:w-auto">
                <select value={statusF} onChange={(e) => setStatusF(e.target.value as StatusFilter)} className={selCls} aria-label="Status">
                  <option value="all">All statuses</option>
                  <option value="active">Active only</option>
                  {REPAIR_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <select value={payF} onChange={(e) => setPayF(e.target.value as PayFilter)} className={selCls} aria-label="Payment mode">
                  <option value="all">All payment modes</option>
                  {REPAIR_PAY_MODES.map((m) => <option key={m} value={m}>Paid by {PAY_MODE_LABEL[m]}</option>)}
                  <option value="unpaid">Nothing paid yet</option>
                </select>
                <select value={branchF} onChange={(e) => setBranchF(e.target.value as BranchFilter)} className={selCls} aria-label="Branch">
                  <option value="all">All branches</option>
                  <BranchOptions />
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selCls} aria-label="Sort">
                  <option value="deadline">Sort · Deadline</option>
                  <option value="new">Sort · Newest first</option>
                  <option value="old">Sort · Oldest first</option>
                  <option value="amount-high">Sort · Amount high → low</option>
                  <option value="amount-low">Sort · Amount low → high</option>
                  <option value="priority">Sort · Priority</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-ink-400">Raised</span>
              {PERIODS.map((p) => (
                <button key={p.key} onClick={() => { setPeriod(p.key); if (p.key !== "custom") { setFrom(""); setTo(""); } }}
                  className={cn("rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all", period === p.key ? "bg-ink-900 text-ivory-50" : "bg-white text-ink-500 ring-1 ring-ink-100 hover:text-ink-900")}>
                  {p.label}
                </button>
              ))}
              {period === "custom" && (
                <span className="flex items-center gap-2">
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From" className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
                  <span className="text-ink-400">→</span>
                  <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To" className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
                </span>
              )}
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between px-0.5">
            <p className="text-xs text-ink-500">{rows.length} ticket{rows.length === 1 ? "" : "s"}{statusF === "active" ? " · active" : ""}</p>
            {filtered && (
              <button onClick={clearFilters} className="text-xs font-semibold text-ink-500 transition-colors hover:text-gold-600">Clear filters</button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
            <table className="w-full min-w-[1040px] whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-5 py-4">Ticket</th><th>Customer</th><th>Instrument</th><th>Priority</th><th>Status</th><th>Payment</th><th>Deadline</th><th className="pr-4 text-right">Amount</th><th className="px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {pg.items.map((t) => {
                  const lv = alertLevel(t);
                  const d = daysUntil(t.deadline);
                  const sm = statusMeta(t.status);
                  const pr = PRIORITY_META[t.priority];
                  const open = !isClosed(t.status);
                  const hot = open && (t.priority === "urgent" || t.priority === "high");
                  // Row tint: overdue > due-soon > urgent/high priority. Left bar marks the tier.
                  const tier = !open ? "" : lv === "overdue" ? "bg-danger/[0.07] hover:bg-danger/[0.11]" : lv === "due-soon" ? "bg-warning/[0.12] hover:bg-warning/[0.18]" : hot ? "bg-gold-50/70 hover:bg-gold-50" : "hover:bg-ink-900/[0.03]";
                  const bar = !open ? "border-l-transparent" : lv === "overdue" ? "border-l-danger" : lv === "due-soon" ? "border-l-warning" : t.priority === "urgent" ? "border-l-danger" : t.priority === "high" ? "border-l-gold-500" : "border-l-transparent";
                  return (
                    <tr key={t.id} onClick={() => router.push(`/admin/service/${t.id}`)} className={cn("cursor-pointer border-l-4 text-ink-800 transition-colors", bar, tier, !open && "opacity-60")}>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 font-semibold text-ink-900">{t.id}<ExternalLink className="h-3 w-3 text-ink-300" /></span>
                        <p className="text-[11px] text-ink-400">{branchLabel(t.branch)} · {fmtDate(t.createdAt)}</p>
                      </td>
                      <td>
                        <p className="font-medium text-ink-900">{t.customerName}</p>
                        <p className="text-[11px] text-ink-400">{t.phone}</p>
                      </td>
                      <td>
                        <p className="max-w-[180px] truncate font-medium">{t.productName}</p>
                        <p className="text-[11px] text-ink-400">{t.category}</p>
                      </td>
                      <td><span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", pr.tone, open && t.priority === "urgent" && "ring-1 ring-danger/40")}>{open && t.priority === "urgent" ? "🔥 " : ""}{pr.label}</span></td>
                      <td><span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", sm.tone)}>{sm.label}</span></td>
                      <td>
                        {(() => {
                          const pays = ticketPayments(t);
                          if (pays.length === 0) return <span className="text-[11px] text-ink-400">Not paid yet</span>;
                          return (
                            <>
                              <p className="text-[12px] font-semibold text-ink-800">{modesLabel(pays)}</p>
                              <p className="text-[11px] text-ink-400">{pays.length} payment{pays.length === 1 ? "" : "s"} · {formatINR(t.advance)}</p>
                            </>
                          );
                        })()}
                      </td>
                      <td>
                        <p className="text-ink-700">{fmtDate(t.deadline)}</p>
                        {!isClosed(t.status) && (
                          <p className={cn("text-[11px] font-semibold", lv === "overdue" ? "text-danger" : lv === "due-soon" ? "text-[#8a6a1f]" : "text-ink-400")}>
                            {lv === "overdue" ? `${Math.abs(d)}d late` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `in ${d}d`}
                          </p>
                        )}
                      </td>
                      <td className="pr-4 text-right tabular-nums">
                        {t.status === "cancelled" || chargeBase(t) <= 0 ? (
                          <span className="text-ink-400">—</span>
                        ) : (
                          <>
                            <p className="font-semibold text-ink-900">{formatINR(grossTotal(t))}</p>
                            {balanceDue(t) > 0 ? <p className="text-[11px] font-semibold text-danger">{formatINR(balanceDue(t))} due</p> : <p className="text-[11px] font-semibold text-success">Settled</p>}
                          </>
                        )}
                      </td>
                      <td className="px-5">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={(e) => sendWhatsApp(t, e)} title="WhatsApp customer" className="grid h-8 w-8 place-items-center rounded-lg text-[#128C4B] hover:bg-[#128C4B]/10"><MessageCircle className="h-4 w-4" /></button>
                          <button onClick={() => router.push(`/admin/service/${t.id}`)} title="Open" className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5"><ChevronRight className="h-4 w-4" /></button>
                          <button onClick={() => setConfirmId(t.id)} title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!hydrated && !loadError && (
                  <tr><td colSpan={10} className="px-5 py-16 text-center"><LoadingInline label="Loading tickets…" /></td></tr>
                )}
                {hydrated && rows.length === 0 && (
                  <tr><td colSpan={10} className="px-5 py-16 text-center text-sm text-ink-400">No tickets match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager className="mt-4" {...pg.pager} />
        </>
      ) : (
        <ReportTab tickets={tickets} />
      )}
    </div>
  );
}

