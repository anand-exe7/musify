"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench, Plus, Search, AlertTriangle,
  ExternalLink, Trash2, MessageCircle, ChevronRight,
} from "lucide-react";
import {
  useRepair, alertLevel, daysUntil, statusMeta, PRIORITY_META,
  chargeBase, grossTotal, balanceDue, turnaroundDays, isClosed, REPAIR_STATUS,
  type RepairStatus, type RepairTicket,
} from "@/lib/store/repair";
import type { Branch } from "@/lib/store/pos";
import { waLink } from "@/lib/data/business";
import { RepairTicketModal, repairIntakeMessage } from "@/components/admin/RepairTicketModal";
import { formatINR, cn } from "@/lib/utils";

type Tab = "tickets" | "report";
type BranchFilter = Branch | "all";
type StatusFilter = RepairStatus | "all" | "active";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-ink-100 bg-ivory-50 p-5", className)}>{children}</div>;
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

function Stat({ label, value, hint, accent, icon }: { label: string; value: string; hint?: string; accent?: "gold" | "green" | "red" | "ink"; icon?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">{label}</p>
        {icon && <span className="text-ink-300">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums md:text-3xl",
        accent === "gold" ? "text-gold-600" : accent === "green" ? "text-success" : accent === "red" ? "text-danger" : "text-ink-900")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </Card>
  );
}

export default function ServicePage() {
  const router = useRouter();
  const tickets = useRepair((s) => s.tickets);
  const deleteTicket = useRepair((s) => s.deleteTicket);
  const updateTicket = useRepair((s) => s.updateTicket);

  const [tab, setTab] = useState<Tab>("tickets");
  const [modal, setModal] = useState<{ open: boolean; ticket: RepairTicket | null }>({ open: false, ticket: null });
  const [statusF, setStatusF] = useState<StatusFilter>("all");
  const [branchF, setBranchF] = useState<BranchFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"deadline" | "new" | "priority">("deadline");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const overdue = useMemo(() => tickets.filter((t) => alertLevel(t) === "overdue"), [tickets]);
  const dueSoon = useMemo(() => tickets.filter((t) => alertLevel(t) === "due-soon"), [tickets]);

  const rows = useMemo(() => {
    let list = tickets.filter((t) => {
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
      if (sort === "priority") return prRank[a.priority] - prRank[b.priority];
      // deadline: open first (by soonest), closed last
      const ac = isClosed(a.status), bc = isClosed(b.status);
      if (ac !== bc) return ac ? 1 : -1;
      return +new Date(a.deadline) - +new Date(b.deadline);
    });
    return list;
  }, [tickets, statusF, branchF, query, sort]);

  const kpi = useMemo(() => {
    const active = tickets.filter((t) => !isClosed(t.status));
    const completed = tickets.filter((t) => t.status === "completed");
    const now = new Date();
    const completedThisMonth = completed.filter((t) => {
      const d = new Date(t.completedAt || t.updatedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const revenue = completed.reduce((n, t) => n + grossTotal(t), 0);
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
    window.open(waLink(t.phone, repairIntakeMessage(t)), "_blank", "noopener,noreferrer");
  };

  const selCls = "w-full rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-700 focus:border-gold-500 focus:outline-none";

  return (
    <div className="p-5 md:p-8">
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

          {/* Toolbar — one clean row */}
          <div className="mb-3 flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="relative lg:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ticket, name, phone, instrument…" className="w-full rounded-xl border border-ink-200 bg-ivory-50 py-2.5 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none" />
            </div>
            <div className="grid grid-cols-3 gap-2 lg:flex lg:w-auto">
              <select value={statusF} onChange={(e) => setStatusF(e.target.value as StatusFilter)} className={selCls}>
                <option value="all">All statuses</option>
                <option value="active">Active only</option>
                {REPAIR_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <select value={branchF} onChange={(e) => setBranchF(e.target.value as BranchFilter)} className={selCls}>
                <option value="all">All branches</option>
                <option value="Branch 1">Branch 1</option>
                <option value="Branch 2">Branch 2</option>
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={selCls}>
                <option value="deadline">Sort · Deadline</option>
                <option value="new">Sort · Newest</option>
                <option value="priority">Sort · Priority</option>
              </select>
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between px-0.5">
            <p className="text-xs text-ink-500">{rows.length} ticket{rows.length === 1 ? "" : "s"}{statusF === "active" ? " · active" : ""}</p>
            {(statusF !== "all" || branchF !== "all" || query.trim()) && (
              <button onClick={() => { setStatusF("all"); setBranchF("all"); setQuery(""); }} className="text-xs font-semibold text-ink-500 transition-colors hover:text-gold-600">Clear filters</button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
            <table className="w-full min-w-[960px] whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-5 py-4">Ticket</th><th>Customer</th><th>Instrument</th><th>Priority</th><th>Status</th><th>Deadline</th><th className="text-right">Charge</th><th className="text-right">Balance</th><th className="px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {rows.map((t) => {
                  const lv = alertLevel(t);
                  const d = daysUntil(t.deadline);
                  const sm = statusMeta(t.status);
                  const pr = PRIORITY_META[t.priority];
                  return (
                    <tr key={t.id} onClick={() => router.push(`/admin/service/${t.id}`)} className="cursor-pointer text-ink-800 transition-colors hover:bg-ink-900/[0.03]">
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 font-semibold text-ink-900">{t.id}<ExternalLink className="h-3 w-3 text-ink-300" /></span>
                        <p className="text-[11px] text-ink-400">{t.branch} · {fmtDate(t.createdAt)}</p>
                      </td>
                      <td>
                        <p className="font-medium text-ink-900">{t.customerName}</p>
                        <p className="text-[11px] text-ink-400">{t.phone}</p>
                      </td>
                      <td>
                        <p className="max-w-[180px] truncate font-medium">{t.productName}</p>
                        <p className="text-[11px] text-ink-400">{t.category}</p>
                      </td>
                      <td><span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", pr.tone)}>{pr.label}</span></td>
                      <td><span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", sm.tone)}>{sm.label}</span></td>
                      <td>
                        <p className="text-ink-700">{fmtDate(t.deadline)}</p>
                        {!isClosed(t.status) && (
                          <p className={cn("text-[11px] font-semibold", lv === "overdue" ? "text-danger" : lv === "due-soon" ? "text-[#8a6a1f]" : "text-ink-400")}>
                            {lv === "overdue" ? `${Math.abs(d)}d late` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `in ${d}d`}
                          </p>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{t.status === "cancelled" ? "—" : chargeBase(t) > 0 ? formatINR(grossTotal(t)) : "—"}</td>
                      <td className="text-right font-semibold tabular-nums">{t.status === "cancelled" ? <span className="text-ink-400">—</span> : balanceDue(t) > 0 ? formatINR(balanceDue(t)) : <span className="text-success">Settled</span>}</td>
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
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="px-5 py-16 text-center text-sm text-ink-400">No tickets match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <ReportTab tickets={tickets} />
      )}
    </div>
  );
}

/* ─────────────────────────  Report tab  ───────────────────────── */

function ReportTab({ tickets }: { tickets: RepairTicket[] }) {
  const m = useMemo(() => {
    const completed = tickets.filter((t) => t.status === "completed");
    const active = tickets.filter((t) => !isClosed(t.status));
    const revenue = completed.reduce((n, t) => n + grossTotal(t), 0);
    const collected = tickets.reduce((n, t) => n + (t.advance || 0), 0);
    const outstanding = tickets.filter((t) => !isClosed(t.status)).reduce((n, t) => n + balanceDue(t), 0);
    const turnarounds = completed.map(turnaroundDays).filter((x): x is number => x != null);
    const avgTAT = turnarounds.length ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length) : 0;

    const byStatus = REPAIR_STATUS.map((s) => ({ ...s, n: tickets.filter((t) => t.status === s.key).length }));

    const catMap = new Map<string, { n: number; rev: number }>();
    tickets.forEach((t) => {
      const e = catMap.get(t.category) || { n: 0, rev: 0 };
      e.n += 1;
      if (t.status === "completed") e.rev += grossTotal(t);
      catMap.set(t.category, e);
    });
    const byCategory = [...catMap.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.n - a.n);

    const branchAgg = (["Branch 1", "Branch 2"] as Branch[]).map((b) => {
      const list = tickets.filter((t) => t.branch === b);
      return {
        b,
        total: list.length,
        active: list.filter((t) => !isClosed(t.status)).length,
        rev: list.filter((t) => t.status === "completed").reduce((n, t) => n + grossTotal(t), 0),
      };
    });

    const techMap = new Map<string, { open: number; done: number }>();
    tickets.forEach((t) => {
      const key = t.technician || "Unassigned";
      const e = techMap.get(key) || { open: 0, done: 0 };
      if (t.status === "completed") e.done += 1;
      else if (!isClosed(t.status)) e.open += 1;
      techMap.set(key, e);
    });
    const byTech = [...techMap.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.open + b.done - (a.open + a.done));

    // monthly ticket intake + revenue (current year)
    const months = Array.from({ length: 12 }, () => ({ raised: 0, rev: 0 }));
    tickets.forEach((t) => { months[new Date(t.createdAt).getMonth()].raised += 1; });
    completed.forEach((t) => { months[new Date(t.completedAt || t.updatedAt).getMonth()].rev += grossTotal(t); });

    return { completed, active, revenue, collected, outstanding, avgTAT, byStatus, byCategory, branchAgg, byTech, months };
  }, [tickets]);

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const maxMonth = Math.max(...m.months.map((x) => x.raised), 1);
  const maxCat = Math.max(...m.byCategory.map((c) => c.n), 1);
  const catColors = ["#C9A24B", "#A98337", "#DFBE58", "#5B1E1E", "#87672A", "#EAD48F", "#3D6A8B"];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Repair Revenue" value={formatINR(m.revenue)} accent="green" hint={`${m.completed.length} completed · incl GST`} />
        <Stat label="Outstanding Balance" value={formatINR(m.outstanding)} accent="gold" hint="On open tickets" />
        <Stat label="Advance Collected" value={formatINR(m.collected)} hint="Across all tickets" />
        <Stat label="Avg Turnaround" value={`${m.avgTAT} days`} hint="Raise → completed" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Monthly intake */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-ink-900">Ticket Intake · 2026</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-ink-900">{tickets.length} total</p>
            </div>
            <span className="rounded-full bg-gold-50 px-3 py-1 text-xs font-semibold text-gold-700">Revenue {formatINR(m.revenue)}</span>
          </div>
          <div className="flex h-48 items-end gap-1.5">
            {m.months.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t bg-ink-900 transition-all hover:bg-gold-500" style={{ height: `${(v.raised / maxMonth) * 100}%`, minHeight: v.raised > 0 ? 4 : 0 }} title={`${v.raised} raised · ${formatINR(v.rev)}`} />
                </div>
                <span className="text-[8px] uppercase text-ink-400">{MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* By status */}
        <Card>
          <p className="mb-4 text-sm font-bold text-ink-900">By Status</p>
          <div className="space-y-2.5">
            {m.byStatus.filter((s) => s.n > 0).map((s) => (
              <div key={s.key} className="flex items-center justify-between">
                <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", s.tone)}>{s.label}</span>
                <span className="font-bold tabular-nums text-ink-900">{s.n}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* By category */}
        <Card>
          <p className="mb-4 text-sm font-bold text-ink-900">By Category (segregation)</p>
          <div className="space-y-3">
            {m.byCategory.map((c, i) => (
              <div key={c.k}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-700">{c.k}</span>
                  <span className="text-ink-500">{c.n} tickets{c.rev > 0 && <span className="ml-2 font-semibold text-ink-900">{formatINR(c.rev)}</span>}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full" style={{ width: `${(c.n / maxCat) * 100}%`, background: catColors[i % catColors.length] }} />
                </div>
              </div>
            ))}
            {m.byCategory.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No data.</p>}
          </div>
        </Card>

        {/* By branch */}
        <Card>
          <p className="mb-4 text-sm font-bold text-ink-900">By Branch</p>
          <div className="grid grid-cols-2 gap-3">
            {m.branchAgg.map((b) => (
              <div key={b.b} className="rounded-xl border border-ink-100 bg-[#FAF7EF] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-500">{b.b}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{b.total}</p>
                <p className="text-[11px] text-ink-400">{b.active} open</p>
                <p className="mt-2 text-sm font-semibold tabular-nums text-success">{formatINR(b.rev)}</p>
                <p className="text-[11px] text-ink-400">revenue</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* By technician */}
      <Card>
        <p className="mb-4 text-sm font-bold text-ink-900">Technician Workload</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                <th className="py-3">Technician</th><th className="text-center">Open</th><th className="text-center">Completed</th><th className="text-right">Total Handled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {m.byTech.map((t) => (
                <tr key={t.k} className="text-ink-800">
                  <td className="py-3.5 font-semibold text-ink-900">{t.k}</td>
                  <td className="text-center tabular-nums">{t.open}</td>
                  <td className="text-center tabular-nums text-success">{t.done}</td>
                  <td className="text-right font-semibold tabular-nums">{t.open + t.done}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
