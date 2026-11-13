"use client";
import { Pager } from "@/components/ui/Pager";
import { usePaged } from "@/lib/client/usePaged";
import { useEffect, useMemo, useState } from "react";
import {
  MessageSquare, Search, MessageCircle, Phone, Mail, Trash2, CheckCircle2, Clock, Inbox, Plus, Download,
  X,
} from "lucide-react";
import {
  useInquiry, useInquiriesLoaded, INQUIRY_STATUS_META, type Inquiry, type InquiryStatus, INQUIRY_TOPICS, genInquiryId
} from "@/lib/store/inquiry";
import { LoadErrorBanner } from "@/components/admin/LoadState";
import { useBranchScope, effectiveBranch, type BranchScope } from "@/lib/store/branch";
import { BUSINESS, waLink } from "@/lib/data/business";
import { cn } from "@/lib/utils";
import { downloadCsv, stamp } from "@/lib/csv";
import { isBranch, BRANCH_KEYS, branchLabel } from "@/lib/stock";
import { AdminStat } from "@/components/admin/AdminStat";
import { E } from "@/lib/whatsapp";
import { PERIODS, periodBounds, type ReportPeriod } from "@/components/admin/ServiceReport";
import { useBranchContacts } from "@/lib/client/branchContacts";
import { useAuth } from "@/lib/store/auth";
import Link from "next/link";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** yyyy-mm-dd of a timestamp in local time (so an evening enquiry stays on its day). */
function localDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(+d)) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function replyMessage(i: Inquiry) {
  return (
    `Hi ${i.name.split(" ")[0]}, thanks for reaching out to *${BUSINESS.name}*! ${E.notes}\n\n` +
    `Regarding your enquiry about ${i.productInterest || i.topic.toLowerCase()} — how can we help you further?`
  );
}

const Stat = AdminStat;

export default function InquiriesPage() {
  useInquiriesLoaded();
  const inquiries = useInquiry((s) => s.inquiries);
  const loadError = useInquiry((s) => s.loadError);
  const addInquiry = useInquiry((s) => s.addInquiry);
  const updateInquiry = useInquiry((s) => s.updateInquiry);
  const deleteInquiry = useInquiry((s) => s.deleteInquiry);
  const contacts = useBranchContacts();
  const fullAdmin = useAuth((s) => s.adminAccess === "all");

  const canSwitchBranch = useBranchScope((s) => s.canSwitch);
  const allowedBranches = useBranchScope((s) => s.allowed);
  const lockedBranch = !canSwitchBranch && allowedBranches.length === 1 ? allowedBranches[0] : null;

  const [branch, setBranch] = useState<BranchScope>(lockedBranch ?? "all");

  useEffect(() => {
    if (lockedBranch) setBranch(lockedBranch);
  }, [lockedBranch]);

  const [statusF, setStatusF] = useState<InquiryStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<ReportPeriod>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    phone: "",
    topic: "Other",
    message: "",
    productInterest: "",
    status: "new" as InquiryStatus,
    branch: "",
  });

  const scopedInquiries = useMemo(() => {
    return inquiries.filter((i) => {
      if (branch === "all") return true;
      return i.branch === branch;
    });
  }, [inquiries, branch]);

  const counts = useMemo(() => ({
    total: scopedInquiries.length,
    new: scopedInquiries.filter((i) => i.status === "new").length,
    contacted: scopedInquiries.filter((i) => i.status === "contacted").length,
    resolved: scopedInquiries.filter((i) => i.status === "resolved").length,
  }), [scopedInquiries]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bounds = periodBounds(period, from, to);
    return scopedInquiries
      .filter((i) => statusF === "all" || i.status === statusF)
      .filter((i) => {
        if (!bounds) return true;
        const day = localDay(i.createdAt);
        return day >= bounds.lo && day <= bounds.hi;
      })
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.phone.includes(query.trim()) || i.topic.toLowerCase().includes(q) || (i.productInterest || "").toLowerCase().includes(q) || i.message.toLowerCase().includes(q))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [scopedInquiries, statusF, query, period, from, to]);
  const pg = usePaged(rows, `${query}|${statusF}|${branch}|${period}|${from}|${to}`);

  const contact = (i: Inquiry) => {
    if (i.status === "new") updateInquiry(i.id, { status: "contacted" });
    window.open(waLink(i.phone, replyMessage(i)), "_blank", "noopener,noreferrer");
  };

  const exportCsv = () =>
    downloadCsv(`inquiries-${stamp()}`, [
      ["ID", "Date", "Name", "Phone", "Email", "Topic", "Product Interest", "Message", "Status", "Branch"],
      ...rows.map((i) => [i.id, new Date(i.createdAt).toLocaleString("en-IN"), i.name, i.phone, i.email ?? "", i.topic, i.productInterest ?? "", i.message, INQUIRY_STATUS_META[i.status].label, i.branch ?? ""]),
    ]);

  const chip = (active: boolean) =>
    cn("rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all",
      active ? "bg-ink-900 text-ivory-50" : "bg-ivory-50 text-ink-500 ring-1 ring-ink-100 hover:text-ink-900");

  // Which branch a new inquiry is for: whatever is picked in the form, else the branch being viewed. Branch staff
  // choose only among their own branches; an admin may also leave it as "Any branch".
  const branchChoices: string[] = lockedBranch ? [lockedBranch] : canSwitchBranch ? [...BRANCH_KEYS, "Any"] : allowedBranches;
  const addBranch = branchChoices.includes(addForm.branch) ? addForm.branch : lockedBranch || effectiveBranch(branch);

  const pill = "rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all";

  return (
    <div className="p-5 md:p-8">
      <LoadErrorBanner message={loadError} onRetry={() => void useInquiry.getState().hydrate()} />
      {/* Add Inquiry Modal */}
      {showAdd && (
        // Header and buttons stay put; only the form scrolls — so it always fits the screen (a sheet on phones).
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setShowAdd(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-ivory-50 shadow-xl sm:max-h-[88dvh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <h3 className="text-lg font-bold text-ink-900">Add inquiry</h3>
              <button onClick={() => setShowAdd(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
              <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Name *</label>
                  <input required value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm focus:border-gold-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Mobile *</label>
                  <input required type="tel" inputMode="numeric" placeholder="10-digit number" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "").slice(0, 10) }))} className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm focus:border-gold-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Topic</label>
                  <select value={addForm.topic} onChange={(e) => setAddForm((f) => ({ ...f, topic: e.target.value }))} className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm focus:border-gold-500 focus:outline-none">
                    {INQUIRY_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Product interest (optional)</label>
                  <input value={addForm.productInterest} onChange={(e) => setAddForm((f) => ({ ...f, productInterest: e.target.value }))} className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm focus:border-gold-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Branch</label>
                  <select value={addBranch} onChange={(e) => setAddForm((f) => ({ ...f, branch: e.target.value }))} className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm focus:border-gold-500 focus:outline-none">
                    {branchChoices.map((b) => <option key={b} value={b}>{b === "Any" ? "Any branch" : branchLabel(b)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Follow-up status</label>
                  <select value={addForm.status} onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value as InquiryStatus }))} className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm focus:border-gold-500 focus:outline-none">
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">What they asked</label>
                <textarea rows={3} value={addForm.message} onChange={(e) => setAddForm((f) => ({ ...f, message: e.target.value }))} className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm focus:border-gold-500 focus:outline-none resize-y" />
              </div>
            </div>
            <div className="flex gap-2 border-t border-ink-100 px-5 py-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
              <button onClick={() => {
                if (!addForm.name.trim()) return alert("Enter the customer's name.");
                if (!/^\d{10}$/.test(addForm.phone)) return alert("Enter a 10-digit mobile number.");
                addInquiry({
                  id: genInquiryId(),
                  createdAt: new Date().toISOString(),
                  name: addForm.name.trim(),
                  phone: addForm.phone.trim(),
                  topic: addForm.topic,
                  message: addForm.message.trim(),
                  productInterest: addForm.productInterest.trim() || undefined,
                  status: addForm.status,
                  branch: addBranch,
                });
                setShowAdd(false);
                setAddForm({ name: "", phone: "", topic: "Other", message: "", productInterest: "", status: "new", branch: "" });
              }} className="flex-1 rounded-xl bg-ink-900 py-2.5 text-sm font-semibold text-white hover:opacity-90">Save inquiry</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4 backdrop-blur-sm" onClick={() => setConfirmId(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink-900">Delete inquiry?</h3>
            <p className="mt-2 text-sm text-ink-500">{confirmId} will be permanently removed. This cannot be undone.</p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmId(null)} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
              <button onClick={() => { deleteInquiry(confirmId); setConfirmId(null); }} className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-semibold text-white hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="border-l-4 border-ink-900 pl-4">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900"><MessageSquare className="h-6 w-6 text-gold-600" /> Customer Inquiries</h1>
          <p className="mt-1 text-sm text-ink-500">Website enquiries land here · reach customers on WhatsApp to continue</p>
          {/* INQ-02: which WhatsApp each branch's website inquiries go to (edit on Admin → Branches). */}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
            <span className="font-semibold uppercase tracking-wider text-ink-400">Inquiries go to</span>
            {contacts.map((c) => (
              <span key={c.id}><b className="text-ink-700">{branchLabel(c.id)}</b> {c.phone || "—"}</span>
            ))}
            {fullAdmin && <Link href="/admin/branches" className="font-semibold text-gold-600 hover:underline">Change</Link>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={exportCsv} className="flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-700 hover:border-gold-500 hover:text-gold-600">
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:opacity-90">
            <Plus className="h-4 w-4" /> Add Inquiry
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total" value={String(counts.total)} icon={<Inbox className="h-4 w-4" />} />
        <Stat label="New" value={String(counts.new)} accent="gold" icon={<MessageSquare className="h-4 w-4" />} />
        <Stat label="Contacted" value={String(counts.contacted)} icon={<Clock className="h-4 w-4" />} />
        <Stat label="Resolved" value={String(counts.resolved)} accent="green" icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      {/* Filters — search + branch, then date, then status: three tidy rows. */}
      <div className="mb-5 space-y-3 rounded-2xl border border-ink-100 bg-ivory-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative lg:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, topic…" className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none" />
          </div>
          <div className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-sm ring-1 ring-ink-100">
            <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Branch</span>
            {lockedBranch ? (
              <span className={cn(pill, "bg-gold-500 text-ink-900")}>{branchLabel(lockedBranch)}</span>
            ) : (
              ([["all", "All"], ...BRANCH_KEYS.map((b) => [b, branchLabel(b)] as const)] as const).map(([k, label]) => (
                <button key={k} onClick={() => setBranch(k as BranchScope)} className={cn(pill, "whitespace-nowrap", branch === k ? "bg-gold-500 text-ink-900" : "text-ink-500 hover:text-ink-900")}>
                  {label}
                </button>
              ))
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-[10px] font-bold uppercase tracking-wider text-ink-400">Date</span>
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => { setPeriod(p.key); if (p.key !== "custom") { setFrom(""); setTo(""); } }} className={chip(period === p.key)}>{p.label}</button>
          ))}
          {period === "custom" && (
            <span className="flex items-center gap-2">
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
              <span className="text-xs text-ink-400">→</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-[10px] font-bold uppercase tracking-wider text-ink-400">Status</span>
          {(["all", "new", "contacted", "resolved"] as const).map((st) => (
            <button key={st} onClick={() => setStatusF(st)} className={chip(statusF === st)}>{st === "all" ? "All" : INQUIRY_STATUS_META[st].label}</button>
          ))}
          <span className="ml-auto text-xs text-ink-500">{rows.length} inquir{rows.length === 1 ? "y" : "ies"}</span>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {pg.items.map((i) => {
          const meta = INQUIRY_STATUS_META[i.status];
          return (
            <div key={i.id} className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-bold text-ink-900">{i.name}</p>
                    <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", meta.tone)}>{meta.label}</span>
                    <span className="rounded bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase text-ink-600">{i.topic}</span>
                    {i.branch && i.branch !== "Any" && <span className="text-[11px] text-ink-400">{branchLabel(i.branch)}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
                    <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-ink-400" />{i.phone}</span>
                    {i.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-ink-400" />{i.email}</span>}
                    <span className="text-[11px] text-ink-400">{i.id} · {fmtDateTime(i.createdAt)}</span>
                  </div>
                  {i.productInterest && <p className="mt-2 text-sm"><span className="text-ink-400">Interested in: </span><span className="font-medium text-ink-900">{i.productInterest}</span></p>}
                  <p className="mt-2 rounded-xl bg-[#FAF7EF] px-3 py-2.5 text-sm leading-relaxed text-ink-700">{i.message}</p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 flex-row flex-wrap gap-2 lg:w-44 lg:flex-col">
                  <button onClick={() => contact(i)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#128C4B] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#0f7a41] lg:flex-none">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </button>
                  <select
                    value={i.status}
                    onChange={(e) => updateInquiry(i.id, { status: e.target.value as InquiryStatus })}
                    className="flex-1 rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2.5 text-xs font-semibold text-ink-700 focus:border-gold-500 focus:outline-none lg:flex-none"
                  >
                    <option value="new">Mark: New</option>
                    <option value="contacted">Mark: Contacted</option>
                    <option value="resolved">Mark: Resolved</option>
                  </select>
                  <button onClick={() => setConfirmId(i.id)} className="flex items-center justify-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-danger hover:bg-danger/10 lg:flex-none">
                    <Trash2 className="h-4 w-4" /> <span className="lg:hidden">Delete</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="grid place-items-center rounded-2xl border border-ink-100 bg-ivory-50 py-20 text-center">
            <Inbox className="h-8 w-8 text-ink-300" />
            <p className="mt-3 text-sm text-ink-400">No inquiries match these filters.</p>
          </div>
        )}
      </div>
      <Pager className="mt-4" {...pg.pager} />
    </div>
  );
}
