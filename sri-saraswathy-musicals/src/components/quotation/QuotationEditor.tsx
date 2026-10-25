"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X } from "lucide-react";
import type { Quotation, QuotationLine } from "@/types";
import { cn, formatINR } from "@/lib/utils";
import { BranchOptions } from "@/components/admin/BranchOptions";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { effectiveBranch, useBranchScope } from "@/lib/store/branch";
import { addDays, computeQuote, QUOTE_VALID_DAYS } from "@/lib/quotation";
import { useAuth } from "@/lib/store/auth";
import { LineProductPicker } from "@/components/quotation/LineProductPicker";

const GST_RATES = [0, 5, 12, 18, 28];
const emptyLine = (): QuotationLine => ({ name: "", hsn: "", qty: 1, rate: 0, gst: 18, amount: 0 });

const inp = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none";
const lbl = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500";

/** yyyy-mm-dd for a date input, in local time. */
function dateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Create a quotation (no `quotation`) or edit an existing one. */
export function QuotationEditor({ quotation, onCancel, onSaved }: {
  quotation?: Quotation;
  onCancel?: () => void;
  onSaved?: (q: Quotation) => void;
}) {
  const router = useRouter();
  // Branch staff quote catalogue products at catalogue prices; only a full admin can edit names, GST, MRP or rates.
  const fullAdmin = useAuth((s) => s.adminAccess === "all");
  const selected = useBranchScope((s) => s.selected);
  const [draft, setDraft] = useState<Quotation>(() =>
    quotation
      ? structuredClone(quotation)
      : {
          id: "",
          number: "",
          date: new Date().toISOString(),
          validUntil: addDays(new Date().toISOString(), QUOTE_VALID_DAYS),
          customer: "",
          customerPhone: "",
          customerGstin: "",
          branch: effectiveBranch(selected),
          items: [emptyLine()],
          subtotal: 0, cgst: 0, sgst: 0, igst: 0, total: 0,
          discount: 0, advance: 0, status: "open", notes: "",
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { amounts, totals } = useMemo(() => computeQuote(draft.items, draft.discount ?? 0), [draft.items, draft.discount]);
  const set = <K extends keyof Quotation>(k: K, v: Quotation[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setLine = (i: number, patch: Partial<QuotationLine>) =>
    setDraft((d) => ({ ...d, items: d.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  async function save() {
    const loose = draft.items.findIndex((l) => !l.productId || !l.variantKey);
    if (loose >= 0) {
      setError(`Line ${loose + 1}: pick a product from the catalogue, so this quotation can become a real order later.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        customer: draft.customer,
        customerPhone: draft.customerPhone ?? "",
        customerGstin: draft.customerGstin ?? "",
        branch: draft.branch,
        date: draft.date,
        validUntil: draft.validUntil,
        items: draft.items.map((l) => ({ name: l.name, hsn: l.hsn, qty: l.qty, rate: l.rate, mrp: l.mrp || undefined, discount: Math.min(l.discount || 0, l.qty * l.rate) || undefined, gst: l.gst, note: l.note, productId: l.productId, variantKey: l.variantKey })),
        discount: draft.discount ?? 0,
        advance: draft.advance ?? 0,
        notes: draft.notes ?? "",
      };
      const res = await fetch(quotation ? `/api/quotations/${encodeURIComponent(quotation.id)}` : "/api/quotations", {
        method: quotation ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : `Save failed (${res.status})`);
        return;
      }
      const saved = data as Quotation;
      if (onSaved) onSaved(saved);
      else router.push(`/admin/quotations/${encodeURIComponent(saved.id)}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 rounded-2xl border border-ink-100 bg-white p-6 shadow-card md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-ink-900">{quotation ? `Edit quotation ${quotation.number}` : "New quotation"}</h2>
          <p className="mt-1 text-xs text-ink-500">Prices include GST. Valid for {QUOTE_VALID_DAYS} days from the date unless you change it.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel ?? (() => router.push("/admin/quotations"))}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ivory-100 disabled:opacity-50"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : quotation ? "Save changes" : "Create quotation"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={lbl}>Customer</label>
          <input className={inp} value={draft.customer} onChange={(e) => set("customer", e.target.value)} placeholder="Customer name" />
        </div>
        <div>
          <label className={lbl}>Phone</label>
          <input className={inp} value={draft.customerPhone ?? ""} onChange={(e) => set("customerPhone", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>GSTIN (optional)</label>
          <input className={inp} value={draft.customerGstin ?? ""} onChange={(e) => set("customerGstin", e.target.value.toUpperCase())} />
        </div>
        <div>
          <label className={lbl}>Branch</label>
          <select className={inp} value={draft.branch} onChange={(e) => set("branch", e.target.value)}>
            <BranchOptions />
          </select>
        </div>
        <div>
          <label className={lbl}>Date</label>
          <input
            type="date"
            className={inp}
            value={dateInput(draft.date)}
            onChange={(e) => {
              if (!e.target.value) return;
              const date = new Date(`${e.target.value}T12:00:00`).toISOString();
              // Moving the date moves the validity with it, keeping the 30-day window.
              setDraft((d) => ({ ...d, date, validUntil: addDays(date, QUOTE_VALID_DAYS) }));
            }}
          />
        </div>
        <div>
          <label className={lbl}>Valid until</label>
          <input
            type="date"
            className={inp}
            value={dateInput(draft.validUntil)}
            onChange={(e) => e.target.value && set("validUntil", new Date(`${e.target.value}T12:00:00`).toISOString())}
          />
        </div>
      </div>

      {/* Lines */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-ink-900">Items</p>
          <button
            onClick={() => setDraft((d) => ({ ...d, items: [...d.items, emptyLine()] }))}
            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-ivory-50 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ivory-100"
          >
            <Plus className="h-3.5 w-3.5" /> Add line
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-ivory-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="w-24 px-2 py-2">HSN</th>
                <th className="w-24 px-2 py-2 text-right">GST %</th>
                <th className="w-28 px-2 py-2 text-right">MRP ₹</th>
                <th className="w-20 px-2 py-2 text-center">Qty</th>
                <th className="w-28 px-2 py-2 text-right">Rate ₹ (incl. GST)</th>
                <th className="w-28 px-2 py-2 text-right">Disc. ₹</th>
                <th className="w-28 px-2 py-2 text-right">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {draft.items.map((l, i) => (
                <tr key={i} className="border-t border-ink-100 align-top">
                  <td className="px-3 py-2">
                    {l.productId ? (
                      <>
                        <input className={cn(inp, "min-w-[200px]")} value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} readOnly={!fullAdmin} placeholder="Item" />
                        <input className={cn(inp, "mt-1 text-xs")} value={l.note ?? ""} onChange={(e) => setLine(i, { note: e.target.value })} placeholder="Note (optional)" />
                        <button type="button" onClick={() => setLine(i, { productId: undefined, variantKey: undefined })} className="mt-1 text-[11px] font-semibold text-ink-500 underline hover:text-gold-600">Change product</button>
                      </>
                    ) : (
                      <>
                        <LineProductPicker branch={draft.branch} onPick={(p) => setLine(i, p)} />
                        <p className="mt-1 text-[11px] text-danger">{l.name ? `“${l.name}” isn't linked to a product yet — search and pick it.` : "Pick a product from the catalogue."}</p>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2"><input className={inp} value={l.hsn} onChange={(e) => setLine(i, { hsn: e.target.value })} disabled={!fullAdmin} /></td>
                  <td className="px-2 py-2">
                    <select className={cn(inp, "text-right tabular-nums")} value={l.gst} onChange={(e) => setLine(i, { gst: Number(e.target.value) })} disabled={!fullAdmin}>
                      {[...new Set([...GST_RATES, l.gst])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2"><MoneyInput value={l.mrp ?? 0} onChange={(mrp) => setLine(i, { mrp })} disabled={!fullAdmin} className={cn(inp, "text-right tabular-nums")} placeholder={l.rate > 0 ? String(l.rate / 100) : "MRP"} /></td>
                  <td className="px-2 py-2">
                    <input type="number" min={1} className={cn(inp, "text-center tabular-nums")} value={l.qty} onChange={(e) => setLine(i, { qty: Math.max(0, Math.floor(Number(e.target.value)) || 0) })} />
                  </td>
                  <td className="px-2 py-2"><MoneyInput value={l.rate} onChange={(rate) => setLine(i, { rate })} disabled={!fullAdmin} title={fullAdmin ? undefined : "Prices come from the catalogue"} className={cn(inp, "text-right tabular-nums")} placeholder="0" /></td>
                  <td className="px-2 py-2"><MoneyInput value={l.discount ?? 0} onChange={(discount) => setLine(i, { discount: Math.min(discount, l.qty * l.rate) })} className={cn(inp, "text-right tabular-nums")} placeholder="0" /></td>
                  <td className="px-2 py-2 pt-4 text-right font-semibold tabular-nums text-ink-900">{formatINR(amounts[i] ?? 0)}</td>
                  <td className="px-1 py-2 text-right">
                    <button
                      onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}
                      className="rounded-lg p-1.5 text-ink-400 hover:bg-danger/10 hover:text-danger"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {draft.items.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-ink-400">No items. Click “Add line”.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals + extras */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Discount ₹</label>
              <MoneyInput value={draft.discount ?? 0} onChange={(v) => set("discount", v)} className={cn(inp, "text-right tabular-nums")} placeholder="0" />
            </div>
            <div>
              <label className={lbl}>Advance to pay ₹</label>
              <MoneyInput value={draft.advance ?? 0} onChange={(v) => set("advance", v)} className={cn(inp, "text-right tabular-nums")} placeholder="0" />
            </div>
          </div>
          <div>
            <label className={lbl}>Notes (optional)</label>
            <textarea className={cn(inp, "min-h-[72px]")} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Delivery time, warranty, anything the customer should know" />
          </div>
        </div>
        <div className="space-y-2 self-start rounded-xl border border-ink-100 bg-ivory-50 p-4 text-sm">
          <Row label="Taxable value" value={totals.subtotal} />
          <Row label="CGST" value={totals.cgst} />
          <Row label="SGST" value={totals.sgst} />
          <Row label="Total" value={totals.total} strong />
          {(draft.advance ?? 0) > 0 && <Row label="Balance after advance" value={Math.max(0, totals.total - (draft.advance ?? 0))} />}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between text-ink-600", strong && "border-t border-ink-200 pt-2 text-base font-bold text-ink-900")}>
      <span>{label}</span>
      <span className="tabular-nums">{formatINR(value)}</span>
    </div>
  );
}
