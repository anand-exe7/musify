"use client";
import { useMemo, useState } from "react";
import {
  MessageSquare, Search, MessageCircle, Phone, Mail, Trash2, CheckCircle2, Clock, Inbox,
} from "lucide-react";
import {
  useInquiry, INQUIRY_STATUS_META, type Inquiry, type InquiryStatus,
} from "@/lib/store/inquiry";
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
  const updateInquiry = useInquiry((s) => s.updateInquiry);
  const deleteInquiry = useInquiry((s) => s.deleteInquiry);

  const [statusF, setStatusF] = useState<InquiryStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const counts = useMemo(() => ({
    total: inquiries.length,
    new: inquiries.filter((i) => i.status === "new").length,
    contacted: inquiries.filter((i) => i.status === "contacted").length,
    resolved: inquiries.filter((i) => i.status === "resolved").length,
  }), [inquiries]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inquiries
      .filter((i) => statusF === "all" || i.status === statusF)
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.phone.includes(query.trim()) || i.topic.toLowerCase().includes(q) || (i.productInterest || "").toLowerCase().includes(q) || i.message.toLowerCase().includes(q))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [inquiries, statusF, query]);

  const contact = (i: Inquiry) => {
    if (i.status === "new") updateInquiry(i.id, { status: "contacted" });
    window.open(waLink(i.phone, replyMessage(i)), "_blank", "noopener,noreferrer");
  };

  const chip = (active: boolean) =>
    cn("rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all",
      active ? "bg-ink-900 text-ivory-50" : "bg-ivory-50 text-ink-500 ring-1 ring-ink-100 hover:text-ink-900");

  return (
    <div className="p-5 md:p-8">
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
      <div className="mb-6 border-l-4 border-ink-900 pl-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-900"><MessageSquare className="h-6 w-6 text-gold-600" /> Customer Inquiries</h1>
        <p className="mt-1 text-sm text-ink-500">Website enquiries land here · reach customers on WhatsApp to continue</p>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total" value={String(counts.total)} icon={<Inbox className="h-4 w-4" />} />
        <Stat label="New" value={String(counts.new)} accent="gold" icon={<MessageSquare className="h-4 w-4" />} />
        <Stat label="Contacted" value={String(counts.contacted)} icon={<Clock className="h-4 w-4" />} />
        <Stat label="Resolved" value={String(counts.resolved)} accent="green" icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-ink-100 bg-ivory-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "new", "contacted", "resolved"] as const).map((s) => (
            <button key={s} onClick={() => setStatusF(s)} className={chip(statusF === s)}>{s === "all" ? "All" : INQUIRY_STATUS_META[s].label}</button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, topic…" className="w-full rounded-xl border border-ink-200 bg-ivory-50 py-2.5 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none sm:w-72" />
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
