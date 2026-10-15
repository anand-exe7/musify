"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, Save, Package, Search } from "lucide-react";
import { usePOS } from "@/lib/store/pos";
import { useRepair, type RepairTicket, type RepairPart } from "@/lib/store/repair";
import { variantStockAt, branchLabel } from "@/lib/stock";
import { formatINR, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { partsTotal } from "@/lib/billing/serviceInvoice";

const GST_RATES = [0, 5, 12, 18, 28];

/**
 * Products sold to the customer during a service. They go on the same tax invoice as
 * the service charge, and the ones picked from inventory leave this branch's stock.
 * Prices are GST-inclusive, like the rest of the shop.
 */
export function TicketParts({ ticket }: { ticket: RepairTicket }) {
  const updateTicket = useRepair((s) => s.updateTicket);
  const catalog = usePOS((s) => s.invProducts);
  const saved = ticket.parts ?? [];
  const [draft, setDraft] = useState<RepairPart[] | null>(null);
  const parts = draft ?? saved;
  const [term, setTerm] = useState("");
  const locked = ticket.status === "cancelled";

  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const total = partsTotal(parts);

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((p) => `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(q)).slice(0, 6);
  }, [term, catalog]);

  const set = (next: RepairPart[]) => setDraft(next);
  const patch = (id: string, p: Partial<RepairPart>) => set(parts.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const addProduct = (productId: string) => {
    const p = catalog.find((x) => x.id === productId);
    if (!p) return;
    const vi = Math.max(0, p.variants.findIndex((v) => !v.disabled));
    const v = p.variants[vi];
    set([...parts, {
      id: crypto.randomUUID(), productId: p.id, variantIndex: vi,
      name: p.variants.length > 1 ? `${p.name} — ${v?.attr ?? ""}` : p.name,
      hsn: p.hsn, qty: 1, price: v && v.price > 0 ? v.price : p.basePrice, gst: p.gstRate ?? 0,
    }]);
    setTerm("");
  };
  const addOther = () => set([...parts, { id: crypto.randomUUID(), name: "", qty: 1, price: 0, gst: ticket.gstRate || 0 }]);

  const pickVariant = (part: RepairPart, vi: number) => {
    const p = catalog.find((x) => x.id === part.productId);
    const v = p?.variants[vi];
    if (!p || !v) return;
    patch(part.id, { variantIndex: vi, name: p.variants.length > 1 ? `${p.name} — ${v.attr}` : p.name, price: v.price > 0 ? v.price : p.basePrice });
  };

  const save = () => {
    if (!draft) return;
    const clean = draft.filter((x) => x.name.trim() && x.qty > 0);
    updateTicket(ticket.id, { parts: clean }, `Products updated · ${clean.length} item${clean.length === 1 ? "" : "s"} · ${formatINR(partsTotal(clean))}`);
    setDraft(null);
  };

  const cell = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gold-500 focus:outline-none disabled:opacity-60";

  return (
    <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-900"><Package className="h-4 w-4 text-gold-600" /> Products sold with this service</h2>
        {dirty && <button onClick={save} className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ivory-50 hover:bg-ink-800"><Save className="h-3.5 w-3.5" /> Save</button>}
      </div>
      <p className="mb-3 text-[11px] text-ink-400">These are billed on the same invoice, on top of the service charge. Products picked from inventory come out of {branchLabel(ticket.branch)}&apos;s stock.</p>

      <div className="space-y-2">
        {parts.map((x) => {
          const p = x.productId ? catalog.find((c) => c.id === x.productId) : undefined;
          const v = p?.variants[x.variantIndex ?? 0];
          const enabled = p ? p.variants.map((vv, vi) => ({ vv, vi })).filter((o) => !o.vv.disabled || o.vi === x.variantIndex) : [];
          return (
            <div key={x.id} className="rounded-xl border border-ink-100 bg-white p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {x.productId ? <p className="truncate text-sm font-medium text-ink-900">{x.name}</p> : (
                    <input value={x.name} onChange={(e) => patch(x.id, { name: e.target.value })} placeholder="Item name" className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-sm focus:border-gold-500 focus:outline-none" />
                  )}
                  {p && v && <p className="text-[11px] text-ink-400">{variantStockAt(v, ticket.branch)} in stock at {branchLabel(ticket.branch)}</p>}
                </div>
                <button onClick={() => set(parts.filter((o) => o.id !== x.id))} disabled={locked} aria-label="Remove product" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger/10 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {enabled.length > 1 ? (
                  <select value={x.variantIndex ?? 0} onChange={(e) => pickVariant(x, Number(e.target.value))} className={cn(cell, "text-left")} disabled={locked}>
                    {enabled.map(({ vv, vi }) => <option key={vi} value={vi}>{vv.attr}{vv.finish ? ` · ${vv.finish}` : ""} — {variantStockAt(vv, ticket.branch)} in stock</option>)}
                  </select>
                ) : <span />}
                <div><label className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Qty</label><input type="number" min={1} step={1} value={x.qty || ""} onChange={(e) => patch(x.id, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={cell} disabled={locked} /></div>
                <div><label className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Price ₹ (incl. GST)</label><MoneyInput value={x.price} onChange={(price) => patch(x.id, { price })} className={cell} disabled={locked} /></div>
                <div>
                  <label className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">GST</label>
                  <select value={x.gst} onChange={(e) => patch(x.id, { gst: Number(e.target.value) })} className={cell} disabled={locked}>
                    {[...new Set([...GST_RATES, x.gst])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
                <div className="text-right"><p className="text-[9px] font-semibold uppercase tracking-wider text-ink-400">Line total</p><p className="mt-1.5 text-sm font-bold tabular-nums text-ink-900">{formatINR(x.qty * x.price)}</p></div>
              </div>
            </div>
          );
        })}
        {parts.length === 0 && <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-400">No products sold with this service.</p>}
      </div>

      {!locked && (
        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search inventory to add a product…" className="w-full rounded-lg border border-ink-200 bg-ivory-50 py-2 pl-8 pr-3 text-sm focus:border-gold-500 focus:outline-none" />
            {matches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-ink-100 bg-white shadow-lg">
                {matches.map((m) => (
                  <button key={m.id} onClick={() => addProduct(m.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gold-50">
                    <span className="truncate text-ink-900">{m.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-400">{formatINR(m.basePrice)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={addOther} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-900/5"><Plus className="h-3.5 w-3.5" /> Other item</button>
        </div>
      )}

      {parts.length > 0 && (
        <p className="mt-3 rounded-lg bg-ink-900/5 px-3 py-2 text-xs"><span className="text-ink-500">Products total:</span> <b className="tabular-nums text-ink-900">{formatINR(total)}</b> <span className="text-ink-400">(added to the service charge on the invoice)</span></p>
      )}
    </section>
  );
}
