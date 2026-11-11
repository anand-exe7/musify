"use client";
import { useState } from "react";
import { X, User as UserIcon, Guitar, ClipboardList, Wrench, MessageCircle, Save, Package } from "lucide-react";
import {
  useRepair,
  genRepairId,
  REPAIR_CATEGORIES,
  grossTotal,
  balanceDue,
  statusMeta,
  type RepairTicket,
  type RepairPriority,
} from "@/lib/store/repair";
import type { Branch } from "@/lib/store/pos";
import { BUSINESS, waLink, serviceInvoiceUrl, branchInfo } from "@/lib/data/business";
import { useBranchContacts, phoneFor } from "@/lib/client/branchContacts";
import { formatINR, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { PartsEditor } from "@/components/admin/TicketParts";
import { partsTotal } from "@/lib/billing/serviceInvoice";
import { BRANCH_KEYS, DEFAULT_BRANCH, branchLabel } from "@/lib/stock";
import { BranchOptions } from "@/components/admin/BranchOptions";
import { REPAIR_PAY_MODES, PAY_MODE_LABEL, withPayment, ticketPayments, modesLabel } from "@/lib/billing/repairPayments";
import { E } from "@/lib/whatsapp";

/** Date input helper — ISO ⇄ yyyy-mm-dd */
function toDateInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromDateInput(v: string) {
  return v ? new Date(`${v}T18:00:00`).toISOString() : "";
}
function fmtDeadline(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

function blank(): RepairTicket {
  // default deadline: 5 days out
  const dl = new Date();
  dl.setDate(dl.getDate() + 5);
  return {
    id: genRepairId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    customerName: "",
    phone: "",
    email: "",
    customerGstin: "",
    productName: "",
    category: "Strings",
    brand: "",
    serial: "",
    refInvoice: "",
    problem: "",
    accessories: "",
    status: "received",
    priority: "normal",
    branch: DEFAULT_BRANCH,
    technician: "Unassigned",
    deadline: dl.toISOString(),
    estimate: 0,
    finalCost: 0,
    advance: 0,
    paymentMode: "CASH",
    payments: [],
    gstRate: 18,
    events: [],
  };
}

/**
 * The ticket-details WhatsApp message, built from the ticket as it is NOW — service charge (final cost once set,
 * otherwise the estimate), every product used, what has been paid and by which mode, and the balance. "Resend ticket
 * details" therefore always sends today's figures, never the ones from intake. `contactPhone`: the branch's number
 * as saved on Admin → Branches.
 */
export function repairIntakeMessage(t: RepairTicket, contactPhone?: string): string {
  const charge = t.finalCost > 0 ? t.finalCost : t.estimate;
  const parts = (t.parts ?? []).filter((p) => p.name.trim() && p.qty > 0);
  const total = grossTotal(t);
  const paid = t.advance || 0;
  const balance = balanceDue(t);
  const modes = modesLabel(ticketPayments(t));
  const money =
    `${E.money} ${t.finalCost > 0 ? "Service charge" : "Service estimate"}: ${formatINR(charge)}\n` +
    (parts.length
      ? `${E.package} Products used:\n${parts.map((p) => `  • ${p.name} × ${p.qty} — ${formatINR(p.qty * p.price)}`).join("\n")}\n`
      : "") +
    (parts.length ? `*Total: ${formatINR(total)}* (incl GST)\n` : "") +
    (paid > 0 ? `${E.check} Paid so far: ${formatINR(paid)}${modes ? ` (${modes})` : ""}\n` : "") +
    (t.status === "cancelled" ? "" : paid > 0 || parts.length ? (balance > 0 ? `${E.hourglass} Balance due: ${formatINR(balance)}\n` : `Fully paid ${E.check}\n`) : "");
  return (
    `*${BUSINESS.name} — Service Ticket*\n` +
    `Hi ${t.customerName || "there"}, ${t.status === "received" ? "we've received your instrument for repair." : `here are the latest details of your repair (${statusMeta(t.status).label}).`}\n\n` +
    `${E.ticket} Ticket: ${t.id}\n` +
    `${E.guitar} Item: ${t.productName}${t.brand ? ` (${t.brand})` : ""}\n` +
    `${E.wrench} Reported issue: ${t.problem}\n\n` +
    money +
    `${E.calendar} Ready by: ${fmtDeadline(t.deadline)}\n\n` +
    // The invoice only exists once the repair is billable — don't send a dead link at intake.
    (t.invoiceNo || t.status === "ready" || t.status === "completed" || paid > 0 ? `${E.doc} Track your repair / receipt:\n${serviceInvoiceUrl(t.id)}\n\n` : "") +
    `We'll keep you posted. Reply here for any questions.\n${contactPhone || branchInfo(t.branch).phone}`
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-gold-600">{icon}</span>
      <p className="text-sm font-bold uppercase tracking-wider text-ink-900">{children}</p>
    </div>
  );
}

/** Mobile number as typed or pasted: digits only, a leading +91 / 0 dropped, never more than 10 digits. */
function tenDigits(v: string): string {
  let n = v.replace(/\D/g, "");
  if (n.length > 10 && n.startsWith("91")) n = n.slice(2);
  if (n.length > 10 && n.startsWith("0")) n = n.slice(1);
  return n.slice(0, 10);
}

export function RepairTicketModal({ ticket, onClose }: { ticket: RepairTicket | null; onClose: () => void }) {
  const addTicket = useRepair((s) => s.addTicket);
  const updateTicket = useRepair((s) => s.updateTicket);
  const contacts = useBranchContacts();
  const isNew = !ticket;
  const [d, setD] = useState<RepairTicket>(ticket ? structuredClone(ticket) : blank());
  // Products used are charged on top of the service estimate — the balance and the WhatsApp message include them.
  const partsSum = partsTotal((d.parts ?? []).filter((x) => x.name.trim() && x.qty > 0));
  const [err, setErr] = useState<string | null>(null);

  const set = (patch: Partial<RepairTicket>) => setD((prev) => ({ ...prev, ...patch }));

  const validate = () => {
    if (!d.customerName.trim()) return "Customer name is required.";
    if (!/^\d{10}$/.test(d.phone.replace(/\D/g, ""))) return "Enter a valid 10-digit mobile number.";
    if (!d.productName.trim()) return "Product / instrument name is required.";
    if (!d.problem.trim()) return "Describe the reported problem.";
    if (d.customerGstin?.trim() && !GSTIN_RE.test(d.customerGstin.trim().toUpperCase())) return "GST number must be a valid 15-character GSTIN (or leave it blank).";
    if (!d.deadline) return "Set a promised-by deadline.";
    return null;
  };

  const persist = (): RepairTicket | null => {
    const v = validate();
    if (v) {
      setErr(v);
      return null;
    }
    const clean: RepairTicket = {
      ...d,
      customerName: d.customerName.trim(),
      phone: d.phone.replace(/\D/g, ""),
      customerGstin: (d.customerGstin ?? "").trim().toUpperCase(),
      productName: d.productName.trim(),
      problem: d.problem.trim(),
      estimate: Number(d.estimate) || 0,
      advance: Number(d.advance) || 0,
      parts: (d.parts ?? []).filter((x) => x.name.trim() && x.qty > 0),
    };
    if (isNew) {
      // REP-03: money taken at intake is the ticket's first part-payment (with its own receipt), not an advance order.
      if (clean.advance > 0) {
        Object.assign(clean, withPayment({ ...clean, payments: [], advance: 0 }, { amount: clean.advance, mode: clean.paymentMode ?? "CASH", note: "Paid at intake", at: clean.createdAt }));
      }
      clean.events = [
        { at: new Date().toISOString(), label: `Ticket raised · received at ${branchLabel(clean.branch)}${clean.parts?.length ? ` · ${clean.parts.length} product${clean.parts.length === 1 ? "" : "s"} noted` : ""}` },
      ];
      addTicket(clean);
    } else {
      updateTicket(clean.id, clean, "Intake details updated");
    }
    return clean;
  };

  const saveOnly = () => {
    if (persist()) onClose();
  };

  const saveAndWhatsApp = () => {
    const t = persist();
    if (!t) return;
    if (!isNew) updateTicket(t.id, { whatsappSentAt: new Date().toISOString() }, "Intake message sent via WhatsApp");
    else updateTicket(t.id, { whatsappSentAt: new Date().toISOString() });
    window.open(waLink(t.phone, repairIntakeMessage(t, phoneFor(contacts, t.branch))), "_blank", "noopener,noreferrer");
    onClose();
  };

  const field =
    "w-full rounded-xl border border-ink-200 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-4 w-full max-w-3xl rounded-2xl bg-ivory-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{isNew ? "Raise Repair Ticket" : "Edit Ticket"}</h2>
            <p className="text-xs text-ink-500">{isNew ? "Admin intake — customer cannot raise this" : d.id}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[68vh] space-y-6 overflow-y-auto px-6 py-5">
          {/* Customer */}
          <section>
            <SectionTitle icon={<UserIcon className="h-4 w-4" />}>Customer</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={label}>Customer Name *</label>
                <input value={d.customerName} onChange={(e) => set({ customerName: e.target.value })} className={field} placeholder="Full name" />
              </div>
              <div>
                <label className={label}>Mobile / WhatsApp *</label>
                <input value={d.phone} onChange={(e) => set({ phone: tenDigits(e.target.value) })} inputMode="numeric" pattern="[0-9]{10}" className={field} placeholder="10-digit number" />
              </div>
              <div>
                <label className={label}>Email (optional)</label>
                <input value={d.email ?? ""} onChange={(e) => set({ email: e.target.value })} className={field} placeholder="name@email.com" />
              </div>
              <div>
                <label className={label}>GST Number (optional)</label>
                <input value={d.customerGstin ?? ""} onChange={(e) => set({ customerGstin: e.target.value.toUpperCase() })} maxLength={15} className={cn(field, "font-mono tracking-wide")} placeholder="33XXXXX0000X1ZV" />
              </div>
            </div>
          </section>

          {/* Product */}
          <section>
            <SectionTitle icon={<Guitar className="h-4 w-4" />}>Instrument</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={label}>Product / Instrument *</label>
                <input value={d.productName} onChange={(e) => set({ productName: e.target.value })} className={field} placeholder="e.g. Saraswathi Veena" />
              </div>
              <div>
                <label className={label}>Category</label>
                <select value={d.category} onChange={(e) => set({ category: e.target.value })} className={field}>
                  {REPAIR_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Brand</label>
                <input value={d.brand ?? ""} onChange={(e) => set({ brand: e.target.value })} className={field} placeholder="e.g. Yamaha" />
              </div>
              <div>
                <label className={label}>Serial / Model No</label>
                <input value={d.serial ?? ""} onChange={(e) => set({ serial: e.target.value })} className={field} placeholder="Optional" />
              </div>
              <div className="md:col-span-2">
                <label className={label}>Original Purchase Invoice (optional)</label>
                <input value={d.refInvoice ?? ""} onChange={(e) => set({ refInvoice: e.target.value })} className={field} placeholder="e.g. INV-2026-XXXXX" />
              </div>
            </div>
          </section>

          {/* Problem */}
          <section>
            <SectionTitle icon={<ClipboardList className="h-4 w-4" />}>Problem &amp; Handover</SectionTitle>
            <div className="space-y-4">
              <div>
                <label className={label}>Reported Problem *</label>
                <textarea value={d.problem} onChange={(e) => set({ problem: e.target.value })} rows={3} className={cn(field, "resize-none")} placeholder="Describe the fault reported by the customer…" />
              </div>
              <div>
                <label className={label}>Accessories handed in</label>
                <input value={d.accessories ?? ""} onChange={(e) => set({ accessories: e.target.value })} className={field} placeholder="e.g. case, bow, adapter" />
              </div>
            </div>
          </section>

          {/* Service */}
          <section>
            <SectionTitle icon={<Wrench className="h-4 w-4" />}>Service Details</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={label}>Branch</label>
                <select value={d.branch} onChange={(e) => set({ branch: e.target.value as Branch })} className={field}>
                  <BranchOptions />
                </select>
              </div>
              <div>
                <label className={label}>Priority</label>
                <select value={d.priority} onChange={(e) => set({ priority: e.target.value as RepairPriority })} className={field}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className={label}>Deadline (ready by) *</label>
                <input type="date" value={toDateInput(d.deadline)} onChange={(e) => set({ deadline: fromDateInput(e.target.value) })} className={field} />
              </div>
              <div>
                <label className={label}>Cost Estimate (₹, incl. GST)</label>
                <MoneyInput value={d.estimate || 0} onChange={(paise) => set({ estimate: paise })} className={field} placeholder="0" />
              </div>
              {isNew ? (
                <>
                  <div>
                    <label className={label}>Paid now (₹) · part payment</label>
                    <MoneyInput value={d.advance || 0} onChange={(paise) => set({ advance: paise })} className={field} placeholder="0" />
                  </div>
                  {/* REP-01: payment mode on the Raise Repair Ticket form */}
                  <div>
                    <label className={label}>Payment mode</label>
                    <select value={d.paymentMode ?? "CASH"} onChange={(e) => set({ paymentMode: e.target.value })} className={field}>
                      {REPAIR_PAY_MODES.map((m) => <option key={m} value={m}>{PAY_MODE_LABEL[m]}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2 rounded-lg bg-ivory-100 px-3 py-2 text-xs text-ink-500">
                  Paid so far <span className="font-semibold text-ink-900">{formatINR(d.advance || 0)}</span> — record more payments from the ticket page (each gets its own receipt).
                </div>
              )}
            </div>
            {(d.estimate > 0 || partsSum > 0) && (
              <p className="mt-3 rounded-lg bg-[#FAF7EF] px-3 py-2 text-xs text-ink-500">
                Service {formatINR(d.estimate)}
                {partsSum > 0 && <> + products {formatINR(partsSum)} = <span className="font-semibold text-ink-900">total {formatINR(d.estimate + partsSum)}</span></>}
                {" · "}Paid {formatINR(d.advance || 0)} ·{" "}
                <span className="font-semibold text-ink-900">Balance {formatINR(Math.max(0, d.estimate + partsSum - (d.advance || 0)))}</span>
                <span className="text-ink-400"> (prices include GST)</span>
              </p>
            )}
          </section>

          {/* Products from inventory used in the repair (new tickets; on an existing ticket they are on its page) */}
          {isNew && (
            <section>
              <SectionTitle icon={<Package className="h-4 w-4" />}>Products used (optional)</SectionTitle>
              <p className="mb-3 text-[11px] text-ink-400">
                Pick what the repair will use from inventory, such as strings. They are billed on the same invoice as the service charge and come out of {branchLabel(d.branch)}&apos;s stock when the repair is marked <b>Ready</b>. You can also add them later on the ticket.
              </p>
              <PartsEditor parts={d.parts ?? []} onChange={(parts) => set({ parts })} branch={d.branch} gstRate={d.gstRate} />
            </section>
          )}

          {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}
        </div>

        {/* footer */}
        <div className="flex flex-col gap-2 border-t border-ink-100 px-6 py-4 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="rounded-xl border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
          <button onClick={saveOnly} className="flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800">
            <Save className="h-4 w-4" /> {isNew ? "Raise Ticket (Save)" : "Save Changes"}
          </button>
          {isNew && (
            <button onClick={saveAndWhatsApp} className="flex items-center justify-center gap-2 rounded-xl bg-[#128C4B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0f7a41]">
              <MessageCircle className="h-4 w-4" /> Raise &amp; Send WhatsApp
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
