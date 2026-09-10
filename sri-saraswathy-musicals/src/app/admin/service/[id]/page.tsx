"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Wrench, MessageCircle, FileText, Pencil, CheckCircle2, Clock,
  AlertTriangle, Phone, Mail, Calendar, User as UserIcon, Save, History, IndianRupee,
} from "lucide-react";
import {
  useRepair, alertLevel, daysUntil, statusMeta, REPAIR_STATUS, PRIORITY_META, TECHNICIANS,
  chargeBase, grossTotal, balanceDue, isClosed, isFixed,
  type RepairStatus, type RepairPriority, type RepairTicket,
} from "@/lib/store/repair";
import { RepairTicketModal, repairIntakeMessage } from "@/components/admin/RepairTicketModal";
import { BUSINESS, waLink } from "@/lib/data/business";
import { formatINR, cn } from "@/lib/utils";

function toDateInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromDateInput(v: string) {
  return v ? new Date(`${v}T18:00:00`).toISOString() : "";
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusUpdateMessage(t: RepairTicket): string {
  const sm = statusMeta(t.status);
  let line = `Update on your repair (${sm.label}).`;
  if (t.status === "ready") line = "Good news — your instrument is repaired and ready for pickup! 🎉";
  else if (t.status === "in-progress") line = "Our technician is working on your instrument now. 🛠";
  else if (t.status === "awaiting-parts") line = "We're waiting on a part to arrive before we can finish.";
  else if (t.status === "diagnosing") line = "We're diagnosing the issue and will share an estimate shortly.";
  const bal = balanceDue(t);
  return (
    `*${BUSINESS.name} — Service Update*\n` +
    `Hi ${t.customerName || "there"}, ${line}\n\n` +
    `🎫 Ticket: ${t.id}\n` +
    `🎸 Item: ${t.productName}\n` +
    `📋 Status: ${sm.label}\n` +
    `📅 Ready by: ${fmtDate(t.deadline)}\n` +
    (chargeBase(t) > 0 ? `💰 Charge: ${formatINR(grossTotal(t))} (incl GST)${bal > 0 ? `\nBalance due: ${formatINR(bal)}` : "\nFully paid ✅"}\n` : "") +
    `\nQuestions? Reply here or call ${BUSINESS.branches[0].phone}`
  );
}

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const tickets = useRepair((s) => s.tickets);
  const updateTicket = useRepair((s) => s.updateTicket);
  const nextInvoiceNo = useRepair((s) => s.nextInvoiceNo);

  const ticket = tickets.find((t) => t.id === id);

  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // cost editor draft
  const [draft, setDraft] = useState<{ finalCost: number; advance: number; technician: string; priority: RepairPriority; deadline: string } | null>(null);

  const t = ticket;

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const lv = useMemo(() => (t ? alertLevel(t) : "closed"), [t]);

  if (!t) {
    return (
      <div className="p-8">
        <Link href="/admin/service" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600"><ArrowLeft className="h-4 w-4" /> Back to Service</Link>
        <div className="grid place-items-center rounded-2xl border border-ink-100 bg-ivory-50 py-24 text-center">
          <p className="text-lg font-bold text-ink-900">Ticket not found</p>
          <p className="mt-1 text-sm text-ink-500">It may have been deleted. Return to the service register.</p>
        </div>
      </div>
    );
  }

  const sm = statusMeta(t.status);
  const pr = PRIORITY_META[t.priority];
  const d = daysUntil(t.deadline);
  const edit = draft ?? { finalCost: t.finalCost, advance: t.advance, technician: t.technician || "Unassigned", priority: t.priority, deadline: t.deadline };
  const setEdit = (patch: Partial<typeof edit>) => setDraft({ ...edit, ...patch });
  const dirty = draft && (draft.finalCost !== t.finalCost || draft.advance !== t.advance || draft.technician !== (t.technician || "Unassigned") || draft.priority !== t.priority || draft.deadline !== t.deadline);

  const changeStatus = (status: RepairStatus) => {
    if (status === t.status) return;
    if (status === "completed") {
      const invoiceNo = t.invoiceNo || nextInvoiceNo();
      const finalCost = t.finalCost > 0 ? t.finalCost : t.estimate;
      updateTicket(t.id, { status, completedAt: new Date().toISOString(), invoiceNo, finalCost },
        `Status → Completed · invoice ${invoiceNo}`);
      flash(`Marked completed · ${invoiceNo}`);
    } else {
      updateTicket(t.id, { status }, `Status → ${statusMeta(status).label}`);
      flash(`Status → ${statusMeta(status).label}`);
    }
  };

  const saveEdit = () => {
    if (!dirty) return;
    const patch: Partial<RepairTicket> = {
      finalCost: Number(edit.finalCost) || 0,
      advance: Number(edit.advance) || 0,
      technician: edit.technician,
      priority: edit.priority,
      deadline: edit.deadline,
    };
    const notes: string[] = [];
    if (patch.finalCost !== t.finalCost) notes.push(`final cost ${formatINR(patch.finalCost || 0)}`);
    if (patch.advance !== t.advance) notes.push(`advance ${formatINR(patch.advance || 0)}`);
    if (patch.technician !== (t.technician || "Unassigned")) notes.push(`tech → ${patch.technician}`);
    if (patch.priority !== t.priority) notes.push(`priority → ${PRIORITY_META[patch.priority as RepairPriority].label}`);
    if (patch.deadline !== t.deadline) notes.push(`deadline → ${fmtDate(patch.deadline as string)}`);
    updateTicket(t.id, patch, `Updated ${notes.join(" · ")}`);
    setDraft(null);
    flash("Ticket updated");
  };

  const sendUpdate = () => {
    updateTicket(t.id, { whatsappSentAt: new Date().toISOString() }, "Status update sent via WhatsApp");
    window.open(waLink(t.phone, statusUpdateMessage(t)), "_blank", "noopener,noreferrer");
  };
  const resendIntake = () => {
    window.open(waLink(t.phone, repairIntakeMessage(t)), "_blank", "noopener,noreferrer");
  };

  const goInvoice = () => {
    if (!t.invoiceNo) {
      const invoiceNo = nextInvoiceNo();
      updateTicket(t.id, { invoiceNo }, `Invoice ${invoiceNo} generated`);
    }
    router.push(`/admin/service/${t.id}/invoice`);
  };

  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  // status progression steps for the tracker (exclude cancelled)
  const flow: RepairStatus[] = ["received", "diagnosing", "in-progress", "awaiting-parts", "ready", "completed"];
  const currentIdx = flow.indexOf(t.status);

  return (
    <div className="p-5 md:p-8">
      {editOpen && <RepairTicketModal ticket={t} onClose={() => setEditOpen(false)} />}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4">
        <Link href="/admin/service" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600"><ArrowLeft className="h-4 w-4" /> Back to Service</Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-ink-900">{t.productName}</h1>
              <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", sm.tone)}>{sm.label}</span>
              <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", pr.tone)}>{pr.label}</span>
            </div>
            <p className="mt-1 text-sm text-ink-500">{t.id} · {t.category}{t.brand ? ` · ${t.brand}` : ""} · {t.branch}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEditOpen(true)} className="flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600"><Pencil className="h-4 w-4" /> Edit</button>
            <button onClick={goInvoice} className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800"><FileText className="h-4 w-4" /> {t.invoiceNo ? "View Invoice" : "Generate Invoice"}</button>
          </div>
        </div>
      </div>

      {/* Deadline banner */}
      {!isClosed(t.status) && (lv === "overdue" || lv === "due-soon") && (
        <div className={cn("mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium",
          lv === "overdue" ? "border-danger/30 bg-danger/10 text-danger" : "border-warning/40 bg-warning/10 text-[#8a6a1f]")}>
          {lv === "overdue" ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          {lv === "overdue"
            ? `This ticket is ${Math.abs(d)} day(s) past its ${fmtDate(t.deadline)} deadline.`
            : `Deadline ${fmtDate(t.deadline)} — ${d === 0 ? "due today" : d === 1 ? "due tomorrow" : `due in ${d} days`}.`}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* ── LEFT ── */}
        <div className="space-y-6">
          {/* Status tracker */}
          <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-900"><Wrench className="h-4 w-4 text-gold-600" /> Repair Status</h2>
              {isFixed(t.status) && <span className="flex items-center gap-1 text-xs font-semibold text-success"><CheckCircle2 className="h-4 w-4" /> Instrument fixed</span>}
            </div>

            {/* progress steps */}
            {t.status !== "cancelled" ? (
              <div className="mb-5 flex items-center">
                {flow.map((s, i) => {
                  const done = i <= currentIdx;
                  return (
                    <div key={s} className="flex flex-1 items-center last:flex-none">
                      <div className="flex flex-col items-center">
                        <div className={cn("grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold transition-colors", done ? "bg-ink-900 text-ivory-50" : "bg-ink-100 text-ink-400")}>
                          {done ? "✓" : i + 1}
                        </div>
                        <span className={cn("mt-1 hidden text-[9px] font-semibold uppercase tracking-wide sm:block", done ? "text-ink-700" : "text-ink-300")}>{statusMeta(s).label}</span>
                      </div>
                      {i < flow.length - 1 && <div className={cn("mx-1 h-0.5 flex-1", i < currentIdx ? "bg-ink-900" : "bg-ink-100")} />}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mb-5 rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">This ticket was cancelled.</div>
            )}

            <label className={label}>Update status</label>
            <div className="flex flex-wrap gap-2">
              {REPAIR_STATUS.map((s) => (
                <button key={s.key} onClick={() => changeStatus(s.key)}
                  className={cn("rounded-full px-3.5 py-2 text-xs font-semibold transition-all",
                    t.status === s.key ? "bg-ink-900 text-ivory-50" : "bg-ivory-50 text-ink-600 ring-1 ring-ink-100 hover:text-ink-900")}>
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          {/* Problem details */}
          <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-900">Problem &amp; Handover</h2>
            <p className="text-sm leading-relaxed text-ink-700">{t.problem}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Detail label="Serial / Model" value={t.serial || "—"} />
              <Detail label="Accessories handed in" value={t.accessories || "—"} />
              <Detail label="Original invoice" value={t.refInvoice || "—"} />
              <Detail label="Received on" value={fmtDate(t.createdAt)} />
            </dl>
          </section>

          {/* Cost & assignment editor */}
          <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-900"><IndianRupee className="h-4 w-4 text-gold-600" /> Costing &amp; Assignment</h2>
              {dirty && <button onClick={saveEdit} className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ivory-50 hover:bg-ink-800"><Save className="h-3.5 w-3.5" /> Save</button>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>Estimate (fixed at intake)</label>
                <input value={formatINR(t.estimate)} disabled className={cn(field, "cursor-not-allowed bg-ink-50 text-ink-400")} />
              </div>
              <div>
                <label className={label}>Final Cost (₹, pre-GST)</label>
                <input type="number" value={edit.finalCost || ""} onChange={(e) => setEdit({ finalCost: Number(e.target.value) })} className={field} placeholder={String(t.estimate)} />
              </div>
              <div>
                <label className={label}>Advance / Paid (₹)</label>
                <input type="number" value={edit.advance || ""} onChange={(e) => setEdit({ advance: Number(e.target.value) })} className={field} placeholder="0" />
              </div>
              <div>
                <label className={label}>GST</label>
                <input value={`${t.gstRate}%`} disabled className={cn(field, "cursor-not-allowed bg-ink-50 text-ink-400")} />
              </div>
              <div>
                <label className={label}>Technician</label>
                <select value={edit.technician} onChange={(e) => setEdit({ technician: e.target.value })} className={field}>
                  {TECHNICIANS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Priority</label>
                <select value={edit.priority} onChange={(e) => setEdit({ priority: e.target.value as RepairPriority })} className={field}>
                  <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Deadline (ready by)</label>
                <input type="date" value={toDateInput(edit.deadline)} onChange={(e) => setEdit({ deadline: fromDateInput(e.target.value) })} className={field} />
              </div>
            </div>

            {/* totals summary */}
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-[#FAF7EF] p-4 text-center">
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Charge (incl GST)</p><p className="mt-1 text-lg font-bold tabular-nums text-ink-900">{formatINR(grossTotal(t))}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Advance</p><p className="mt-1 text-lg font-bold tabular-nums text-ink-900">{formatINR(t.advance)}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Balance Due</p><p className={cn("mt-1 text-lg font-bold tabular-nums", balanceDue(t) > 0 ? "text-danger" : "text-success")}>{formatINR(balanceDue(t))}</p></div>
            </div>
          </section>

          {/* Timeline */}
          <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-900"><History className="h-4 w-4 text-gold-600" /> Activity Timeline</h2>
            <ol className="space-y-4">
              {[...t.events].reverse().map((e, i) => (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", i === 0 ? "bg-gold-500" : "bg-ink-200")} />
                    {i < t.events.length - 1 && <span className="mt-1 w-px flex-1 bg-ink-100" />}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm text-ink-800">{e.label}</p>
                    <p className="text-[11px] text-ink-400">{fmtDateTime(e.at)}</p>
                  </div>
                </li>
              ))}
              {t.events.length === 0 && <li className="text-sm text-ink-400">No activity logged yet.</li>}
            </ol>
          </section>
        </div>

        {/* ── RIGHT ── */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Customer */}
          <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-900"><UserIcon className="h-4 w-4 text-gold-600" /> Customer</h2>
            <p className="text-base font-semibold text-ink-900">{t.customerName}</p>
            <div className="mt-3 space-y-2 text-sm text-ink-600">
              <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-ink-400" /> {t.phone}</p>
              {t.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-ink-400" /> {t.email}</p>}
              <p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-ink-400" /> Ready by {fmtDate(t.deadline)}</p>
            </div>
            {t.whatsappSentAt && <p className="mt-3 text-[11px] text-ink-400">Last WhatsApp: {fmtDateTime(t.whatsappSentAt)}</p>}
          </div>

          {/* WhatsApp actions */}
          <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-900">Notify Customer</h2>
            <button onClick={sendUpdate} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#128C4B] py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#0f7a41]">
              <MessageCircle className="h-4 w-4" /> Send Status Update
            </button>
            <button onClick={resendIntake} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 py-3 text-xs font-bold uppercase tracking-wider text-ink-700 hover:border-[#128C4B] hover:text-[#128C4B]">
              <MessageCircle className="h-4 w-4" /> Resend Ticket Details
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">Opens WhatsApp with a prebuilt message (name, problem, price, deadline).</p>
          </div>

          {/* Invoice */}
          <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-900">Invoice</h2>
            {t.invoiceNo ? (
              <p className="mb-3 text-sm text-ink-600">Invoice <span className="font-semibold text-ink-900">{t.invoiceNo}</span></p>
            ) : (
              <p className="mb-3 text-sm text-ink-500">No invoice generated yet.</p>
            )}
            <button onClick={goInvoice} className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-3 text-xs font-bold uppercase tracking-wider text-ivory-50 hover:bg-ink-800">
              <FileText className="h-4 w-4" /> {t.invoiceNo ? "Open Invoice" : "Generate Invoice"}
            </button>
            {t.status !== "completed" && (
              <button onClick={() => changeStatus("completed")} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-success/40 py-3 text-xs font-bold uppercase tracking-wider text-success hover:bg-success/10">
                <CheckCircle2 className="h-4 w-4" /> Mark Completed
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-800">{value}</dd>
    </div>
  );
}
