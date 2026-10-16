"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PackagePlus, Search, X, Truck, Trash2, Plus, FileText } from "lucide-react";
import { usePOS, productStock, type InvProduct } from "@/lib/store/pos";
import { useVendors, vendorMatches } from "@/lib/store/vendors";
import { useBranchScope } from "@/lib/store/branch";
import type { Vendor } from "@/types";
import { formatINR, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import dynamic from "next/dynamic";

// The product editor only opens on demand, so it loads when first needed.
const ProductModal = dynamic(() => import("@/components/admin/ProductModal").then((m) => m.ProductModal), { ssr: false });
import { useAuth } from "@/lib/store/auth";
import { BRANCH_KEYS, DEFAULT_BRANCH, emptyStockByBranch, branchLabel, variantStockAt } from "@/lib/stock";
import { computePurchaseTax, checkPurchaseTax, computeInclusiveTax, exclusiveCost, inclusiveCost } from "@/lib/gst/purchaseTax";
import { PAY_MODES } from "@/components/purchases/types";
import { allocList, sumAlloc, type PaymentAlloc } from "@/lib/paymentAlloc";
import { splitByWeights } from "@/lib/vendorPayPlan";
import { BranchPayTable, enteredPay, overBranches, overMessage, type BranchPayRow } from "@/components/purchases/BranchPayTable";
import { allocTotal, followTotal, moveAll, putRest, splitEvenly, splitStatus, takeFrom, zeroAlloc } from "@/lib/purchaseSplit";

/** One line in the receive form. The branch boxes are the truth; `target` is only the total printed on the vendor's bill (if typed). */
interface Line {
  key: string;
  product: InvProduct;
  variantIndex: number;
  /** The vendor bill's total quantity for this line, if the person typed it — only compared with the boxes, never forced onto them. */
  target: number | null;
  /** Units received into each branch. */
  alloc: Record<string, number>;
  /** What was typed (paise): with GST included when "Prices include GST" is ticked, else before GST. */
  unitCost: number;
  /** GST rate (%) the vendor charges on this line. */
  gst: number;
  /** Opt-in: also change this variant's selling price (paise) on save. */
  updatePrice: boolean;
  newPrice: number;
}

const GST_RATES = [0, 5, 12, 18, 28];
/** Warn when margin on selling price drops below this. */
const LOW_MARGIN_PCT = 10;
const toInt = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

export default function PurchasesPage() {
  const invProducts = usePOS((s) => s.invProducts);
  const hydratePOS = usePOS((s) => s.hydrate);
  const vendors = useVendors((s) => s.vendors);
  const hydrateVendors = useVendors((s) => s.hydrate);

  const canSwitch = useBranchScope((s) => s.canSwitch);
  const allowedBranches = useBranchScope((s) => s.allowed);
  const lockedBranch = !canSwitch && allowedBranches.length === 1 ? allowedBranches[0] : null;

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
  const [interState, setInterState] = useState(false);
  /** The vendor's prices include GST (the default): the tax is taken out of each cost. */
  const [inclusive, setInclusive] = useState(true);
  // GST is worked out from the lines; these only hold a figure typed over it (e.g. the vendor rounded the bill).
  const [taxEdited, setTaxEdited] = useState(false);
  const [cgst, setCgst] = useState(0);
  const [sgst, setSgst] = useState(0);
  const [igst, setIgst] = useState(0);
  const [payAlloc, setPayAlloc] = useState<PaymentAlloc>({});
  /** Branch that new lines start in. */
  const [newLinesTo, setNewLinesTo] = useState<string>(DEFAULT_BRANCH);
  const [paymentMode, setPaymentMode] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    void hydrateVendors();
  }, [hydrateVendors]);

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
        target: null,
        alloc: { ...zeroAlloc(), [lockedBranch ?? newLinesTo]: 1 },
        unitCost: p.cost && p.cost > 0 ? (inclusive ? inclusiveCost(p.cost, p.gstRate ?? 0) : p.cost) : 0,
        gst: p.gstRate ?? 0, // the product's own rate, changeable per line
        updatePrice: false,
        newPrice: 0,
      },
    ]);
    setProductTerm("");
  };

  /** A line's cost before GST — what stock is valued at, whichever way it was typed. */
  const exCost = (l: Line) => (inclusive ? exclusiveCost(l.unitCost, l.gst) : l.unitCost);

  /** Flip between "prices include GST" and "before GST", keeping every line's real cost the same. */
  const toggleInclusive = (on: boolean) => {
    setLines((ls) => ls.map((l) => ({ ...l, unitCost: on ? inclusiveCost(l.unitCost, l.gst) : exclusiveCost(l.unitCost, l.gst) })));
    setInclusive(on);
  };

  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  /** Units that will actually be added: whatever is in the branch boxes. */
  const qtyOf = (l: Line) => allocTotal(l.alloc);

  /** The total box: remembered as the bill's total and compared with the boxes. If all the stock sits in one branch it simply follows. */
  const setTotal = (l: Line, v: number) => {
    if (lockedBranch) return patch(l.key, { target: null, alloc: { ...zeroAlloc(), [lockedBranch]: v } });
    patch(l.key, v > 0 ? { target: v, alloc: followTotal(l.alloc, v, newLinesTo) } : { target: null });
  };
  /** A branch box changes only itself. */
  const setBranchQty = (l: Line, branch: string, v: number) => patch(l.key, { alloc: { ...l.alloc, [branch]: v } });

  const lineError = (l: Line): string | null => {
    const st = splitStatus(l.alloc, l.target);
    if (st.state === "empty") return "Enter how many each branch gets";
    if (st.state === "under") return `${st.sum} of ${st.target} placed — ${st.diff} left to place`;
    if (st.state === "over") return `${st.diff} too many — ${st.sum} placed, the bill says ${st.target}`;
    if (l.updatePrice && l.newPrice <= 0) return "Enter the new selling price";
    return null;
  };

  /** The red / amber note under a line, with one-click ways to fix the difference (nothing moves until you click). */
  const splitNote = (l: Line, err: string) => {
    const st = splitStatus(l.alloc, l.target);
    const chip = "rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink-700 hover:border-gold-500";
    return (
      <div className={cn("mt-0.5 text-[11px]", st.state === "under" ? "text-amber-700" : "text-danger")}>
        <p className="font-semibold">{err}</p>
        {!lockedBranch && st.state === "under" && (
          <p className="mt-1 flex flex-wrap items-center gap-1 text-ink-500">
            Put {st.diff} in:
            {BRANCH_KEYS.map((b) => <button key={b} type="button" onClick={() => patch(l.key, { alloc: putRest(l.alloc, b, st.diff) })} className={chip}>{branchLabel(b)}</button>)}
          </p>
        )}
        {!lockedBranch && st.state === "over" && (
          <p className="mt-1 flex flex-wrap items-center gap-1 text-ink-500">
            Take {st.diff} from:
            {BRANCH_KEYS.filter((b) => (l.alloc[b] || 0) > 0).map((b) => <button key={b} type="button" onClick={() => patch(l.key, { alloc: takeFrom(l.alloc, b, st.diff) })} className={chip}>{branchLabel(b)}</button>)}
          </p>
        )}
      </div>
    );
  };

  /** Current selling price of the chosen variant (paise). */
  const sellingPrice = (l: Line) => l.product.variants[l.variantIndex]?.price || l.product.basePrice || 0;

  /** Margin note shown under a line; only warns, never blocks. */
  const marginNote = (l: Line): { text: string; bad: boolean } | null => {
    if (l.unitCost <= 0) return null;
    const oldCost = l.product.cost ?? 0;
    const price = l.updatePrice && l.newPrice > 0 ? l.newPrice : sellingPrice(l);
    const cost = exCost(l);
    const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
    const costUp = oldCost > 0 && cost > oldCost;
    const low = price > 0 && margin < LOW_MARGIN_PCT;
    if (!costUp && !low) return null;
    const head = costUp ? `Cost up from ${formatINR(oldCost)} to ${formatINR(cost)}` : `Low margin at cost ${formatINR(cost)}`;
    const tail = price > 0 ? `selling price ${formatINR(price)} (${margin.toFixed(0)}% margin)` : "no selling price set";
    return { text: `${head} — ${tail}`, bad: price > 0 && (margin < LOW_MARGIN_PCT || price <= cost) };
  };

  const totals = lines.reduce(
    (t, l) => ({
      qty: t.qty + qtyOf(l),
      alloc: Object.fromEntries(BRANCH_KEYS.map((b) => [b, (t.alloc[b] || 0) + (l.alloc[b] || 0)])) as Record<string, number>,
      cost: t.cost + qtyOf(l) * exCost(l),
    }),
    { qty: 0, alloc: emptyStockByBranch(), cost: 0 },
  );

  // GST from each line's rate; a figure typed over it wins.
  const taxLines = lines.map((l) => ({ quantity: qtyOf(l), unitCost: l.unitCost, gst: l.gst }));
  const autoTax = inclusive ? computeInclusiveTax(taxLines, interState) : computePurchaseTax(taxLines, interState);
  const taxNow = taxEdited ? { cgst, sgst, igst } : autoTax;
  const tax = taxNow.cgst + taxNow.sgst + taxNow.igst;
  const grandTotal = totals.cost + tax;
  const taxProblem = lines.length > 0 ? checkPurchaseTax(lines.map((l) => ({ quantity: qtyOf(l), unitCost: exCost(l), gst: l.gst })), taxNow) : null;

  // Each branch pays its own part of the bill: its share of the goods it takes, with the GST on top.
  const receiving = BRANCH_KEYS.filter((b) => (totals.alloc[b] || 0) > 0);
  const goodsBy = Object.fromEntries(receiving.map((b) => [b, lines.reduce((n, l) => n + (l.alloc[b] || 0) * exCost(l), 0)]));
  const branchShare = splitByWeights(
    grandTotal,
    Object.values(goodsBy).some((g) => g > 0) ? goodsBy : Object.fromEntries(receiving.map((b) => [b, totals.alloc[b] || 0])),
  );
  const payRows: BranchPayRow[] = receiving.map((b) => ({ branch: b, qty: totals.alloc[b] || 0, value: branchShare[b] || 0, max: branchShare[b] || 0 }));
  const paidSplit = enteredPay(payRows, payAlloc);
  const payOver = overBranches(payRows, paidSplit);
  const amountPaid = sumAlloc(paidSplit);
  const balance = Math.max(0, grandTotal - amountPaid);
  const canSubmit = !!vendor && lines.length > 0 && lines.every((l) => !lineError(l)) && !saving && !taxProblem && payOver.length === 0;

  const resetForm = () => {
    setLines([]);
    setInvoiceNo("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setInterState(false);
    setInclusive(true);
    setTaxEdited(false);
    setCgst(0); setSgst(0); setIgst(0);
    setPayAlloc({});
    setPaymentMode("");
    setNotes("");
    batchRef.current = null;
  };

  const setTax = (which: "cgst" | "sgst" | "igst", v: number) => {
    if (!taxEdited) { setCgst(autoTax.cgst); setSgst(autoTax.sgst); setIgst(autoTax.igst); }
    setTaxEdited(true);
    if (which === "cgst") setCgst(v);
    else if (which === "sgst") setSgst(v);
    else setIgst(v);
  };

  const submit = async () => {
    if (!vendor) return notify("Pick a vendor first.");
    if (lines.length === 0) return notify("Add at least one product.");
    if (lines.some(lineError)) return notify("Fix the highlighted lines first.");
    if (taxProblem) return notify(taxProblem);
    if (payOver.length > 0) return notify(overMessage(payOver) ?? "A branch is paying more than its share.");
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
          cgst: taxNow.cgst,
          sgst: taxNow.sgst,
          igst: taxNow.igst,
          totalAmount: grandTotal,
          amountPaid,
          ...(amountPaid > 0 ? { paidAllocations: allocList(paidSplit) } : {}),
          paymentMode,
          notes,
          lines: lines.map((l) => ({
            productId: l.product.id,
            variantIndex: l.variantIndex,
            unitCost: exCost(l), // stored before GST
            gst: l.gst,
            quantity: qtyOf(l),
            ...(isAdmin && l.updatePrice && l.newPrice > 0 ? { newPrice: l.newPrice } : {}),
            allocations: BRANCH_KEYS.filter((b) => (l.alloc[b] || 0) > 0).map((b) => ({ branch: b, quantity: l.alloc[b] })),
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
      notify(`Purchase saved · ${totals.qty} unit${totals.qty === 1 ? "" : "s"} across ${lines.length} product${lines.length === 1 ? "" : "s"}`);
      resetForm();
    } catch (e) {
      notify(e instanceof Error && e.message ? e.message : "Couldn't save the purchase. Try again.");
    } finally {
      setSaving(false);
    }
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
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-l-4 border-ink-900 pl-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Purchases</h1>
          <p className="mt-1 text-sm text-ink-500">Record a vendor receipt — goods lines, GST, and the amount paid now (0 is fine).</p>
        </div>
        <Link href="/admin/purchases/invoices" className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-ivory-100">
          <FileText className="h-4 w-4" /> Purchase invoices
        </Link>
      </div>

      <div className="space-y-6">
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
          {!lockedBranch && (
            <label className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
              New products start in
              <select value={newLinesTo} onChange={(e) => setNewLinesTo(e.target.value)} className="rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1 text-xs focus:border-gold-500 focus:outline-none">
                {BRANCH_KEYS.map((b) => <option key={b} value={b}>{branchLabel(b)}</option>)}
              </select>
              <span className="text-ink-400">— then type how many each branch gets. The boxes never move on their own.</span>
            </label>
          )}
          <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  <th className="px-3 py-3">#</th>
                  <th>Product</th>
                  <th>Variant</th>
                  <th className="w-28">{inclusive ? "Cost incl. GST (₹)" : "Cost excl. GST (₹)"}</th>
                  <th className="w-20">GST %</th>
                  <th className="w-24 text-right pr-2">Bill total qty <span className="font-normal normal-case tracking-normal text-ink-300">(optional)</span></th>
                  {BRANCH_KEYS.map((b) => <th key={b} className="w-20 text-right pr-2">{branchLabel(b)}</th>)}
                  <th className="w-24 text-right pr-2">Line total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {lines.map((l, i) => {
                  const err = lineError(l);
                  return (
                    <tr key={l.key} className={cn("align-middle", err && (splitStatus(l.alloc, l.target).state === "under" ? "bg-amber-50" : "bg-danger/5"))}>
                      <td className="px-3 py-2 text-xs text-ink-400">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <p className="font-medium text-ink-900">{l.product.name}</p>
                        {err && splitNote(l, err)}
                        {(() => {
                          const m = marginNote(l);
                          return m && <p className={cn("text-[11px]", m.bad ? "text-danger" : "text-amber-600")}>{m.text}</p>;
                        })()}
                        {isAdmin && <>
                        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-500">
                          <input type="checkbox" checked={l.updatePrice} onChange={(e) => patch(l.key, { updatePrice: e.target.checked, newPrice: e.target.checked && l.newPrice <= 0 ? sellingPrice(l) : l.newPrice })} />
                          Update selling price (now {formatINR(sellingPrice(l))})
                        </label>
                        {l.updatePrice && (
                          <div className="mt-1 w-32"><MoneyInput value={l.newPrice} onChange={(paise) => patch(l.key, { newPrice: paise })} className={num} placeholder="New price" /></div>
                        )}
                        </>}
                      </td>
                      <td className="pr-2">
                        <select value={l.variantIndex} onChange={(e) => patch(l.key, { variantIndex: Number(e.target.value) })} className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1.5 text-xs focus:outline-none">
                          {l.product.variants.map((v, vi) => (
                            <option key={vi} value={vi}>{v.attr}{v.finish ? ` · ${v.finish}` : ""} — {BRANCH_KEYS.map((b) => `${branchLabel(b)} ${variantStockAt(v, b)}`).join(" · ")}</option>
                          ))}
                        </select>
                      </td>
                      <td className="pr-2"><MoneyInput value={l.unitCost} onChange={(paise) => patch(l.key, { unitCost: paise })} className={num} placeholder="0" /></td>
                      <td className="pr-2">
                        <select value={l.gst} onChange={(e) => patch(l.key, { gst: Number(e.target.value) })} className={num}>
                          {[...new Set([...GST_RATES, l.gst])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td className="pr-2">
                        <input type="number" min={0} step={1} value={(l.target ?? qtyOf(l)) || ""} onChange={(e) => setTotal(l, toInt(e.target.value))} title="Total on the vendor's bill (optional) — the branch boxes are compared with it" className={cn(num, l.target !== null && "border-gold-400")} />
                        {!lockedBranch && (
                          <select
                            value=""
                            onChange={(e) => {
                              const v = e.target.value;
                              const total = l.target ?? qtyOf(l);
                              patch(l.key, { alloc: v === "even" ? splitEvenly(total) : moveAll(total, v) });
                            }}
                            aria-label="Quick split"
                            className="mt-1 w-full rounded border border-ink-100 bg-transparent px-1 py-0.5 text-[10px] text-ink-500 focus:outline-none"
                          >
                            <option value="">Quick split…</option>
                            {BRANCH_KEYS.map((b) => <option key={b} value={b}>All to {branchLabel(b)}</option>)}
                            <option value="even">Split evenly</option>
                          </select>
                        )}
                      </td>
                      {BRANCH_KEYS.map((b) => (
                        <td key={b} className="pr-2"><input type="number" min={0} step={1} value={l.alloc[b] || 0} disabled={!!lockedBranch} onChange={(e) => setBranchQty(l, b, toInt(e.target.value))} className={num} /></td>
                      ))}
                      <td className="pr-2 text-right tabular-nums text-ink-700">{formatINR(qtyOf(l) * l.unitCost)}</td>
                      <td className="pr-2">
                        <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line" className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr><td colSpan={8 + BRANCH_KEYS.length} className="px-4 py-10 text-center text-sm text-ink-400">Search above to add products to this purchase.</td></tr>
                )}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr className="border-t border-ink-100 bg-[#FAF7EF] text-xs font-semibold text-ink-900">
                    <td colSpan={5} className="px-3 py-3 text-right uppercase tracking-wider text-ink-500">Totals</td>
                    <td className="pr-2 text-right tabular-nums">{totals.qty}</td>
                    {BRANCH_KEYS.map((b) => <td key={b} className="pr-2 text-right tabular-nums">{totals.alloc[b]}</td>)}
                    <td className="pr-2 text-right tabular-nums">{formatINR(lines.reduce((n, l) => n + qtyOf(l) * l.unitCost, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* GST */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs text-ink-600">
                  <input type="checkbox" checked={inclusive} onChange={(e) => toggleInclusive(e.target.checked)} />
                  Prices include GST
                </label>
                <label className="flex items-center gap-2 text-xs text-ink-600">
                  <input type="checkbox" checked={interState} onChange={(e) => setInterState(e.target.checked)} />
                  Inter-state purchase (IGST instead of CGST + SGST)
                </label>
              </div>
              <p className="text-[11px] text-ink-400">
                {inclusive ? "The GST is taken out of each cost you type, using the line's rate." : "The GST is added on top of each cost, using the line's rate."}{" "}
                {taxEdited && <button onClick={() => setTaxEdited(false)} className="font-semibold text-gold-600 hover:underline">Reset to calculated</button>}
              </p>
              {taxProblem && <p className="text-xs font-semibold text-danger">{taxProblem}</p>}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className={label}>CGST (₹)</label>
                <MoneyInput value={taxNow.cgst} onChange={(v) => setTax("cgst", v)} className={field + " text-right tabular-nums"} />
              </div>
              <div>
                <label className={label}>SGST (₹)</label>
                <MoneyInput value={taxNow.sgst} onChange={(v) => setTax("sgst", v)} className={field + " text-right tabular-nums"} />
              </div>
              <div>
                <label className={label}>IGST (₹)</label>
                <MoneyInput value={taxNow.igst} onChange={(v) => setTax("igst", v)} className={field + " text-right tabular-nums"} />
              </div>
            </div>
          </div>

          {/* Paid now — each branch pays its own part */}
          <div>
            <label className={label}>Paid now — each branch pays its own part</label>
            <BranchPayTable rows={payRows} value={paidSplit} onChange={setPayAlloc} valueLabel="Its bill" payLabel="Paid now" />
          </div>

          <div>
            <label className={label}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(field, "resize-none")} placeholder="Any remarks for this purchase…" />
          </div>

          {/* Summary + submit */}
          <div className="rounded-xl border border-ink-100 bg-white p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-4">
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
              {payOver.length > 0
                ? <span className="font-semibold text-danger">{overMessage(payOver)}</span>
                : lockedBranch ? `Stock is received into ${branchLabel(lockedBranch)}.` : "Type how many each branch gets. If you also type the vendor bill's total, any difference is marked in red."}
            </p>
            <button onClick={submit} disabled={!canSubmit} className="flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-ink-800 disabled:opacity-50">
              <PackagePlus className="h-4 w-4" /> {saving ? "Saving…" : "Save Purchase"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
