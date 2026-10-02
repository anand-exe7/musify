"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X, RotateCcw } from "lucide-react";
import type { Invoice } from "@/types";
import { cn } from "@/lib/utils";

type Line = Invoice["items"][number];

const emptyLine = (): Line => ({ name: "", hsn: "-", qty: 1, rate: 0, gst: 0, amount: 0, mrp: 0, discount: 0 });

/** Rupees → paise (whole paise, no FP drift). Accepts "" and "." as 0. */
function rupeesToPaise(input: string): number {
  const t = (input ?? "").toString().trim();
  if (!t) return 0;
  const n = Number(t);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Paise → rupees as a plain decimal string ("2500" or "2500.50"). */
function paiseToRupees(p: number): string {
  const n = Number(p) || 0;
  const whole = Math.trunc(n / 100);
  const frac = Math.abs(n % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`;
}

export function InvoiceEditor({ invoice, onCancel, onSaved }: { invoice: Invoice; onCancel: () => void; onSaved: (next: Invoice) => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Invoice>(() => structuredClone(invoice));
  // Lock lets admin stop auto-recompute of totals (manual override of subtotal/cgst/sgst/igst/total).
  const [autoTotals, setAutoTotals] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const itemsTotal = draft.items.reduce((n, l) => n + Math.max(0, (l.qty || 0) * (l.rate || 0) - (l.discount || 0)), 0);
    const overall = draft.discount || 0;
    const taxableGross = Math.max(0, itemsTotal - overall);
    // GST-inclusive scheme used throughout the app: tax is contained inside rate.
    // Approximate overall tax by extracting from each line at its gst rate.
    let tax = 0;
    for (const l of draft.items) {
      const net = Math.max(0, (l.qty || 0) * (l.rate || 0) - (l.discount || 0));
      const r = (l.gst || 0) / 100;
      if (r > 0) tax += Math.round(net - net / (1 + r));
    }
    // Scale tax down proportionally to reflect any overall (bill-level) discount.
    const scale = itemsTotal > 0 ? taxableGross / itemsTotal : 0;
    tax = Math.round(tax * scale);
    const subtotal = Math.max(0, taxableGross - tax);
    const cgst = Math.round(tax / 2);
    const sgst = tax - cgst;
    const total = taxableGross + (draft.delivery || 0);
    return { subtotal, cgst, sgst, igst: 0, total };
  }, [draft.items, draft.discount, draft.delivery]);

  const liveTotals = autoTotals
    ? totals
    : { subtotal: draft.subtotal, cgst: draft.cgst, sgst: draft.sgst, igst: draft.igst ?? 0, total: draft.total };

  const setField = <K extends keyof Invoice>(k: K, v: Invoice[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setLine = (idx: number, patch: Partial<Line>) =>
    setDraft((d) => {
      const items = d.items.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        next.amount = Math.max(0, (next.qty || 0) * (next.rate || 0) - (next.discount || 0));
        return next;
      });
      return { ...d, items };
    });

  async function save() {
    setSaving(true);
    setError(null);
    const payload: Invoice = {
      ...draft,
      items: draft.items.map((l) => ({
        ...l,
        amount: Math.max(0, (l.qty || 0) * (l.rate || 0) - (l.discount || 0)),
      })),
      ...(autoTotals ? liveTotals : {}),
    };
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(typeof body?.error === "string" ? body.error : `Save failed (${res.status})`);
        setSaving(false);
        return;
      }
      const next = (await res.json()) as Invoice;
      onSaved(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const inp = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none";
  const lbl = "block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500 mb-1";

  return (
    <div className="mx-auto max-w-5xl space-y-6 rounded-2xl border border-ink-100 bg-white p-6 shadow-card md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Edit invoice {draft.number}</h2>
          <p className="mt-1 text-xs text-ink-500">Changes are saved to the invoice ledger only — the source POS bill or order is not modified.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ivory-100 disabled:opacity-50">
            <X className="h-4 w-4" /> Cancel
          </button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900 disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div>}

      {/* Header fields */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={lbl}>Invoice number</label>
          <input className={inp} value={draft.number} onChange={(e) => setField("number", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Date</label>
          <input type="datetime-local" className={inp} value={toLocalInput(draft.date)} onChange={(e) => setField("date", fromLocalInput(e.target.value))} />
        </div>
        <div>
          <label className={lbl}>Branch</label>
          <select className={inp} value={draft.branch} onChange={(e) => setField("branch", e.target.value as Invoice["branch"])}>
            <option value="Branch 1">Branch 1</option>
            <option value="Branch 2">Branch 2</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Customer</label>
          <input className={inp} value={draft.customer} onChange={(e) => setField("customer", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Customer phone</label>
          <input className={inp} value={draft.customerPhone ?? ""} onChange={(e) => setField("customerPhone", e.target.value || null)} />
        </div>
        <div>
          <label className={lbl}>Customer GSTIN</label>
          <input className={inp} value={draft.customerGstin ?? ""} onChange={(e) => setField("customerGstin", e.target.value || null)} />
        </div>
        <div>
          <label className={lbl}>Payment mode</label>
          <input className={inp} value={draft.paymentMode} onChange={(e) => setField("paymentMode", e.target.value)} placeholder="cash / card / upi / cod / razorpay" />
        </div>
        <div>
          <label className={lbl}>Status</label>
          <select className={inp} value={draft.status} onChange={(e) => setField("status", e.target.value as Invoice["status"])}>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Source</label>
          <select className={inp} value={draft.source ?? "manual"} onChange={(e) => setField("source", e.target.value as Invoice["source"])}>
            <option value="pos">POS</option>
            <option value="web">Web</option>
            <option value="service">Service</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      {/* Line items */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-ink-900">Line items</p>
          <button
            onClick={() => setDraft((d) => ({ ...d, items: [...d.items, emptyLine()] }))}
            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-ivory-50 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ivory-100"
          >
            <Plus className="h-3.5 w-3.5" /> Add line
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-ivory-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-2 py-2 w-24">HSN</th>
                <th className="px-2 py-2 w-20 text-center">Qty</th>
                <th className="px-2 py-2 w-32 text-right">Rate ₹</th>
                <th className="px-2 py-2 w-20 text-right">GST %</th>
                <th className="px-2 py-2 w-28 text-right">MRP ₹</th>
                <th className="px-2 py-2 w-32 text-right">Discount ₹</th>
                <th className="px-2 py-2 w-32 text-right">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {draft.items.map((l, idx) => (
                <tr key={idx} className="border-t border-ink-100">
                  <td className="px-3 py-2">
                    <input className={cn(inp, "min-w-[200px]")} value={l.name} onChange={(e) => setLine(idx, { name: e.target.value })} />
                    <input className={cn(inp, "mt-1 text-xs")} placeholder="Instruction / serial" value={l.instruction ?? ""} onChange={(e) => setLine(idx, { instruction: e.target.value || undefined })} />
                  </td>
                  <td className="px-2 py-2"><input className={inp} value={l.hsn} onChange={(e) => setLine(idx, { hsn: e.target.value })} /></td>
                  <td className="px-2 py-2"><input type="number" min={0} className={cn(inp, "text-center tabular-nums")} value={l.qty} onChange={(e) => setLine(idx, { qty: Number(e.target.value) || 0 })} /></td>
                  <td className="px-2 py-2"><input className={cn(inp, "text-right tabular-nums")} value={paiseToRupees(l.rate)} onChange={(e) => setLine(idx, { rate: rupeesToPaise(e.target.value) })} /></td>
                  <td className="px-2 py-2"><input type="number" min={0} className={cn(inp, "text-right tabular-nums")} value={l.gst} onChange={(e) => setLine(idx, { gst: Number(e.target.value) || 0 })} /></td>
                  <td className="px-2 py-2"><input className={cn(inp, "text-right tabular-nums")} value={paiseToRupees(l.mrp ?? 0)} onChange={(e) => setLine(idx, { mrp: rupeesToPaise(e.target.value) })} /></td>
                  <td className="px-2 py-2"><input className={cn(inp, "text-right tabular-nums")} value={paiseToRupees(l.discount ?? 0)} onChange={(e) => setLine(idx, { discount: rupeesToPaise(e.target.value) })} /></td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums text-ink-900">
                    {paiseToRupees(Math.max(0, (l.qty || 0) * (l.rate || 0) - (l.discount || 0)))}
                  </td>
                  <td className="px-1 py-2 text-right">
                    <button onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }))} className="rounded-lg p-1.5 text-ink-400 hover:bg-danger/10 hover:text-danger" aria-label="Remove line">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {draft.items.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-ink-400">No line items. Click “Add line”.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Bill-level discount ₹</label>
              <input className={cn(inp, "text-right tabular-nums")} value={paiseToRupees(draft.discount ?? 0)} onChange={(e) => setField("discount", rupeesToPaise(e.target.value))} />
            </div>
            <div>
              <label className={lbl}>Delivery ₹</label>
              <input className={cn(inp, "text-right tabular-nums")} value={paiseToRupees(draft.delivery ?? 0)} onChange={(e) => setField("delivery", rupeesToPaise(e.target.value))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-600">
            <input type="checkbox" checked={autoTotals} onChange={(e) => setAutoTotals(e.target.checked)} />
            Auto-compute totals from line items & GST
          </label>
          {!autoTotals && (
            <button
              onClick={() => {
                setDraft((d) => ({ ...d, ...totals }));
                setAutoTotals(true);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-ivory-50 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ivory-100"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Recompute from items
            </button>
          )}
        </div>
        <div className="rounded-xl border border-ink-100 bg-ivory-50 p-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <TotalRow label="Subtotal (taxable)" value={liveTotals.subtotal} editable={!autoTotals} onChange={(v) => setField("subtotal", v)} />
            <TotalRow label="CGST" value={liveTotals.cgst} editable={!autoTotals} onChange={(v) => setField("cgst", v)} />
            <TotalRow label="SGST" value={liveTotals.sgst} editable={!autoTotals} onChange={(v) => setField("sgst", v)} />
            <TotalRow label="IGST" value={liveTotals.igst} editable={!autoTotals} onChange={(v) => setField("igst", v)} />
            <TotalRow label="Grand total" value={liveTotals.total} editable={!autoTotals} onChange={(v) => setField("total", v)} strong />
          </div>
        </div>
      </div>
    </div>
  );
}

function TotalRow({ label, value, editable, onChange, strong }: { label: string; value: number; editable: boolean; onChange: (v: number) => void; strong?: boolean }) {
  return (
    <>
      <span className={cn("text-ink-600", strong && "font-bold text-ink-900")}>{label}</span>
      {editable ? (
        <input
          className="w-full rounded-md border border-ink-200 bg-white px-2 py-1 text-right tabular-nums text-ink-900 focus:border-gold-500 focus:outline-none"
          value={paiseToRupees(value)}
          onChange={(e) => onChange(rupeesToPaise(e.target.value))}
        />
      ) : (
        <span className={cn("text-right tabular-nums text-ink-900", strong && "font-bold")}>₹ {paiseToRupees(value)}</span>
      )}
    </>
  );
}

/** ISO → "YYYY-MM-DDTHH:mm" in local time for <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (local) → ISO string. Falls back to original if empty. */
function fromLocalInput(v: string): string {
  if (!v) return new Date().toISOString();
  const d = new Date(v);
  return isNaN(+d) ? new Date().toISOString() : d.toISOString();
}
