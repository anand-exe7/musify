"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PackagePlus, Search, X, Truck, Trash2, Plus, FileText, Package, Loader2 } from "lucide-react";
import { Segmented } from "@/components/admin/Segmented";
import { usePOS, useInventory, productStock, type InvProduct } from "@/lib/store/pos";
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
  const invProducts = useInventory();
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
  /** EXP-01: payments on this bill are subtracted in the sales analytics. */
  const [inAnalytics, setInAnalytics] = useState(false);

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
  /** EXP-02: money paid now must say how it was paid, so analytics can file it under the right mode. */
  const modeMissing = amountPaid > 0 && (!paymentMode || paymentMode === "CREDIT");
  const canSubmit = !modeMissing && !!vendor && lines.length > 0 && lines.every((l) => !lineError(l)) && !saving && !taxProblem && payOver.length === 0;

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
    setInAnalytics(false);
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
    if (modeMissing) return notify("Choose how the amount paid now was paid.");
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
          ...(isAdmin && inAnalytics ? { inAnalytics: true } : {}),
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

  const field = "h-11 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500";
  const cellLabel = "mb-1 block truncate text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400";
  const num = "h-10 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-right text-sm tabular-nums text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20 disabled:bg-ink-50 disabled:text-ink-400";
  const linesValue = lines.reduce((n, l) => n + qtyOf(l) * l.unitCost, 0);

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

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink-900 text-gold-400"><PackagePlus className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold text-ink-900">New Purchase</h1>
            <p className="mt-0.5 text-sm text-ink-500">Record a vendor bill: the goods, which branch gets them, the GST and anything paid now.</p>
          </div>
        </div>
        <Link href="/admin/purchases/invoices" className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-ivory-100">
          <FileText className="h-4 w-4" /> Vendor bills
        </Link>
      </div>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* 1 · Bill details */}
          <Step n={1} title="Bill details" hint="Who sent the goods and their bill number.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className={label}>Vendor</label>
                {vendor ? (
                  <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-gold-400 bg-gold-50/70 px-3.5">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-900">
                      <Truck className="h-4 w-4 shrink-0 text-gold-600" />
                      <span className="truncate">{vendor.name}</span>
                      {vendor.code && <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-ink-500">{vendor.code}</span>}
                    </span>
                    <button onClick={() => setVendor(null)} aria-label="Change vendor" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-ink-900/5 hover:text-ink-900"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <input value={vendorTerm} onChange={(e) => setVendorTerm(e.target.value)} placeholder="Search name, phone or code…" className={cn(field, "pl-10")} />
                    {vendorMatchesList.length > 0 && (
                      <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-ink-100 bg-white shadow-xl">
                        {vendorMatchesList.map((v) => (
                          <button key={v.id} onClick={() => { setVendor(v); setVendorTerm(""); }} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-gold-50">
                            <span className="truncate font-medium text-ink-900">{v.name}</span>
                            <span className="shrink-0 text-xs text-ink-400">{v.code || v.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {vendorTerm.trim() && vendorMatchesList.length === 0 && (
                      <p className="mt-1.5 text-[11px] text-ink-400">No vendor found. <Link href="/admin/vendors" className="font-semibold text-gold-700 hover:underline">Add them on the Vendors page</Link> first.</p>
                    )}
                  </div>
                )}
              </div>
              <div><label className={label}>Vendor invoice no</label><input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={field} placeholder="e.g. INV-2041" /></div>
              <div><label className={label}>Purchase date</label><input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={field} /></div>
            </div>
          </Step>

          {/* 2 · Products */}
          <Step
            n={2}
            title="Products"
            hint={lockedBranch ? `Everything is received into ${branchLabel(lockedBranch)}.` : "Type how many each branch gets. The bill total is optional and only checks your split."}
            right={lines.length > 0 ? <span className="rounded-full bg-ink-900/[0.06] px-3 py-1 text-xs font-semibold text-ink-700">{lines.length} product{lines.length === 1 ? "" : "s"} · {totals.qty} pcs</span> : null}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input value={productTerm} onChange={(e) => setProductTerm(e.target.value)} placeholder="Search inventory to add a product…" className={cn(field, "pl-10")} />
                {(productMatchesList.length > 0 || (productTerm.trim() && isAdmin)) && (
                  <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-ink-100 bg-white shadow-xl">
                    {productMatchesList.map((p) => (
                      <button key={p.id} onClick={() => addLine(p)} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-gold-50">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink-900">{p.name}</span>
                          <span className="block truncate text-[11px] text-ink-400">{[p.brand, p.category].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-ink-900/5 px-2 py-0.5 text-[11px] font-semibold text-ink-600">{productStock(p)} in stock</span>
                      </button>
                    ))}
                    {productTerm.trim() && isAdmin && (
                      <button onClick={() => setCreating(true)} className="flex w-full items-center gap-2 border-t border-ink-100 bg-ivory-50 px-3.5 py-2.5 text-left text-xs font-semibold text-gold-700 hover:bg-gold-50">
                        <Plus className="h-3.5 w-3.5" /> Add &ldquo;{productTerm.trim()}&rdquo; as a new product
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!lockedBranch && (
                <Segmented label="Start in" value={newLinesTo} options={BRANCH_KEYS.map((b) => [b, branchLabel(b)] as const)} onChange={setNewLinesTo} className="shrink-0" />
              )}
            </div>

            <div className="mt-4 space-y-3">
              {lines.map((l, i) => {
                const err = lineError(l);
                const st = splitStatus(l.alloc, l.target);
                const m = marginNote(l);
                const variant = l.product.variants[l.variantIndex];
                return (
                  <div key={l.key} className={cn("rounded-2xl border bg-white p-4 transition-colors", err ? (st.state === "under" ? "border-amber-300 bg-amber-50/40" : "border-danger/40 bg-danger/[0.03]") : "border-ink-100")}>
                    {/* Product + variant */}
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-900 text-[11px] font-bold text-ivory-50">{i + 1}</span>
                      <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(0,1fr)_16rem] md:items-start">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-ink-900">{l.product.name}</p>
                          {variant && (
                            <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-400">
                              <span>Stock now:</span>
                              {BRANCH_KEYS.map((b) => <span key={b}>{branchLabel(b)} <b className="font-semibold text-ink-600">{variantStockAt(variant, b)}</b></span>)}
                            </p>
                          )}
                        </div>
                        {l.product.variants.length > 1 ? (
                          <select value={l.variantIndex} onChange={(e) => patch(l.key, { variantIndex: Number(e.target.value) })} aria-label="Variant" className="h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-gold-500 focus:outline-none">
                            {l.product.variants.map((v, vi) => <option key={vi} value={vi}>{v.attr}{v.finish ? ` · ${v.finish}` : ""}</option>)}
                          </select>
                        ) : (
                          <span className="flex h-10 items-center rounded-lg border border-dashed border-ink-200 px-3 text-sm text-ink-500">{variant ? `${variant.attr}${variant.finish ? ` · ${variant.finish}` : ""}` || "Standard" : "Standard"}</span>
                        )}
                      </div>
                      <button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-danger/10 hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Numbers — two fixed rows (price, then where the pieces go), every box labelled and one height */}
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:pl-10">
                        <div>
                          <span className={cellLabel}>{inclusive ? "Cost incl. GST" : "Cost excl. GST"}</span>
                          <MoneyInput value={l.unitCost} onChange={(paise) => patch(l.key, { unitCost: paise })} className={num} placeholder="0" />
                        </div>
                        <div>
                          <span className={cellLabel}>GST</span>
                          <select value={l.gst} onChange={(e) => patch(l.key, { gst: Number(e.target.value) })} className={num}>
                            {[...new Set([...GST_RATES, l.gst])].sort((a, b) => a - b).map((r) => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <span className={cellLabel}>Line total</span>
                          <p className="flex h-10 items-center justify-end truncate rounded-lg bg-ink-900/[0.04] px-2.5 text-sm font-bold tabular-nums text-ink-900">{formatINR(qtyOf(l) * l.unitCost)}</p>
                        </div>
                        <div>
                          <span className={cellLabel} title="Total on the vendor's bill (optional) — the branch boxes are compared with it">Bill qty <span className="font-normal normal-case tracking-normal">(opt.)</span></span>
                          <input type="number" min={0} step={1} value={(l.target ?? qtyOf(l)) || ""} onChange={(e) => setTotal(l, toInt(e.target.value))} className={cn(num, l.target !== null && "border-gold-400 bg-gold-50/50")} />
                        </div>
                        {BRANCH_KEYS.map((b) => (
                          <div key={b}>
                            <span className={cn(cellLabel, (l.alloc[b] || 0) > 0 && "text-ink-800")}>{branchLabel(b)}</span>
                            <input type="number" min={0} step={1} value={l.alloc[b] || 0} disabled={!!lockedBranch && lockedBranch !== b} onChange={(e) => setBranchQty(l, b, toInt(e.target.value))} className={cn(num, (l.alloc[b] || 0) > 0 && "border-ink-400 font-semibold")} />
                          </div>
                        ))}
                    </div>

                    {/* Quick split, problems, price update */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 md:pl-10">
                      {!lockedBranch && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400">
                          Quick split:
                          {BRANCH_KEYS.map((b) => (
                            <button key={b} type="button" onClick={() => patch(l.key, { alloc: moveAll(l.target ?? qtyOf(l), b) })} className="rounded-md border border-ink-200 bg-white px-2 py-1 font-semibold text-ink-600 hover:border-gold-500 hover:text-ink-900">All to {branchLabel(b)}</button>
                          ))}
                          <button type="button" onClick={() => patch(l.key, { alloc: splitEvenly(l.target ?? qtyOf(l)) })} className="rounded-md border border-ink-200 bg-white px-2 py-1 font-semibold text-ink-600 hover:border-gold-500 hover:text-ink-900">Split evenly</button>
                        </div>
                      )}
                      {isAdmin && (
                        <label className="ml-auto flex items-center gap-2 text-[11px] text-ink-500">
                          <input type="checkbox" checked={l.updatePrice} onChange={(e) => patch(l.key, { updatePrice: e.target.checked, newPrice: e.target.checked && l.newPrice <= 0 ? sellingPrice(l) : l.newPrice })} className="h-3.5 w-3.5 accent-ink-900" />
                          Update selling price <span className="text-ink-400">(now {formatINR(sellingPrice(l))})</span>
                          {l.updatePrice && <span className="w-28"><MoneyInput value={l.newPrice} onChange={(paise) => patch(l.key, { newPrice: paise })} className={cn(num, "h-8")} placeholder="New price" /></span>}
                        </label>
                      )}
                    </div>
                    {(err || m) && (
                      <div className="mt-2 space-y-1 md:pl-10">
                        {err && splitNote(l, err)}
                        {m && <p className={cn("text-[11px] font-medium", m.bad ? "text-danger" : "text-amber-700")}>{m.text}</p>}
                      </div>
                    )}
                  </div>
                );
              })}

              {lines.length === 0 ? (
                <div className="grid place-items-center rounded-2xl border border-dashed border-ink-200 bg-white/60 px-4 py-12 text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-gold-500/10 text-gold-700"><Package className="h-5 w-5" /></span>
                  <p className="mt-3 text-sm font-semibold text-ink-700">No products yet</p>
                  <p className="mt-0.5 text-xs text-ink-400">Search above to add the first product on this bill.</p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-900 px-4 py-3 text-xs text-ivory-50">
                  <span className="flex flex-wrap gap-x-4 gap-y-1">
                    <span><b className="tabular-nums">{totals.qty}</b> pcs</span>
                    {BRANCH_KEYS.filter((b) => (totals.alloc[b] || 0) > 0).map((b) => <span key={b} className="text-ivory-50/70">{branchLabel(b)} <b className="tabular-nums text-ivory-50">{totals.alloc[b]}</b></span>)}
                  </span>
                  <span className="font-semibold">Lines total <b className="ml-1 text-sm tabular-nums text-gold-300">{formatINR(linesValue)}</b></span>
                </div>
              )}
            </div>
          </Step>

          {/* 3 · GST & payment */}
          <Step n={3} title="GST & payment" hint={inclusive ? "The GST is taken out of each cost you typed, at the line's rate." : "The GST is added on top of each cost, at the line's rate."}>
            <div className="flex flex-wrap gap-2">
              <Toggle on={inclusive} onChange={toggleInclusive}>Prices include GST</Toggle>
              <Toggle on={interState} onChange={setInterState}>Inter-state (IGST)</Toggle>
              {taxEdited && <button onClick={() => setTaxEdited(false)} className="text-xs font-semibold text-gold-700 hover:underline">Reset GST to calculated</button>}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {(["cgst", "sgst", "igst"] as const).map((k) => (
                <div key={k}>
                  <label className={label}>{k.toUpperCase()} (₹)</label>
                  <MoneyInput value={taxNow[k]} onChange={(v) => setTax(k, v)} className={cn(field, "text-right tabular-nums", (k === "igst") !== interState && taxNow[k] === 0 && "text-ink-300")} />
                </div>
              ))}
            </div>
            {taxProblem && <p className="mt-2 text-xs font-semibold text-danger">{taxProblem}</p>}

            <div className="mt-6 grid gap-4 border-t border-ink-100 pt-5 md:grid-cols-[14rem_minmax(0,1fr)]">
              <div>
                <label className={label}>Paid by</label>
                <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={cn(field, modeMissing && "border-danger bg-danger/5")}>
                  {PAY_MODES.map((m) => <option key={m || "none"} value={m}>{m ? (PAY_MODE_NAMES[m] ?? m) : "— Not paid yet —"}</option>)}
                </select>
                <p className={cn("mt-1.5 text-[11px]", modeMissing ? "font-semibold text-danger" : "text-ink-400")}>
                  {modeMissing ? "Choose how this was paid." : "Used for the payment-mode totals in analytics."}
                </p>
              </div>
              <div className="min-w-0">
                <label className={label}>Paid now — each branch pays its own part</label>
                <BranchPayTable rows={payRows} value={paidSplit} onChange={setPayAlloc} valueLabel="Its bill" payLabel="Paid now" />
              </div>
            </div>
          </Step>
        </div>

        {/* Summary */}
        <aside className="2xl:sticky 2xl:top-24">
          <div className="overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50 shadow-[0_1px_2px_rgba(10,9,8,0.03)]">
            <div className="h-1 bg-gradient-to-r from-gold-500 to-gold-300" />
            <div className="grid gap-x-8 p-5 md:grid-cols-2 2xl:block">
              <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-500">Summary</p>
              <p className="mt-1 truncate text-sm font-semibold text-ink-900">{vendor ? vendor.name : <span className="text-ink-400">No vendor chosen</span>}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <Row k="Goods (before GST)" v={formatINR(totals.cost)} />
                <Row k={interState ? "IGST" : "CGST + SGST"} v={formatINR(tax)} />
                <div className="flex items-baseline justify-between border-t border-ink-100 pt-3">
                  <dt className="font-bold text-ink-900">Grand total</dt>
                  <dd className="text-2xl font-bold tabular-nums text-ink-900">{formatINR(grandTotal)}</dd>
                </div>
                <Row k="Paid now" v={formatINR(amountPaid)} tone="text-success" />
                <div className={cn("flex items-baseline justify-between rounded-lg px-3 py-2", balance > 0 ? "bg-danger/[0.06]" : "bg-success/[0.08]")}>
                  <dt className="text-xs font-bold uppercase tracking-wider text-ink-600">Balance</dt>
                  <dd className={cn("text-lg font-bold tabular-nums", balance > 0 ? "text-danger" : "text-success")}>{formatINR(balance)}</dd>
                </div>
              </dl>
              </div>

              <div>
              <label className={cn(label, "mt-5 md:mt-0 2xl:mt-5")}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full resize-none rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20" placeholder="Any remarks…" />

              {isAdmin && (
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-100 bg-white p-3 text-xs text-ink-700">
                  <input type="checkbox" checked={inAnalytics} onChange={(e) => setInAnalytics(e.target.checked)} className="mt-0.5 h-4 w-4 accent-ink-900" />
                  <span><b className="block text-ink-900">Subtract in analytics</b>Payments on this bill are deducted from sales, under their payment mode.</span>
                </label>
              )}

              <button onClick={submit} disabled={!canSubmit} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-ink-800 disabled:opacity-40">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />} {saving ? "Saving…" : "Save purchase"}
              </button>
              <p className="mt-2.5 text-center text-[11px] leading-relaxed text-ink-500">
                {!vendor ? "Choose a vendor to save." : lines.length === 0 ? "Add at least one product." : payOver.length > 0 ? <span className="font-semibold text-danger">{overMessage(payOver)}</span> : modeMissing ? <span className="font-semibold text-danger">Choose how it was paid.</span> : lines.some(lineError) ? <span className="font-semibold text-danger">Fix the highlighted products.</span> : taxProblem ? <span className="font-semibold text-danger">{taxProblem}</span> : "Ready to save."}
              </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const PAY_MODE_NAMES: Record<string, string> = { CASH: "Cash", CARD: "Card", UPI: "UPI", CREDIT: "On credit (not paid)", BANK: "Bank transfer", OTHER: "Other" };

/** A numbered section card of the purchase form. */
function Step({ n, title, hint, right, children }: { n: number; title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 shadow-[0_1px_2px_rgba(10,9,8,0.03)] md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gold-500/15 text-xs font-bold text-gold-800">{n}</span>
          <div>
            <h2 className="text-[15px] font-bold text-ink-900">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A pill-shaped on/off switch with its label. */
function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={cn("inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", on ? "border-ink-900 bg-ink-900 text-ivory-50" : "border-ink-200 bg-white text-ink-600 hover:border-ink-400")}>
      <span className={cn("relative h-4 w-7 rounded-full transition-colors", on ? "bg-gold-500" : "bg-ink-200")}>
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all", on ? "left-3.5" : "left-0.5")} />
      </span>
      {children}
    </button>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{k}</dt>
      <dd className={cn("font-semibold tabular-nums text-ink-900", tone)}>{v}</dd>
    </div>
  );
}
