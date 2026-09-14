"use client";
import { useEffect, useMemo, useState } from "react";
import {
  MessageSquare, Search, MessageCircle, Phone, Mail, Trash2, CheckCircle2, Clock, Inbox, Plus
} from "lucide-react";
import {
  useInquiry, INQUIRY_STATUS_META, type Inquiry, type InquiryStatus, INQUIRY_TOPICS, genInquiryId
} from "@/lib/store/inquiry";
import { useBranchScope, effectiveBranch, type BranchScope } from "@/lib/store/branch";
import { BUSINESS, waLink } from "@/lib/data/business";
import { cn } from "@/lib/utils";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function replyMessage(i: Inquiry) {
  return (
    `Hi ${i.name.split(" ")[0]}, thanks for reaching out to *${BUSINESS.name}*! 🎶\n\n` +
    `Regarding your enquiry about ${i.productInterest || i.topic.toLowerCase()} — how can we help you further?`
  );
}

function Stat({ label, value, accent, icon }: { label: string; value: string; accent?: "gold" | "green" | "ink"; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">{label}</p>
        {icon && <span className="text-ink-300">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums md:text-3xl", accent === "gold" ? "text-gold-600" : accent === "green" ? "text-success" : "text-ink-900")}>{value}</p>
    </div>
  );
}

export default function InquiriesPage() {
  const inquiries = useInquiry((s) => s.inquiries);
  const addInquiry = useInquiry((s) => s.addInquiry);
  const updateInquiry = useInquiry((s) => s.updateInquiry);
  const deleteInquiry = useInquiry((s) => s.deleteInquiry);

  const canSwitchBranch = useBranchScope((s) => s.canSwitch);
  const scopeAccess = useBranchScope((s) => s.access);
  const lockedBranch = !canSwitchBranch && (scopeAccess === "Branch 1" || scopeAccess === "Branch 2") ? scopeAccess : null;

  const [branch, setBranch] = useState<BranchScope>(lockedBranch ?? "all");

  useEffect(() => {
    if (lockedBranch) setBranch(lockedBranch);
  }, [lockedBranch]);

  const [statusF, setStatusF] = useState<InquiryStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    phone: "",
    topic: "Other",
    message: "",
    productInterest: "",
    status: "new" as InquiryStatus,
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
    return scopedInquiries
      .filter((i) => statusF === "all" || i.status === statusF)
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.phone.includes(query.trim()) || i.topic.toLowerCase().includes(q) || (i.productInterest || "").toLowerCase().includes(q) || i.message.toLowerCase().includes(q))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [scopedInquiries, statusF, query]);

  const contact = (i: Inquiry) => {
    if (i.status === "new") updateInquiry(i.id, { status: "contacted" });
    window.open(waLink(i.phone, replyMessage(i)), "_blank", "noopener,noreferrer");
  };

  const chip = (active: boolean) =>
    cn("rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all",
      active ? "bg-ink-900 text-ivory-50" : "bg-ivory-50 text-ink-500 ring-1 ring-ink-100 hover:text-ink-900");

  const pill = "rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all";

  return (
    <div className="p-5 md:p-8">
      {/* Add Inquiry Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4 backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-md rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-ink-900">Add Inquiry</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-500">Name *</label>
                <input required value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-500">Phone *</label>
                <input required type="tel" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-500">Topic</label>
                <select value={addForm.topic} onChange={(e) => setAddForm((f) => ({ ...f, topic: e.target.value }))} className="w-full rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none">
                  {INQUIRY_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-500">What they asked</label>
                <textarea rows={3} value={addForm.message} onChange={(e) => setAddForm((f) => ({ ...f, message: e.target.value }))} className="w-full rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-500">Product Interest (Optional)</label>
                <input value={addForm.productInterest} onChange={(e) => setAddForm((f) => ({ ...f, productInterest: e.target.value }))} className="w-full rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-500">Follow-up Status</label>
                <select value={addForm.status} onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value as InquiryStatus }))} className="w-full rounded-xl border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none">
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
              <button onClick={() => {
                if (!addForm.name.trim() || !addForm.phone.trim()) return alert("Name and phone are required.");
                addInquiry({
                  id: genInquiryId(),
                  createdAt: new Date().toISOString(),
                  name: addForm.name.trim(),
                  phone: addForm.phone.trim(),
                  topic: addForm.topic,
                  message: addForm.message.trim(),
                  productInterest: addForm.productInterest.trim() || undefined,
                  status: addForm.status,
                  branch: lockedBranch || effectiveBranch(branch),
                });
                setShowAdd(false);
                setAddForm({ name: "", phone: "", topic: "Other", message: "", productInterest: "", status: "new" });
              }} className="flex-1 rounded-xl bg-ink-900 py-2.5 text-sm font-semibold text-white hover:opacity-90">Save</button>
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
        </div>
        <button onClick={() => setShowAdd(true)} className="flex shrink-0 items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:opacity-90">
          <Plus className="h-4 w-4" /> Add Inquiry
        </button>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total" value={String(counts.total)} icon={<Inbox className="h-4 w-4" />} />
        <Stat label="New" value={String(counts.new)} accent="gold" icon={<MessageSquare className="h-4 w-4" />} />
        <Stat label="Contacted" value={String(counts.contacted)} icon={<Clock className="h-4 w-4" />} />
        <Stat label="Resolved" value={String(counts.resolved)} accent="green" icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-ink-100 bg-ivory-50 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-ink-100">
            <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">Branch</span>
            {lockedBranch ? (
              <span className={cn(pill, "bg-gold-500 text-ink-900")}>{lockedBranch}</span>
            ) : (
              ([["all", "All"], ["Branch 1", "Branch 1"], ["Branch 2", "Branch 2"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setBranch(k as BranchScope)} className={cn(pill, branch === k ? "bg-gold-500 text-ink-900" : "text-ink-500 hover:text-ink-900")}>
                  {label}
                </button>
              ))
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "new", "contacted", "resolved"] as const).map((s) => (
              <button key={s} onClick={() => setStatusF(s)} className={chip(statusF === s)}>{s === "all" ? "All Status" : INQUIRY_STATUS_META[s].label}</button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, topic…" className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none sm:w-72" />
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {rows.map((i) => {
          const meta = INQUIRY_STATUS_META[i.status];
          return (
            <div key={i.id} className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-bold text-ink-900">{i.name}</p>
                    <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", meta.tone)}>{meta.label}</span>
                    <span className="rounded bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase text-ink-600">{i.topic}</span>
                    {i.branch && i.branch !== "Any" && <span className="text-[11px] text-ink-400">{i.branch}</span>}
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
    </div>
  );
}
