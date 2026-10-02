"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PackagePlus, Search, X, Truck, Trash2, Plus, Receipt, Pencil, Check, Download, ChevronDown } from "lucide-react";
import { usePOS, productStock, type InvProduct } from "@/lib/store/pos";
import { useVendors, vendorMatches } from "@/lib/store/vendors";
import { useBranchScope } from "@/lib/store/branch";
import type { Vendor } from "@/types";
import { formatINR, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { ProductModal } from "@/components/admin/ProductModal";
import { useAuth } from "@/lib/store/auth";
import { downloadCsv } from "@/lib/csv";

/** One line in the receive form. B1 + B2 always equal `qty`. */
interface Line {
  key: string;
  product: InvProduct;
  variantIndex: number;
  qty: number;
  b1: number;
  b2: number;
  unitCost: number; // paise
  /** Opt-in: also change this variant's selling price (paise) on save. */
  updatePrice: boolean;
  newPrice: number;
}

interface PurchaseRow {
  id: string;
  vendorId: string;
  invoiceNo: string;
  purchaseDate: string;
  subtotal: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  amountPaid: number;
  paymentMode: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  /** Part-payments recorded after the purchase (on top of amountPaid). */
  paymentsTotal: number;
  lines: { id: string; productName: string; variant: string; quantity: number; unitCost: number; branch: string }[];
}

const PAY_MODES = ["", "CASH", "UPI", "CARD", "BANK", "CREDIT", "OTHER"] as const;
/** Warn when margin on selling price drops below this. */
const LOW_MARGIN_PCT = 10;
const toInt = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

function fmt(d: string) {
  const x = new Date(d);
  return isNaN(+x) ? d : x.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PurchasesPage() {
  const invProducts = usePOS((s) => s.invProducts);
  const hydratePOS = usePOS((s) => s.hydrate);
  const vendors = useVendors((s) => s.vendors);
  const hydrateVendors = useVendors((s) => s.hydrate);

  const canSwitch = useBranchScope((s) => s.canSwitch);
  const scopeAccess = useBranchScope((s) => s.access);
  const lockedBranch = !canSwitch && (scopeAccess === "Branch 1" || scopeAccess === "Branch 2") ? scopeAccess : null;

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [vendorTerm, setVendorTerm] = useState("");
  const [productTerm, setProductTerm] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const isAdmin = useAuth((s) => s.isAdmin);
  const batchRef = useRef<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Header fields on the receive form.
  const [invoiceNo, setInvoiceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [cgst, setCgst] = useState(0);
  const [sgst, setSgst] = useState(0);
  const [igst, setIgst] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [paymentMode, setPaymentMode] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [listQuery, setListQuery] = useState("");
  const [paying, setPaying] = useState<PurchaseRow | null>(null);
  const [editing, setEditing] = useState<PurchaseRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    void hydrateVendors();
    void loadPurchases();
  }, [hydrateVendors]);

  const loadPurchases = async () => {
    try {
      const res = await fetch("/api/purchases", { cache: "no-store" });
      if (res.ok) setPurchases((await res.json()) as PurchaseRow[]);
    } catch {
      /* ignore */
    }
  };

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  };

  const vendorMatchesList = useMemo(
    () => (vendorTerm.trim() ? vendors.filter((v) => vendorMatches(v, vendorTerm)).slice(0, 6) : []),
    [vendors, vendorTerm],
  );
  const productMatchesList = useMemo(
    () => (productTerm.trim() ? invProducts.filter((p) => p.name.toLowerCase().includes(productTerm.toLowerCase())).slice(0, 8) : []),
    [invProducts, productTerm],
  );

  const addLine = (p: InvProduct) => {
    setLines((ls) => [
      ...ls,
      {
        key: crypto.randomUUID(),
        product: p,
        variantIndex: 0,
        qty: 1,
        b1: lockedBranch === "Branch 2" ? 0 : 1,
        b2: lockedBranch === "Branch 2" ? 1 : 0,
        unitCost: p.cost && p.cost > 0 ? p.cost : 0,
        updatePrice: false,
        newPrice: 0,
      },
    ]);
    setProductTerm("");
  };

  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const setQty = (l: Line, qty: number) => {
    const b1 = lockedBranch ? (lockedBranch === "Branch 1" ? qty : 0) : Math.min(l.b1, qty);
    patch(l.key, { qty, b1, b2: qty - b1 });
  };
  const setB1 = (l: Line, v: number) => {
    const b1 = Math.min(v, l.qty);
    patch(l.key, { b1, b2: l.qty - b1 });
  };
  const setB2 = (l: Line, v: number) => {
    const b2 = Math.min(v, l.qty);
    patch(l.key, { b2, b1: l.qty - b2 });
  };

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;

  const lineError = (l: Line): string | null => {
    if (l.qty < 1) return "Qty must be ≥ 1";
    if (l.b1 + l.b2 !== l.qty) return "Split doesn't match qty";
    if (l.updatePrice && l.newPrice <= 0) return "Enter the new selling price";
    return null;
  };

  /** Current selling price of the chosen variant (paise). */
  const sellingPrice = (l: Line) => l.product.variants[l.variantIndex]?.price || l.product.basePrice || 0;

  /** Margin note shown under a line; only warns, never blocks. */
  const marginNote = (l: Line): { text: string; bad: boolean } | null => {
    if (l.unitCost <= 0) return null;
    const oldCost = l.product.cost ?? 0;
    const price = l.updatePrice && l.newPrice > 0 ? l.newPrice : sellingPrice(l);
    const margin = price > 0 ? ((price - l.unitCost) / price) * 100 : 0;
    const costUp = oldCost > 0 && l.unitCost > oldCost;
    const low = price > 0 && margin < LOW_MARGIN_PCT;
    if (!costUp && !low) return null;
    const head = costUp ? `Cost up from ${formatINR(oldCost)} to ${formatINR(l.unitCost)}` : `Low margin at cost ${formatINR(l.unitCost)}`;
    const tail = price > 0 ? `selling price ${formatINR(price)} (${margin.toFixed(0)}% margin)` : "no selling price set";
    return { text: `${head} — ${tail}`, bad: price > 0 && (margin < LOW_MARGIN_PCT || price <= l.unitCost) };
  };

  const totals = lines.reduce(
    (t, l) => ({ qty: t.qty + l.qty, b1: t.b1 + l.b1, b2: t.b2 + l.b2, cost: t.cost + l.qty * l.unitCost }),
    { qty: 0, b1: 0, b2: 0, cost: 0 },
  );
  const tax = cgst + sgst + igst;
  const grandTotal = totals.cost + tax;
  const balance = Math.max(0, grandTotal - amountPaid);
  const canSubmit = !!vendor && lines.length > 0 && lines.every((l) => !lineError(l)) && !saving && amountPaid <= grandTotal;

  const resetForm = () => {
    setLines([]);
    setInvoiceNo("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setCgst(0); setSgst(0); setIgst(0);
    setAmountPaid(0);
    setPaymentMode("");
    setNotes("");
    batchRef.current = null;
  };

  const submit = async () => {
    if (!vendor) return notify("Pick a vendor first.");
    if (lines.length === 0) return notify("Add at least one product.");
    if (lines.some(lineError)) return notify("Fix the highlighted lines first.");
    if (amountPaid > grandTotal) return notify("Amount paid can't exceed the total.");
    setSaving(true);
    try {
      const batchId = (batchRef.current ??= crypto.randomUUID());
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          vendorId: vendor.id,
          invoiceNo,
          purchaseDate,
          subtotal: totals.cost,
          tax,
          cgst,
          sgst,
          igst,
          totalAmount: grandTotal,
          amountPaid,
          paymentMode,
          notes,
          lines: lines.map((l) => ({
            productId: l.product.id,
            variantIndex: l.variantIndex,
            unitCost: l.unitCost,
            quantity: l.qty,
            ...(isAdmin && l.updatePrice && l.newPrice > 0 ? { newPrice: l.newPrice } : {}),
            allocations: [
              { branch: "Branch 1", quantity: l.b1 },
              { branch: "Branch 2", quantity: l.b2 },
            ],
          })),
        }),
      });
      if (!res.ok) {
        // Keep the batch id after a server error / contention (409) so a retry
        // finishes the same purchase instead of adding its stock a second time.
        // Only a refused request (nothing written) starts a fresh submission.
        if (res.status < 500 && res.status !== 409) batchRef.current = null;
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "");
      }
      await hydratePOS();
      await loadPurchases();
      notify(`Purchase saved · ${totals.qty} unit${totals.qty === 1 ? "" : "s"} across ${lines.length} product${lines.length === 1 ? "" : "s"}`);
      resetForm();
    } catch (e) {
      notify(e instanceof Error && e.message ? e.message : "Couldn't save the purchase. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((p) =>
      p.id.toLowerCase().includes(q) ||
      p.invoiceNo.toLowerCase().includes(q) ||
      vendorName(p.vendorId).toLowerCase().includes(q),
    );
  }, [purchases, listQuery, vendors]);

  const exportCSV = () => {
    const r2 = (paise: number) => (paise / 100).toFixed(2);
    const head = ["Date", "Purchase ID", "Vendor Invoice", "Vendor", "Subtotal", "CGST", "SGST", "IGST", "Total", "Paid", "Balance", "Mode", "Notes"];
    const body = filtered.map((p) => [
      p.purchaseDate || p.createdAt.slice(0, 10),
      p.id,
      p.invoiceNo,
      vendorName(p.vendorId),
      r2(p.subtotal),
      r2(p.cgst),
      r2(p.sgst),
      r2(p.igst),
      r2(p.totalAmount),
      r2(p.amountPaid + p.paymentsTotal),
      r2(Math.max(0, p.totalAmount - p.amountPaid - p.paymentsTotal)),
      p.paymentMode,
      p.notes,
    ]);
    downloadCsv(`purchases-${Date.now()}.csv`, [head, ...body]);
  };

  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";
  const num = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-right text-sm tabular-nums focus:border-gold-500 focus:outline-none disabled:opacity-60";

  return (
    <div className="p-5 md:p-8">
      {creating && (
        <ProductModal
          product={null}
          initialName={productTerm.trim()}
          onClose={() => setCreating(false)}
          onCreated={(p) => addLine(p)}
        />
      )}
      {paying && (
        <PaymentDialog
          purchase={paying}
          vendorName={vendorName(paying.vendorId)}
          lockedBranch={lockedBranch}
          onClose={() => setPaying(null)}
          onDone={async (m) => { setPaying(null); notify(m); await loadPurchases(); }}
        />
      )}
      {editing && (
        <EditDialog
          purchase={editing}
          onClose={() => setEditing(null)}
          onDone={async (m) => { setEditing(null); notify(m); await loadPurchases(); }}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>
      )}

      <div className="mb-6 border-l-4 border-ink-900 pl-4">
        <h1 className="text-2xl font-bold text-ink-900">Purchases</h1>
        <p className="mt-1 text-sm text-ink-500">Record a vendor receipt — goods lines, GST, and the amount paid now (0 is fine). Edit paid-amount later or add a part-payment.</p>
      </div>

      <div className="space-y-6">
        {/* ─ Receive form ─ */}
        <section className="space-y-5 rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
          <div className="grid gap-5 md:grid-cols-2">
            {/* Vendor */}
            <div>
              <label className={label}>Vendor — search name / phone / code</label>
              {vendor ? (
                <div className="flex items-center justify-between rounded-lg border border-gold-300 bg-gold-50/60 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink-900"><Truck className="h-4 w-4 text-gold-600" />{vendor.name}{vendor.code ? ` · ${vendor.code}` : ""}</span>
                  <button onClick={() => setVendor(null)} className="grid h-6 w-6 place-items-center rounded text-ink-400 hover:bg-ink-900/5 hover:text-ink-900"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2.5 focus-within:border-gold-500">
                    <Search className="h-4 w-4 shrink-0 text-ink-400" />
                    <input value={vendorTerm} onChange={(e) => setVendorTerm(e.target.value)} placeholder="Start typing…" className="w-full bg-transparent text-sm focus:outline-none" />
                  </div>
                  {vendorMatchesList.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-ink-100 bg-white shadow-lg">
                      {vendorMatchesList.map((v) => (
                        <button key={v.id} onClick={() => { setVendor(v); setVendorTerm(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gold-50">
                          <span className="font-medium text-ink-900">{v.name}</span>
                          <span className="text-xs text-ink-400">{v.code || v.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {vendorTerm.trim() && vendorMatchesList.length === 0 && (
                    <p className="mt-1 text-[11px] text-ink-400">No vendor found. Add them on the Vendors page first.</p>
                  )}
                </div>
              )}
            </div>

            {/* Product lookup */}
            <div>
              <label className={label}>Add product to this receipt</label>
              <div className="relative">
                <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2.5 focus-within:border-gold-500">
                  <Search className="h-4 w-4 shrink-0 text-ink-400" />
                  <input value={productTerm} onChange={(e) => setProductTerm(e.target.value)} placeholder="Search inventory…" className="w-full bg-transparent text-sm focus:outline-none" />
                </div>
                {productTerm.trim() && isAdmin && (
                  <button onClick={() => setCreating(true)} className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-gold-600 hover:underline">
                    <Plus className="h-3.5 w-3.5" /> Add &quot;{productTerm.trim()}&quot; as a new product
                  </button>
                )}
                {productMatchesList.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-ink-100 bg-white shadow-lg">
                    {productMatchesList.map((p) => (
                      <button key={p.id} onClick={() => addLine(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gold-50">
                        <span className="font-medium text-ink-900">{p.name}</span>
                        <span className="text-xs text-ink-400">{productStock(p)} in stock</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Header: invoice no + date */}
          <div className="grid gap-4 md:grid-cols-3">
            <div><label className={label}>Vendor Invoice No</label><input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={field} placeholder="Bill/Invoice reference" /></div>
            <div><label className={label}>Purchase Date</label><input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={field} /></div>
            <div><label className={label}>Payment Mode (at purchase)</label>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={field}>
                {PAY_MODES.map((m) => <option key={m || "none"} value={m}>{m || "— not paid —"}</option>)}
              </select>
            </div>
          </div>

          {/* Lines */}
          <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-3 py-3">#</th>
                  <th>Product</th>
                  <th>Variant</th>
                  <th className="w-28">Unit cost (₹)</th>
                  <th className="w-20 text-right pr-2">Total qty</th>
                  <th className="w-20 text-right pr-2">Branch 1</th>
                  <th className="w-20 text-right pr-2">Branch 2</th>
                  <th className="w-24 text-right pr-2">Line total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {lines.map((l, i) => {
                  const err = lineError(l);
                  return (
                    <tr key={l.key} className={cn("align-middle", err && "bg-danger/5")}>
                      <td className="px-3 py-2 text-xs text-ink-400">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <p className="font-medium text-ink-900">{l.product.name}</p>
                        {err && <p className="text-[11px] text-danger">{err}</p>}
                        {(() => {
                          const m = marginNote(l);
                          return m && <p className={cn("text-[11px]", m.bad ? "text-danger" : "text-amber-600")}>{m.text}</p>;
                        })()}
                        {isAdmin && <>
                        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-500">
                          <input type="checkbox" checked={l.updatePrice} onChange={(e) => patch(l.key, { updatePrice: e.target.checked, newPrice: e.target.checked && l.newPrice <= 0 ? sellingPrice(l) : l.newPrice })} />
                          Update selling price (now {formatINR(sellingPrice(l))})
                        </label>
                        <p className="mt-0.5 max-w-[16rem] whitespace-normal text-[10px] leading-snug text-ink-400">
                          Receiving stock only updates your <b>cost</b>. Tick this to also change the <b>price customers pay</b> for this item, e.g. when the vendor raised their rate. Left unticked, the selling price stays as it is.
                        </p>
                        {l.updatePrice && (
                          <div className="mt-1 w-32"><MoneyInput value={l.newPrice} onChange={(paise) => patch(l.key, { newPrice: paise })} className={num} placeholder="New price" /></div>
                        )}
                        </>}
                      </td>
                      <td className="pr-2">
                        <select value={l.variantIndex} onChange={(e) => patch(l.key, { variantIndex: Number(e.target.value) })} className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-xs focus:outline-none">
                          {l.product.variants.map((v, vi) => (
                            <option key={vi} value={vi}>{v.attr}{v.finish ? ` · ${v.finish}` : ""}</option>
                          ))}
                        </select>
                      </td>
                      <td className="pr-2"><MoneyInput value={l.unitCost} onChange={(paise) => patch(l.key, { unitCost: paise })} className={num} placeholder="0" /></td>
                      <td className="pr-2"><input type="number" min={1} step={1} value={l.qty || ""} onChange={(e) => setQty(l, toInt(e.target.value))} className={num} /></td>
                      <td className="pr-2"><input type="number" min={0} step={1} value={l.b1} disabled={!!lockedBranch} onChange={(e) => setB1(l, toInt(e.target.value))} className={num} /></td>
                      <td className="pr-2"><input type="number" min={0} step={1} value={l.b2} disabled={!!lockedBranch} onChange={(e) => setB2(l, toInt(e.target.value))} className={num} /></td>
                      <td className="pr-2 text-right tabular-nums text-ink-700">{formatINR(l.qty * l.unitCost)}</td>
                      <td className="pr-2">
                        <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line" className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-400">Search above to add products to this purchase.</td></tr>
                )}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr className="border-t border-ink-100 bg-[#FAF7EF] text-xs font-semibold text-ink-900">
                    <td colSpan={4} className="px-3 py-3 text-right uppercase tracking-wider text-ink-500">Totals</td>
                    <td className="pr-2 text-right tabular-nums">{totals.qty}</td>
                    <td className="pr-2 text-right tabular-nums">{totals.b1}</td>
                    <td className="pr-2 text-right tabular-nums">{totals.b2}</td>
                    <td className="pr-2 text-right tabular-nums">{formatINR(totals.cost)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* GST + Paid + Grand total */}
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_1.2fr]">
            <div>
              <label className={label}>CGST (₹)</label>
              <MoneyInput value={cgst} onChange={setCgst} className={field + " text-right tabular-nums"} />
            </div>
            <div>
              <label className={label}>SGST (₹)</label>
              <MoneyInput value={sgst} onChange={setSgst} className={field + " text-right tabular-nums"} />
            </div>
            <div>
              <label className={label}>IGST (₹)</label>
              <MoneyInput value={igst} onChange={setIgst} className={field + " text-right tabular-nums"} />
            </div>
            <div>
              <label className={label}>Amount Paid Now (₹)</label>
              <MoneyInput value={amountPaid} onChange={setAmountPaid} className={field + " text-right tabular-nums"} />
            </div>
          </div>

          <div>
            <label className={label}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(field, "resize-none")} placeholder="Any remarks for this purchase…" />
          </div>

          {/* Summary + submit */}
          <div className="rounded-xl border border-ink-100 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-4 text-sm">
              <div><p className="text-[10px] uppercase tracking-wider text-ink-400">Goods Subtotal</p><p className="font-bold tabular-nums text-ink-900">{formatINR(totals.cost)}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-ink-400">GST (CGST+SGST+IGST)</p><p className="font-bold tabular-nums text-ink-900">{formatINR(tax)}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-ink-400">Grand Total</p><p className="font-bold tabular-nums text-ink-900">{formatINR(grandTotal)}</p></div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-400">Balance</p>
                <p className={cn("font-bold tabular-nums", balance > 0 ? "text-danger" : "text-success")}>{formatINR(balance)}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
            <p className="text-xs text-ink-500">
              {lockedBranch ? `Stock is received into ${lockedBranch}.` : "Branch 1 + Branch 2 always add up to the total qty."}
            </p>
            <button onClick={submit} disabled={!canSubmit} className="flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-ink-800 disabled:opacity-50">
              <PackagePlus className="h-4 w-4" /> {saving ? "Saving…" : "Save Purchase"}
            </button>
          </div>
        </section>

        {/* ─ Recent purchases ─ */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">Recent Purchases</h2>
            <div className="flex items-center gap-2">
              <input value={listQuery} onChange={(e) => setListQuery(e.target.value)} placeholder="Search purchase/invoice/vendor…" className="w-64 rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
              <button onClick={exportCSV} disabled={filtered.length === 0} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-900/5 disabled:opacity-50">
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-ivory-50">
            <table className="w-full min-w-[960px] whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-4 py-3">When</th>
                  <th>Purchase ID</th>
                  <th>Vendor Invoice</th>
                  <th>Vendor</th>
                  <th className="text-right">Goods</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                  <th>Mode</th>
                  <th className="pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {filtered.map((p) => {
                  const paidAll = p.amountPaid + p.paymentsTotal;
                  const bal = Math.max(0, p.totalAmount - paidAll);
                  const gstTotal = p.tax || p.cgst + p.sgst + p.igst;
                  return (
                    <Fragment key={p.id}>
                    <tr className="text-ink-700">
                      <td className="px-4 py-3 text-xs text-ink-500">{fmt(p.createdAt)}<div className="text-[10px] text-ink-400">{p.purchaseDate}</div></td>
                      <td className="font-semibold text-ink-900">
                        <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="inline-flex items-center gap-1 hover:text-gold-600" title="Show items bought">
                          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded === p.id && "rotate-180")} />
                          {p.id}
                        </button>
                        <div className="pl-5 text-[10px] font-normal text-ink-400">{p.lines.length} item{p.lines.length === 1 ? "" : "s"}</div>
                      </td>
                      <td className="text-ink-600">{p.invoiceNo || <span className="text-ink-300">—</span>}</td>
                      <td className="text-ink-700">{vendorName(p.vendorId)}</td>
                      <td className="text-right tabular-nums">{formatINR(p.subtotal)}</td>
                      <td className="text-right tabular-nums">{gstTotal ? formatINR(gstTotal) : "—"}</td>
                      <td className="text-right font-semibold tabular-nums text-ink-900">{formatINR(p.totalAmount)}</td>
                      <td className="text-right tabular-nums text-success">{formatINR(paidAll)}</td>
                      <td className={cn("text-right font-semibold tabular-nums", bal > 0 ? "text-danger" : "text-ink-400")}>{bal > 0 ? formatINR(bal) : "—"}</td>
                      <td className="text-[11px] uppercase text-ink-500">{p.paymentMode || "—"}</td>
                      <td className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setPaying(p)} disabled={bal <= 0} title={bal > 0 ? "Record a payment" : "Fully paid"} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-900/5 hover:text-gold-600 disabled:cursor-not-allowed disabled:opacity-40">
                            <Receipt className="h-3.5 w-3.5" /> Pay
                          </button>
                          {isAdmin && (
                            <button onClick={() => setEditing(p)} title="Edit purchase" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-900/5 hover:text-gold-600">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <Link href={`/admin/vendors?v=${p.vendorId}`} className="hidden" aria-hidden />
                        </div>
                      </td>
                    </tr>
                    {expanded === p.id && (
                      <tr className="bg-[#FAF7EF]">
                        <td colSpan={11} className="px-4 py-3">
                          <table className="w-full max-w-3xl text-xs">
                            <thead>
                              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                                <th className="py-1">Item</th><th>Variant</th><th>Branch</th><th className="text-right">Qty</th><th className="text-right">Unit cost</th><th className="text-right">Line total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100">
                              {p.lines.map((l) => (
                                <tr key={l.id} className="text-ink-700">
                                  <td className="py-1.5 font-medium text-ink-900">{l.productName}</td>
                                  <td>{l.variant || "—"}</td>
                                  <td>{l.branch}</td>
                                  <td className="text-right tabular-nums">{l.quantity}</td>
                                  <td className="text-right tabular-nums">{formatINR(l.unitCost)}</td>
                                  <td className="text-right tabular-nums">{formatINR(l.quantity * l.unitCost)}</td>
                                </tr>
                              ))}
                              {p.lines.length === 0 && <tr><td colSpan={6} className="py-2 text-ink-400">No items linked to this purchase.</td></tr>}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={11} className="px-4 py-12 text-center text-sm text-ink-400">No purchases yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ──────────────── Payment dialog ──────────────── */
function PaymentDialog({
  purchase, vendorName, lockedBranch, onClose, onDone,
}: {
  purchase: PurchaseRow;
  vendorName: string;
  lockedBranch: "Branch 1" | "Branch 2" | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const bal = Math.max(0, purchase.totalAmount - purchase.amountPaid - purchase.paymentsTotal);
  const [amount, setAmount] = useState<number>(bal);
  const [mode, setMode] = useState<"CASH" | "UPI" | "CARD" | "BANK" | "OTHER">("CASH");
  const [branch, setBranch] = useState<"Branch 1" | "Branch 2">(lockedBranch ?? "Branch 1");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (amount <= 0) { setError("Amount must be greater than 0."); return; }
    if (amount > bal) { setError(`Only ${formatINR(bal)} outstanding.`); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/purchases/${purchase.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, mode, branch, reference, notes }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(typeof b?.error === "string" ? b.error : "Couldn't record the payment.");
      }
      onDone(`Recorded ${formatINR(amount)} payment to ${vendorName}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed.");
      setSaving(false);
    }
  };

  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";
  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink-900">Record Payment</h3>
        <p className="mt-1 text-xs text-ink-500">{purchase.id} · {vendorName}</p>
        <p className="mt-3 rounded-lg bg-ink-900/5 px-3 py-2 text-xs"><span className="text-ink-500">Outstanding:</span> <span className="font-bold tabular-nums text-ink-900">{formatINR(bal)}</span></p>
        <div className="mt-4 space-y-4">
          <div><label className={label}>Amount (₹)</label><MoneyInput value={amount} onChange={setAmount} className={field + " text-right tabular-nums"} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className={field}>
                {(["CASH", "UPI", "CARD", "BANK", "OTHER"] as const).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Branch (paid from)</label>
              <select value={branch} onChange={(e) => setBranch(e.target.value as typeof branch)} disabled={!!lockedBranch} className={field}>
                <option value="Branch 1">Branch 1</option>
                <option value="Branch 2">Branch 2</option>
              </select>
            </div>
          </div>
          <div><label className={label}>Reference (cheque / txn id)</label><input value={reference} onChange={(e) => setReference(e.target.value)} className={field} /></div>
          <div><label className={label}>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(field, "resize-none")} /></div>
          {error && <p className="text-xs font-semibold text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
            <button onClick={submit} disabled={saving} className="flex-1 rounded-xl bg-ink-900 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800 disabled:opacity-60">
              <Check className="mr-1 inline h-4 w-4" /> {saving ? "Saving…" : "Save Payment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── Edit dialog ──────────────── */
function EditDialog({
  purchase, onClose, onDone,
}: {
  purchase: PurchaseRow;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [invoiceNo, setInvoiceNo] = useState(purchase.invoiceNo);
  const [purchaseDate, setPurchaseDate] = useState(purchase.purchaseDate);
  const [cgst, setCgst] = useState(purchase.cgst);
  const [sgst, setSgst] = useState(purchase.sgst);
  const [igst, setIgst] = useState(purchase.igst);
  const [amountPaid, setAmountPaid] = useState(purchase.amountPaid);
  const [notes, setNotes] = useState(purchase.notes);
  const [paymentMode, setPaymentMode] = useState(purchase.paymentMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tax = cgst + sgst + igst;
  const total = purchase.subtotal + tax;
  const later = purchase.paymentsTotal;

  const submit = async () => {
    if (amountPaid + later > total) { setError("Amount paid can't exceed the total."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/purchases/${purchase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNo, purchaseDate, cgst, sgst, igst, amountPaid, paymentMode, notes }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(typeof b?.error === "string" ? b.error : "Save failed.");
      }
      onDone(`Updated ${purchase.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setSaving(false);
    }
  };

  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";
  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-ivory-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink-900">Edit Purchase</h3>
        <p className="mt-1 text-xs text-ink-500">{purchase.id} · goods subtotal {formatINR(purchase.subtotal)}</p>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Vendor Invoice No</label><input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={field} /></div>
            <div><label className={label}>Purchase Date</label><input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={field} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={label}>CGST (₹)</label><MoneyInput value={cgst} onChange={setCgst} className={field + " text-right tabular-nums"} /></div>
            <div><label className={label}>SGST (₹)</label><MoneyInput value={sgst} onChange={setSgst} className={field + " text-right tabular-nums"} /></div>
            <div><label className={label}>IGST (₹)</label><MoneyInput value={igst} onChange={setIgst} className={field + " text-right tabular-nums"} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Paid at purchase (₹)</label><MoneyInput value={amountPaid} onChange={setAmountPaid} className={field + " text-right tabular-nums"} /></div>
            <div><label className={label}>Payment Mode</label>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={field}>
                {PAY_MODES.map((m) => <option key={m || "none"} value={m}>{m || "—"}</option>)}
              </select>
            </div>
          </div>
          <div><label className={label}>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(field, "resize-none")} /></div>
          <div className="rounded-lg bg-ink-900/5 px-3 py-2 text-xs">
            <span className="text-ink-500">Grand total:</span> <span className="font-bold tabular-nums text-ink-900">{formatINR(total)}</span>
            <span className="mx-3 text-ink-300">·</span>
            <span className="text-ink-500">Balance:</span> <span className="font-bold tabular-nums text-ink-900">{formatINR(Math.max(0, total - amountPaid - later))}</span>
          </div>
          {error && <p className="text-xs font-semibold text-danger">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
            <button onClick={submit} disabled={saving} className="flex-1 rounded-xl bg-ink-900 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800 disabled:opacity-60">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
