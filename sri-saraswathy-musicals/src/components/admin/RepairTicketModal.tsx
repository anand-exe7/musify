"use client";
import { useState } from "react";
import { X, User as UserIcon, Guitar, ClipboardList, Wrench, MessageCircle, Save } from "lucide-react";
import {
  useRepair,
  genRepairId,
  REPAIR_CATEGORIES,
  TECHNICIANS,
  type RepairTicket,
  type RepairPriority,
} from "@/lib/store/repair";
import type { Branch } from "@/lib/store/pos";
import { BUSINESS, waLink, serviceInvoiceUrl } from "@/lib/data/business";
import { formatINR, cn } from "@/lib/utils";

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
    productName: "",
    category: "Strings",
    brand: "",
    serial: "",
    refInvoice: "",
    problem: "",
    accessories: "",
    status: "received",
    priority: "normal",
    branch: "Branch 1",
    technician: "Unassigned",
    deadline: dl.toISOString(),
    estimate: 0,
    finalCost: 0,
    advance: 0,
    gstRate: 18,
    events: [],
  };
}

export function repairIntakeMessage(t: RepairTicket): string {
  const balance = Math.max(0, t.estimate - t.advance);
  return (
    `*${BUSINESS.name} — Service Ticket*\n` +
    `Hi ${t.customerName || "there"}, we've received your instrument for repair.\n\n` +
    `🎫 Ticket: ${t.id}\n` +
    `🎸 Item: ${t.productName}${t.brand ? ` (${t.brand})` : ""}\n` +
    `🛠 Reported issue: ${t.problem}\n\n` +
    `💰 Estimate: ${formatINR(t.estimate)}${t.advance > 0 ? `\nAdvance paid: ${formatINR(t.advance)}\nBalance (approx): ${formatINR(balance)}` : ""}\n` +
    `📅 Ready by: ${fmtDeadline(t.deadline)}\n\n` +
    `📄 Track your repair / invoice:\n${serviceInvoiceUrl(t.id)}\n\n` +
    `We'll keep you posted. Reply here for any questions.\n${BUSINESS.branches[0].phone}`
  );
}

export function RepairTicketModal({ ticket, onClose }: { ticket: RepairTicket | null; onClose: () => void }) {
  const addTicket = useRepair((s) => s.addTicket);
  const updateTicket = useRepair((s) => s.updateTicket);
  const isNew = !ticket;
  const [d, setD] = useState<RepairTicket>(ticket ? structuredClone(ticket) : blank());
  const [err, setErr] = useState<string | null>(null);

  const set = (patch: Partial<RepairTicket>) => setD((prev) => ({ ...prev, ...patch }));

  const validate = () => {
    if (!d.customerName.trim()) return "Customer name is required.";
    if (!/\d{10}/.test(d.phone.replace(/\D/g, ""))) return "Enter a valid 10-digit mobile number.";
    if (!d.productName.trim()) return "Product / instrument name is required.";
    if (!d.problem.trim()) return "Describe the reported problem.";
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
      productName: d.productName.trim(),
      problem: d.problem.trim(),
      estimate: Number(d.estimate) || 0,
      advance: Number(d.advance) || 0,
    };
    if (isNew) {
      clean.events = [
        { at: new Date().toISOString(), label: `Ticket raised · received at ${clean.branch}` },
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
    window.open(waLink(t.phone, repairIntakeMessage(t)), "_blank", "noopener,noreferrer");
    onClose();
  };

  const field =
    "w-full rounded-xl border border-ink-200 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";
  const SectionTitle = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-gold-600">{icon}</span>
      <p className="text-sm font-bold uppercase tracking-wider text-ink-900">{children}</p>
    </div>
  );

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
                <input value={d.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="numeric" className={field} placeholder="10-digit number" />
              </div>
              <div className="md:col-span-2">
                <label className={label}>Email (optional)</label>
                <input value={d.email ?? ""} onChange={(e) => set({ email: e.target.value })} className={field} placeholder="name@email.com" />
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
                  <option>Branch 1</option>
                  <option>Branch 2</option>
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
                <label className={label}>Assigned Technician</label>
                <select value={d.technician} onChange={(e) => set({ technician: e.target.value })} className={field}>
                  {TECHNICIANS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Deadline (ready by) *</label>
                <input type="date" value={toDateInput(d.deadline)} onChange={(e) => set({ deadline: fromDateInput(e.target.value) })} className={field} />
              </div>
              <div>
                <label className={label}>Cost Estimate (₹)</label>
                <input type="number" value={d.estimate || ""} onChange={(e) => set({ estimate: Number(e.target.value) })} className={field} placeholder="0" />
              </div>
              <div>
                <label className={label}>Advance Collected (₹)</label>
                <input type="number" value={d.advance || ""} onChange={(e) => set({ advance: Number(e.target.value) })} className={field} placeholder="0" />
              </div>
            </div>
            {d.estimate > 0 && (
              <p className="mt-3 rounded-lg bg-[#FAF7EF] px-3 py-2 text-xs text-ink-500">
                Estimate {formatINR(d.estimate)} · Advance {formatINR(d.advance || 0)} ·{" "}
                <span className="font-semibold text-ink-900">Balance approx {formatINR(Math.max(0, d.estimate - (d.advance || 0)))}</span>
                <span className="text-ink-400"> (GST added on final invoice)</span>
              </p>
            )}
          </section>

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
