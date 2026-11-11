"use client";
import { useMemo, useState } from "react";
import { Plus, Minus, Trash2, Save, Package, Search } from "lucide-react";
import { useInventory } from "@/lib/store/pos";
import { useAuth } from "@/lib/store/auth";
import { useRepair, type RepairTicket, type RepairPart } from "@/lib/store/repair";
import { variantStockAt, branchLabel } from "@/lib/stock";
import { formatINR, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { partsTotal } from "@/lib/billing/serviceInvoice";

const GST_RATES = [0, 5, 12, 18, 28];

/**
 * The list of products used in a repair, with a search over inventory. Controlled: the parent keeps the list and
 * decides when it is saved. Prices are GST-inclusive, like the rest of the shop. A product with price ₹0 is used
 * but not charged (it still comes off stock).
 */
export function PartsEditor({ parts, onChange, branch, gstRate, locked = false }: {
  parts: RepairPart[];
  onChange: (next: RepairPart[]) => void;
  /** The branch whose stock the products come from. */
  branch: string;
  /** GST % given to an "Other item" typed in by hand. */
  gstRate: number;
  locked?: boolean;
}) {
  const catalog = useInventory();
  // Branch staff add inventory products at the catalogue price; only a full admin can type items or change prices.
  const fullAdmin = useAuth((s) => s.adminAccess === "all");
  const [term, setTerm] = useState("");
  const total = partsTotal(parts);

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((p) => `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(q)).slice(0, 6);
  }, [term, catalog]);

  const patch = (id: string, p: Partial<RepairPart>) => onChange(parts.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const addProduct = (productId: string) => {
    const p = catalog.find((x) => x.id === productId);
    if (!p) return;
    const vi = Math.max(0, p.variants.findIndex((v) => !v.disabled));
    const v = p.variants[vi];
    onChange([...parts, {
      id: crypto.randomUUID(), productId: p.id, variantIndex: vi,
      name: p.variants.length > 1 ? `${p.name} — ${v?.attr ?? ""}` : p.name,
      hsn: p.hsn, qty: 1, price: v && v.price > 0 ? v.price : p.basePrice, gst: p.gstRate ?? 0,
    }]);
    setTerm("");
  };
  const addOther = () => onChange([...parts, { id: crypto.randomUUID(), name: "", qty: 1, price: 0, gst: gstRate || 0 }]);

  const pickVariant = (part: RepairPart, vi: number) => {
    const p = catalog.find((x) => x.id === part.productId);
    const v = p?.variants[vi];
    if (!p || !v) return;
    patch(part.id, { variantIndex: vi, name: p.variants.length > 1 ? `${p.name} — ${v.attr}` : p.name, price: v.price > 0 ? v.price : p.basePrice });
  };

  // Every control is the same height, so a row reads as one neat line.
  const cell = "h-10 w-full rounded-lg border border-ink-200 bg-ivory-50 px-2.5 text-sm tabular-nums focus:border-gold-500 focus:outline-none disabled:opacity-60";
  const lab = "mb-1 block text-[9px] font-semibold uppercase tracking-wider text-ink-400";

  return (
    <div>
      <div className="space-y-2.5">
        {parts.map((x) => {
          const p = x.productId ? catalog.find((c) => c.id === x.productId) : undefined;
          const v = p?.variants[x.variantIndex ?? 0];
          const enabled = p ? p.variants.map((vv, vi) => ({ vv, vi })).filter((o) => !o.vv.disabled || o.vi === x.variantIndex) : [];
          const onHand = p && v ? variantStockAt(v, branch) : null;
          return (
            <div key={x.id} className="rounded-xl border border-ink-100 bg-white p-3.5">
              {/* Name + stock, remove on the right */}
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {x.productId ? <p className="truncate text-sm font-semibold text-ink-900">{x.name}</p> : (
                    <input value={x.name} onChange={(e) => patch(x.id, { name: e.target.value })} placeholder="Item name" disabled={locked || !fullAdmin} className={cn(cell, "text-left")} />
                  )}
                  {onHand !== null && (
                    <p className={cn("mt-0.5 text-[11px]", onHand > 0 ? "text-ink-400" : "text-danger")}>{onHand} in stock at {branchLabel(branch)}</p>
                  )}
                </div>
                <button onClick={() => onChange(parts.filter((o) => o.id !== x.id))} disabled={locked} aria-label="Remove product" title="Remove" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger/10 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
              </div>

              {/* Variant · Qty · Price · GST · Line total — one aligned row (two rows on a phone) */}
              <div className="mt-3 grid grid-cols-2 items-end gap-2.5 sm:grid-cols-[minmax(0,1.4fr)_7.5rem_minmax(0,1fr)_5.5rem_6.5rem]">
                <div className="col-span-2 sm:col-span-1">
                  <label className={lab}>Variant</label>
                  {enabled.length > 1 ? (
                    <select value={x.variantIndex ?? 0} onChange={(e) => pickVariant(x, Number(e.target.value))} className={cn(cell, "truncate text-left")} disabled={locked}>
                      {enabled.map(({ vv, vi }) => <option key={vi} value={vi}>{vv.attr}{vv.finish ? ` · ${vv.finish}` : ""} ({variantStockAt(vv, branch)} in stock)</option>)}
                    </select>
                  ) : (
                    <p className={cn(cell, "flex items-center truncate border-dashed bg-transparent text-left text-ink-400")}>{v ? [v.attr, v.finish].filter(Boolean).join(" · ") || "Standard" : "—"}</p>
                  )}
                </div>
                <div>
                  <label className={lab}>Qty</label>
                  <div className={cn(cell, "flex items-center justify-between px-1")}>
                    <button type="button" onClick={() => patch(x.id, { qty: Math.max(1, x.qty - 1) })} disabled={locked || x.qty <= 1} aria-label="One less" className="grid h-8 w-8 place-items-center rounded-md text-ink-600 hover:bg-ink-900/5 disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
                    <input type="number" min={1} step={1} value={x.qty || ""} onChange={(e) => patch(x.id, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} disabled={locked} aria-label="Quantity" className="w-8 bg-transparent text-center text-sm font-semibold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                    <button type="button" onClick={() => patch(x.id, { qty: x.qty + 1 })} disabled={locked} aria-label="One more" className="grid h-8 w-8 place-items-center rounded-md text-ink-600 hover:bg-ink-900/5 disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div>
                  <label className={lab}>Price ₹ (incl. GST)</label>
                  <MoneyInput value={x.price} onChange={(price) => patch(x.id, { price })} className={cn(cell, "text-right")} disabled={locked || !fullAdmin} title={fullAdmin ? undefined : "Prices come from the catalogue"} />
                </div>
                <div>
                  <label className={lab}>GST</label>
                  <select value={x.gst} onChange={(e) => patch(x.id, { gst: Number(e.target.value) })} className={cell} disabled={locked || !fullAdmin}>
                    {[...new Set([...GST_RATES, x.gst])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
                <div className="text-right">
                  <label className={lab}>Line total</label>
                  <p className="flex h-10 items-center justify-end text-base font-bold tabular-nums text-ink-900">{formatINR(x.qty * x.price)}</p>
                </div>
              </div>
              {x.productId && x.price === 0 && <p className="mt-1 text-right text-[10px] text-ink-400">Used, not billed</p>}
            </div>
          );
        })}
        {parts.length === 0 && <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-400">No products used in this repair.</p>}
      </div>

      {!locked && (
        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-ink-400" />
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search inventory to add a product…" className="h-10 w-full rounded-lg border border-ink-200 bg-ivory-50 pl-8 pr-3 text-sm focus:border-gold-500 focus:outline-none" />
            {matches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-ink-100 bg-white shadow-lg">
                {matches.map((m) => (
                  <button key={m.id} type="button" onClick={() => addProduct(m.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gold-50">
                    <span className="truncate text-ink-900">{m.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-400">{formatINR(m.basePrice)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {fullAdmin && <button type="button" onClick={addOther} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-semibold text-ink-700 hover:bg-ink-900/5"><Plus className="h-3.5 w-3.5" /> Other item</button>}
        </div>
      )}

      {parts.length > 0 && (
        <p className="mt-3 rounded-lg bg-ink-900/5 px-3 py-2 text-xs"><span className="text-ink-500">Products total:</span> <b className="tabular-nums text-ink-900">{formatINR(total)}</b> <span className="text-ink-400">(added to the service charge on the invoice)</span></p>
      )}
    </div>
  );
}

/**
 * Products used in a repair, on the ticket page. They go on the same tax invoice as the service charge. The ones
 * picked from inventory come out of this branch's stock when the repair is marked Ready.
 */
export function TicketParts({ ticket }: { ticket: RepairTicket }) {
  const updateTicket = useRepair((s) => s.updateTicket);
  const saved = ticket.parts ?? [];
  const [draft, setDraft] = useState<RepairPart[] | null>(null);
  const parts = draft ?? saved;
  const locked = ticket.status === "cancelled";
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const out = ticket.status === "ready" || ticket.status === "completed";

  const save = () => {
    if (!draft) return;
    const clean = draft.filter((x) => x.name.trim() && x.qty > 0);
    updateTicket(ticket.id, { parts: clean }, `Products updated · ${clean.length} item${clean.length === 1 ? "" : "s"} · ${formatINR(partsTotal(clean))}`);
    setDraft(null);
  };

  return (
    <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-900"><Package className="h-4 w-4 text-gold-600" /> Products used in this repair</h2>
        {dirty && <button onClick={save} className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ivory-50 hover:bg-ink-800"><Save className="h-3.5 w-3.5" /> Save</button>}
      </div>
      <p className="mb-3 text-[11px] text-ink-400">
        These are billed on the same invoice, on top of the service charge.{" "}
        {out
          ? <>Products picked from inventory have been taken out of {branchLabel(ticket.branch)}&apos;s stock; changes here adjust it straight away.</>
          : <>Products picked from inventory come out of {branchLabel(ticket.branch)}&apos;s stock when the repair is marked <b>Ready</b>.</>}
      </p>
      <PartsEditor parts={parts} onChange={setDraft} branch={ticket.branch} gstRate={ticket.gstRate} locked={locked} />
    </section>
  );
}
