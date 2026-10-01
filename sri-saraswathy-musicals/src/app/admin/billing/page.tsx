"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  User as UserIcon,
  ShoppingBag,
  List,
  Plus,
  Minus,
  Trash2,
  MessageCircle,
  Search,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LoadErrorBanner } from "@/components/admin/LoadState";
import { usePOS, productStockAt, variantStockAt, genInvoiceId, billTax, type Bill, type BillItem, type Source, type Branch } from "@/lib/store/pos";
import { useBranchScope, effectiveBranch } from "@/lib/store/branch";
import { BUSINESS, waLink } from "@/lib/data/business";
import { formatINR, toPaise, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { clampPct, evaluateCoupon } from "@/lib/checkout/coupon";

interface Row {
  id: string;
  name: string;
  price: number;
  qty: number;
  /** Snapshot GST rate for this line; `null` ⇒ non-GST line. */
  gstRate?: number | null;
  hsn?: string;
  /** Catalog MRP per unit (paise). */
  mrp?: number;
  /** Delivery instruction (e.g. serial number) printed on the invoice. */
  instruction?: string;
  /** Per-line discount in paise (off price × qty). */
  discount?: number;
  /** Set when picked from the catalog — lets the server decrement branch stock. */
  productId?: string;
  variantIndex?: number;
}

/** GST rates selectable per line at the counter (`null` = non-GST). */
const LINE_GST_RATES: { label: string; value: number | null }[] = [
  { label: "No GST", value: null },
  { label: "0%", value: 0 },
  { label: "5%", value: 5 },
  { label: "12%", value: 12 },
  { label: "18%", value: 18 },
  { label: "28%", value: 28 },
];

export default function BillingPage() {
  const coupons = usePOS((s) => s.coupons);
  const loadError = usePOS((s) => s.loadError);
  const invProducts = usePOS((s) => s.invProducts);
  const addBill = usePOS((s) => s.addBill);

  const canSwitchBranch = useBranchScope((s) => s.canSwitch);
  const scopeAccess = useBranchScope((s) => s.access);
  const scopeSelected = useBranchScope((s) => s.selected);
  // Branch users are pinned to their own branch; admins act as the topbar pick.
  const lockedBranch: Branch | null =
    !canSwitchBranch && (scopeAccess === "Branch 1" || scopeAccess === "Branch 2") ? scopeAccess : null;

  const [source, setSource] = useState<Source>("offline");
  const [branch, setBranch] = useState<Branch>(lockedBranch ?? effectiveBranch(scopeSelected));

  // Follow the branch scope: locked to the user's branch, else the topbar pick.
  useEffect(() => {
    setBranch(lockedBranch ?? effectiveBranch(scopeSelected));
  }, [lockedBranch, scopeSelected]);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");
  const [rows, setRows] = useState<Row[]>([{ id: crypto.randomUUID(), name: "", price: 0, qty: 1, gstRate: 18 }]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  // Product whose variant list is expanded in the catalog (multi-variant products only).
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [discType, setDiscType] = useState<"₹" | "%">("₹");
  const [discVal, setDiscVal] = useState(0);
  const [delivery, setDelivery] = useState(0);
  const [cash, setCash] = useState<number | "">("");
  const [toast, setToast] = useState<string | null>(null);

  const activeRows = rows.filter((r) => r.name.trim() && r.price > 0);
  const lineDiscount = (r: Row) => Math.min(r.price * r.qty, r.discount || 0);
  const subtotal = activeRows.reduce((n, r) => n + r.price * r.qty, 0);
  const itemDiscounts = activeRows.reduce((n, r) => n + lineDiscount(r), 0);
  const netSubtotal = subtotal - itemDiscounts;
  const itemCount = activeRows.reduce((n, r) => n + r.qty, 0);

  // GST-inclusive tax contained in the taxed lines (recomputed as rows change).
  const billItems: BillItem[] = activeRows.map((r) => ({
    name: r.name.trim(),
    price: r.price,
    qty: r.qty,
    gstRate: r.gstRate ?? null,
    hsn: r.hsn?.trim() || undefined,
    mrp: r.mrp && r.mrp > 0 ? r.mrp : undefined,
    instruction: r.instruction?.trim() || undefined,
    discount: lineDiscount(r) || undefined,
    productId: r.productId,
    variantIndex: r.variantIndex,
  }));

  const coupon = coupons.find((c) => c.code === couponCode);
  // Same rules the server enforces on save: expiry, redemptions left, minimum.
  const couponCheck = useMemo(
    () => (coupon && netSubtotal > 0 ? evaluateCoupon(coupon, netSubtotal) : null),
    [coupon, netSubtotal],
  );
  const couponDiscount = couponCheck?.ok ? couponCheck.discount : 0;
  // `discVal` is entered as a plain number: a percentage when `%`, otherwise a
  // rupee amount that we convert to paise. `subtotal` is already in paise.
  const manualDiscount = discType === "%" ? Math.round((netSubtotal * clampPct(Number(discVal) || 0)) / 100) : toPaise(discVal);
  // Coupon + manual discount come off the taxable base too (never below zero),
  // so the GST recorded is the GST actually contained in what is charged.
  const billDiscount = Math.min(netSubtotal, couponDiscount + manualDiscount);
  const tax = billTax(billItems, true, billDiscount);
  const totalDiscount = itemDiscounts + billDiscount;
  const grand = Math.max(0, subtotal - totalDiscount) + (Number(delivery) || 0);
  const change = cash === "" ? 0 : Number(cash) - grand;
  const couponProblem = couponCheck && !couponCheck.ok ? couponCheck.reason : null;

  // How many of each catalog product are already on the bill (for badges).
  const qtyInOrder = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) if (r.name.trim()) m[r.productId ?? r.name] = (m[r.productId ?? r.name] || 0) + r.qty;
    return m;
  }, [rows]);

  // Close the catalog modal on Escape; lock body scroll while it is open.
  useEffect(() => {
    if (!catalogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCatalogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [catalogOpen]);

  /* ── row helpers ── */
  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { id: crypto.randomUUID(), name: "", price: 0, qty: 1, gstRate: 18 }]);
  const removeRow = (id: string) =>
    setRows((rs) => (rs.length === 1 ? [{ id: crypto.randomUUID(), name: "", price: 0, qty: 1, gstRate: 18 }] : rs.filter((r) => r.id !== id)));
  const addFromCatalog = (
    name: string,
    price: number,
    gstRate?: number | null,
    hsn?: string,
    productId?: string,
    variantIndex?: number,
    mrp?: number,
  ) => {
    setRows((rs) => {
      const existing = rs.find((r) => r.name === name && r.variantIndex === variantIndex);
      if (existing) return rs.map((r) => (r.id === existing.id ? { ...r, qty: r.qty + 1 } : r));
      const filled = { name, price, qty: 1, gstRate: gstRate ?? null, hsn, productId, variantIndex, mrp: Math.max(mrp || 0, price) };
      const blank = rs.find((r) => !r.name.trim());
      if (blank) return rs.map((r) => (r.id === blank.id ? { ...r, ...filled } : r));
      return [...rs, { id: crypto.randomUUID(), ...filled }];
    });
  };

  const clearOrder = () => {
    setRows([{ id: crypto.randomUUID(), name: "", price: 0, qty: 1, gstRate: 18 }]);
    setCouponCode("");
    setDiscVal(0);
    setDelivery(0);
    setCash("");
  };

  const buildBill = (): Bill | null => {
    if (activeRows.length === 0) {
      setToast("Add at least one item first.");
      setTimeout(() => setToast(null), 2500);
      return null;
    }
    const gstin = customerGstin.trim();
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)) {
      setToast("GST number must be a valid 15-character GSTIN, or leave it blank.");
      setTimeout(() => setToast(null), 3000);
      return null;
    }
    return {
      id: genInvoiceId(),
      createdAt: new Date().toISOString(),
      customerName: customerName.trim() || "Walk-in",
      phone: phone.trim(),
      customerGstin: customerGstin.trim(),
      source,
      branch,
      items: billItems,
      subtotal,
      coupon: coupon?.code,
      discount: totalDiscount,
      delivery: Number(delivery) || 0,
      total: grand,
      gstEnabled: true,
      taxable: tax.taxable,
      cgst: tax.cgst,
      sgst: tax.sgst,
      gst: tax.gst,
      status: "completed",
      payment: source === "online" ? "Razorpay" : "Cash",
    };
  };

  const saveOnly = () => {
    const bill = buildBill();
    if (!bill) return;
    addBill(bill);
    setToast(`Saved ${bill.id} · ${formatINR(bill.total)}`);
    setTimeout(() => setToast(null), 3000);
    clearOrder();
    setCustomerName("");
    setPhone("");
    setCustomerGstin("");
  };

  const sendWhatsApp = () => {
    const bill = buildBill();
    if (!bill) return;
    if (!phone.trim()) {
      setToast("Enter a mobile number to send via WhatsApp.");
      setTimeout(() => setToast(null), 2500);
      return;
    }
    addBill(bill);
    // Public, shareable invoice the customer can open from the WhatsApp link
    // (resolves via /invoice/[id] → getBill, no admin sign-in needed).
    const link = `${window.location.origin}/invoice/${bill.id}`;
    const lines = bill.items.map((i) => `• ${i.name} × ${i.qty} — ${formatINR(i.price * i.qty - (i.discount || 0))}${i.discount ? ` (after -${formatINR(i.discount)} disc.)` : ""}`).join("\n");
    const gstLines =
      bill.gstEnabled && (bill.gst ?? 0) > 0
        ? `Taxable: ${formatINR(bill.taxable ?? 0)}\n` +
          `CGST: ${formatINR(bill.cgst ?? 0)}\n` +
          `SGST: ${formatINR(bill.sgst ?? 0)}\n` +
          `(GST incl. ${formatINR(bill.gst ?? 0)})\n`
        : "";
    const msg =
      `*${BUSINESS.name}*\nInvoice ${bill.id}\n\n${lines}\n\n` +
      `Subtotal: ${formatINR(bill.subtotal)}\n` +
      `Discount: -${formatINR(bill.discount)}\n` +
      `Delivery: ${formatINR(bill.delivery)}\n` +
      gstLines +
      `*Grand Total: ${formatINR(bill.total)}*\n\n` +
      `📄 View your invoice:\n${link}\n\nThank you!`;
    window.open(waLink(phone, msg), "_blank", "noopener,noreferrer");
    setToast(`Bill saved · WhatsApp opened for ${phone}`);
    setTimeout(() => setToast(null), 3000);
    clearOrder();
    setCustomerName("");
    setPhone("");
    setCustomerGstin("");
  };

  const catalogItems = invProducts
    .filter((p) => p.active)
    .filter((p) => p.name.toLowerCase().includes(catalogQuery.toLowerCase()));

  // Compact input used inside the order-items table cells.
  const cell =
    "w-full rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-right text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500/30";

  const fieldCls =
    "w-full rounded-xl border border-ink-200 bg-ivory-50 px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";

  return (
    <div className="p-5 md:p-8">
      <LoadErrorBanner message={loadError} onRetry={() => void usePOS.getState().hydrate()} />
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="border-l-4 border-ink-900 pl-4">
          <h1 className="text-2xl font-bold text-ink-900">POS Billing Panel</h1>
          <p className="mt-1 text-sm text-ink-500">Quick invoice generator · synced to Orders &amp; Analytics</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sale source */}
          <div className="flex items-center gap-2 rounded-full bg-ivory-50 p-1 shadow-sm ring-1 ring-ink-100">
            {(["offline", "online"] as Source[]).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all",
                  source === s ? "bg-ink-900 text-ivory-50" : "text-ink-500 hover:text-ink-900",
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", s === "offline" ? "bg-gold-400" : "bg-success")} />
                {s === "offline" ? "Offline (POS)" : "Online Order"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* ── LEFT ── */}
        <div className="space-y-6">
          {/* Customer */}
          <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-gold-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-900">Customer Details</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Customer Name</label>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Enter name" className={fieldCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Mobile Number (WhatsApp)</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter 10-digit number" inputMode="numeric" className={fieldCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">GST Number (optional)</label>
                <input value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())} maxLength={15} placeholder="33XXXXX0000X1ZV" className={fieldCls + " font-mono tracking-wide"} />
              </div>
            </div>
          </section>

          {/* Order items */}
          <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-gold-600" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-ink-900">Order Items</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={clearOrder} className="rounded-lg px-3 py-2 text-xs font-semibold text-ink-500 hover:bg-ink-900/5 hover:text-ink-900">
                  Clear Order
                </button>
                <button
                  onClick={() => setCatalogOpen((o) => !o)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all",
                    catalogOpen ? "bg-ink-900 text-ivory-50" : "bg-ink-900 text-ivory-50 hover:bg-ink-800",
                  )}
                >
                  <List className="h-3.5 w-3.5" /> Catalog
                </button>
                <button onClick={addRow} className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>
              </div>
            </div>

            {/* Rows — a table: one line per item, scrolls sideways on small screens */}
            <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white">
              <table className="w-full min-w-[1040px] text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-[#FAF7EF] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500 [&>th]:px-2 [&>th]:py-2.5">
                    <th className="w-8 pl-3">#</th>
                    <th className="min-w-[200px]">Item</th>
                    <th className="w-24">HSN</th>
                    <th className="w-20">GST</th>
                    <th className="w-28">MRP (₹)</th>
                    <th className="w-28">Price (₹)</th>
                    <th className="w-28 text-center">Qty</th>
                    <th className="w-28">Discount (₹)</th>
                    <th className="min-w-[170px]">Delivery instruction</th>
                    <th className="w-28 text-right">Amount</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {rows.map((r, i) => (
                    <tr key={r.id} className="align-middle [&>td]:px-2 [&>td]:py-2">
                      <td className="pl-3 text-xs text-ink-400">{i + 1}</td>
                      <td>
                        <input
                          value={r.name}
                          onChange={(e) => setRow(r.id, { name: e.target.value })}
                          placeholder="Item name / description…"
                          aria-label="Item name"
                          className={cn(cell, "text-left")}
                        />
                      </td>
                      <td>
                        <input
                          value={r.hsn ?? ""}
                          onChange={(e) => setRow(r.id, { hsn: e.target.value })}
                          placeholder="HSN"
                          aria-label="HSN code"
                          inputMode="numeric"
                          className={cn(cell, "text-left")}
                        />
                      </td>
                      <td>
                        <select
                          value={r.gstRate == null ? "none" : String(r.gstRate)}
                          onChange={(e) => setRow(r.id, { gstRate: e.target.value === "none" ? null : Number(e.target.value) })}
                          title="GST rate for this line (inclusive)"
                          aria-label="GST rate"
                          className={cn(cell, "text-left")}
                        >
                          {LINE_GST_RATES.map((g) => (
                            <option key={g.label} value={g.value == null ? "none" : String(g.value)}>
                              {g.value == null ? "No GST" : `${g.value}%`}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <MoneyInput
                          value={r.mrp || 0}
                          onChange={(paise) => setRow(r.id, { mrp: paise })}
                          placeholder={r.price > 0 ? String(r.price / 100) : "MRP"}
                          aria-label="MRP per unit"
                          title="MRP per unit — defaults to the catalog MRP; blank = same as price"
                          className={cell}
                        />
                      </td>
                      <td>
                        <MoneyInput value={r.price || 0} onChange={(paise) => setRow(r.id, { price: paise })} placeholder="Price" aria-label="Price per unit" className={cell} />
                      </td>
                      <td>
                        <div className="mx-auto flex w-24 items-center justify-between rounded-lg border border-ink-200 bg-ivory-50 px-0.5">
                          <button onClick={() => setRow(r.id, { qty: Math.max(1, r.qty - 1) })} aria-label="Decrease quantity" className="grid h-8 w-7 place-items-center text-ink-500 hover:text-ink-900">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-sm font-semibold tabular-nums">{r.qty}</span>
                          <button onClick={() => setRow(r.id, { qty: r.qty + 1 })} aria-label="Increase quantity" className="grid h-8 w-7 place-items-center text-ink-500 hover:text-ink-900">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td>
                        <MoneyInput
                          value={lineDiscount(r)}
                          onChange={(paise) => setRow(r.id, { discount: Math.min(paise, r.price * r.qty) })}
                          title={r.price > 0 ? `Max ${formatINR(r.price * r.qty)} (the line total)` : undefined}
                          placeholder="0"
                          aria-label="Item discount"
                          className={cell}
                        />
                      </td>
                      <td>
                        <input
                          value={r.instruction ?? ""}
                          onChange={(e) => setRow(r.id, { instruction: e.target.value })}
                          placeholder="e.g. serial no."
                          aria-label="Delivery instruction"
                          maxLength={120}
                          className={cn(cell, "text-left")}
                        />
                      </td>
                      <td className="text-right font-semibold tabular-nums text-ink-900">{formatINR(Math.max(0, r.price * r.qty - lineDiscount(r)))}</td>
                      <td>
                        <button onClick={() => removeRow(r.id)} aria-label="Remove item" className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* ── RIGHT: summary ── */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
            {/* meta */}
            <dl className="space-y-2 border-b border-dashed border-ink-200 pb-4 text-xs">
              <div className="flex items-center justify-between">
                <dt className="font-semibold uppercase tracking-[0.18em] text-ink-500">Source</dt>
                <dd className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", source === "offline" ? "bg-gold-100 text-gold-700" : "bg-success/15 text-success")}>{source}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-semibold uppercase tracking-[0.18em] text-ink-500">Type</dt>
                <dd className="rounded bg-info/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-info">GST Invoice</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-semibold uppercase tracking-[0.18em] text-ink-500">Branch</dt>
                <dd>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value as Branch)}
                    disabled={!!lockedBranch}
                    title={lockedBranch ? "Locked to your branch" : undefined}
                    className="rounded-md border border-ink-200 bg-ivory-50 px-2 py-1 text-xs font-medium focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <option>Branch 1</option>
                    <option>Branch 2</option>
                  </select>
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-semibold uppercase tracking-[0.18em] text-ink-500">Customer</dt>
                <dd className="font-medium text-ink-900">{customerName || "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-semibold uppercase tracking-[0.18em] text-ink-500">Phone</dt>
                <dd className="font-medium text-ink-900">{phone || "—"}</dd>
              </div>
              {customerGstin.trim() && (
                <div className="flex items-center justify-between">
                  <dt className="font-semibold uppercase tracking-[0.18em] text-ink-500">GSTIN</dt>
                  <dd className="font-mono font-medium text-ink-900">{customerGstin}</dd>
                </div>
              )}
            </dl>

            {activeRows.length === 0 ? (
              <p className="py-5 text-center text-sm text-ink-400">No items added yet</p>
            ) : (
              <ul className="max-h-40 space-y-2 overflow-y-auto py-4 text-sm">
                {activeRows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-ink-700">{r.name} <span className="text-ink-400">× {r.qty}</span></span>
                    <span className="shrink-0 font-medium tabular-nums text-ink-900">{formatINR(r.price * r.qty - lineDiscount(r))}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* coupon */}
            <div className="mt-2">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Apply Coupon</label>
              <select value={couponCode} onChange={(e) => setCouponCode(e.target.value)} className={cn(fieldCls, "py-2.5")}>
                <option value="">No Coupon</option>
                {coupons.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.discountPct}% off</option>
                ))}
              </select>
              {couponProblem && <p className="mt-1 text-[11px] text-danger">{couponProblem}</p>}
            </div>

            {/* manual discount */}
            <div className="mt-4">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Overall Discount (on total)</label>
              <div className="flex gap-2">
                <select value={discType} onChange={(e) => setDiscType(e.target.value as "₹" | "%")} className="w-16 rounded-xl border border-ink-200 bg-ivory-50 px-2 py-2.5 text-sm focus:outline-none">
                  <option value="₹">₹</option>
                  <option value="%">%</option>
                </select>
                <input
                  type="number"
                  min={0}
                  max={discType === "%" ? 100 : Math.max(0, (netSubtotal - couponDiscount) / 100)}
                  value={discVal || ""}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    // Can't discount more than the bill is worth (or more than 100%).
                    setDiscVal(discType === "%" ? Math.min(100, v) : Math.min(v, Math.max(0, (netSubtotal - couponDiscount) / 100)));
                  }}
                  placeholder="0"
                  className={cn(fieldCls, "py-2.5")}
                />
              </div>
            </div>

            {/* totals */}
            <div className="mt-5 space-y-2 border-t border-ink-100 pt-4 text-sm">
              <div className="flex items-center justify-between text-ink-600">
                <span>Subtotal ({itemCount} items)</span>
                <span className="font-medium tabular-nums text-ink-900">{formatINR(subtotal)}</span>
              </div>
              {itemDiscounts > 0 && (
                <div className="flex items-center justify-between text-success">
                  <span>Item discounts</span>
                  <span className="font-medium tabular-nums">- {formatINR(itemDiscounts)}</span>
                </div>
              )}
              {billDiscount > 0 && (
                <div className="flex items-center justify-between text-success">
                  <span>Overall discount{couponDiscount > 0 && manualDiscount > 0 ? " (coupon + manual)" : couponDiscount > 0 ? " (coupon)" : ""}</span>
                  <span className="font-medium tabular-nums">- {formatINR(billDiscount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-ink-600">
                <span>Delivery</span>
                <MoneyInput value={delivery || 0} onChange={(paise) => setDelivery(paise)} placeholder="0" className="w-24 rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1 text-right text-sm focus:border-gold-500 focus:outline-none" />
              </div>

              {tax.gst > 0 && (
                <div className="mt-1 space-y-1.5 rounded-lg bg-info/5 px-3 py-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold uppercase tracking-wider text-info">GST (incl. in total)</span>
                    <span className="tabular-nums font-medium text-ink-900">{formatINR(tax.gst)}</span>
                  </div>
                  <div className="flex items-center justify-between text-ink-500"><span>Taxable value</span><span className="tabular-nums">{formatINR(tax.taxable)}</span></div>
                  <div className="flex items-center justify-between text-ink-500"><span>CGST</span><span className="tabular-nums">{formatINR(tax.cgst)}</span></div>
                  <div className="flex items-center justify-between text-ink-500"><span>SGST</span><span className="tabular-nums">{formatINR(tax.sgst)}</span></div>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4">
              <span className="text-sm font-bold uppercase tracking-wider text-ink-900">Grand Total</span>
              <span className="text-2xl font-bold tabular-nums text-ink-900">{formatINR(grand)}</span>
            </div>

            {/* cash */}
            {source === "offline" && (
              <div className="mt-4 rounded-xl border border-ink-100 bg-[#FAF7EF] p-3">
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Cash Payment</label>
                <MoneyInput value={cash === "" ? 0 : cash} onChange={(paise) => setCash(paise)} placeholder="Amount received (₹)" className={cn(fieldCls, "py-2.5")} />
                {cash !== "" && cash > 0 && grand > 0 && (
                  <p className={cn("mt-2 text-xs font-medium", change >= 0 ? "text-success" : "text-danger")}>
                    {change >= 0 ? `Change to return: ${formatINR(change)}` : `Short by ${formatINR(-change)}`}
                  </p>
                )}
              </div>
            )}

            {/* actions */}
            <button onClick={sendWhatsApp} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#128C4B] py-3.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#0f7a41]">
              <MessageCircle className="h-4 w-4" /> Send Bill via WhatsApp
            </button>
            <button onClick={saveOnly} className="mt-2 w-full rounded-xl border border-ink-200 py-3.5 text-xs font-bold uppercase tracking-wider text-ink-700 transition-colors hover:border-gold-500 hover:text-gold-600">
              Save Bill Only
            </button>
          </div>
        </aside>
      </div>

      {/* ── Catalog modal ── */}
      <AnimatePresence>
        {catalogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCatalogOpen(false)}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-950/50 backdrop-blur-sm sm:items-center sm:p-6"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 60, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 60, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
              className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl bg-ivory-50 shadow-2xl sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Product catalog"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <List className="h-4 w-4 text-gold-600" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-ink-900">Product Catalog</h3>
                  {itemCount > 0 && (
                    <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-semibold text-gold-700">
                      {itemCount} in order
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setCatalogOpen(false)}
                  aria-label="Close catalog"
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-ink-900/5 hover:text-ink-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Search */}
              <div className="border-b border-ink-100 p-4">
                <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2.5 focus-within:border-gold-500 focus-within:ring-2 focus-within:ring-gold-500/20">
                  <Search className="h-4 w-4 shrink-0 text-ink-400" />
                  <input
                    autoFocus
                    value={catalogQuery}
                    onChange={(e) => setCatalogQuery(e.target.value)}
                    placeholder="Search products…"
                    className="w-full bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
                  />
                  {catalogQuery && (
                    <button onClick={() => setCatalogQuery("")} aria-label="Clear search" className="shrink-0 text-ink-400 hover:text-ink-900">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Products grid */}
              <div className="grid flex-1 content-start gap-2.5 overflow-y-auto p-4 sm:grid-cols-2">
                {catalogItems.map((p) => {
                  const inOrder = qtyInOrder[p.id] || 0;
                  const enabled = p.variants.map((v, vi) => ({ v, vi })).filter((x) => !x.v.disabled);
                  const multi = enabled.length > 1;
                  const stock = productStockAt(p, branch);
                  const out = stock <= 0;
                  return (
                    <Fragment key={p.id}>
                    <button
                      onClick={() => (multi ? setPickFor(pickFor === p.id ? null : p.id) : addFromCatalog(p.name, p.basePrice, p.gstRate ?? null, p.hsn, p.id, enabled[0]?.vi ?? 0, p.mrp))}
                      disabled={out}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all",
                        inOrder > 0
                          ? "border-gold-400 bg-gold-50/60"
                          : "border-ink-100 bg-white hover:border-gold-400 hover:shadow-sm",
                        out && "cursor-not-allowed opacity-50 hover:border-ink-100 hover:shadow-none",
                      )}
                    >
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                        {p.photo && <img src={p.photo} alt="" className="h-full w-full object-cover" />}
                        {inOrder > 0 && (
                          <span className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-ink-900 shadow">
                            {inOrder}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">{p.name}</p>
                        <p className="text-xs font-medium tabular-nums text-ink-700">{formatINR(p.basePrice)}{multi && <span className="ml-1 text-ink-400">· {enabled.length} variants</span>}</p>
                        <p className={cn("text-[11px]", out ? "text-danger" : "text-ink-400")}>
                          {out ? "Out of stock" : `${stock} in stock · ${branch}`}
                        </p>
                      </div>
                      {!out && (
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink-900 text-ivory-50 transition-colors group-hover:bg-gold-500 group-hover:text-ink-900">
                          <Plus className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                    {multi && pickFor === p.id && (
                      <div className="col-span-full space-y-1.5 rounded-xl border border-gold-300 bg-gold-50/40 p-2.5">
                        <p className="px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">Choose a variant of {p.name} · {branch}</p>
                        {enabled.map(({ v, vi }) => {
                          const vStock = variantStockAt(v, branch);
                          const vName = `${p.name} — ${v.attr}${v.finish ? ` · ${v.finish}` : ""}`;
                          const vPrice = v.price > 0 ? v.price : p.basePrice;
                          return (
                            <button
                              key={vi}
                              disabled={vStock <= 0}
                              onClick={() => { addFromCatalog(vName, vPrice, p.gstRate ?? null, p.hsn, p.id, vi, p.mrp); setPickFor(null); }}
                              className="flex w-full items-center justify-between gap-3 rounded-lg border border-ink-100 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <span className="font-medium text-ink-900">{v.attr}{v.finish ? ` · ${v.finish}` : ""}</span>
                              <span className="flex items-center gap-3 text-xs tabular-nums">
                                <span className="text-ink-700">{formatINR(vPrice)}</span>
                                <span className={vStock <= 0 ? "text-danger" : "text-ink-400"}>{vStock <= 0 ? "Out of stock" : `${vStock} in stock`}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    </Fragment>
                  );
                })}
                {catalogItems.length === 0 && (
                  <p className="col-span-full py-12 text-center text-sm text-ink-400">No products found.</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 border-t border-ink-100 bg-[#FAF7EF] px-5 py-3.5">
                <span className="text-xs text-ink-500">
                  {activeRows.length} line{activeRows.length === 1 ? "" : "s"} · <span className="font-semibold text-ink-900">{formatINR(subtotal)}</span>
                </span>
                <button
                  onClick={() => setCatalogOpen(false)}
                  className="rounded-xl bg-ink-900 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ivory-50 transition-colors hover:bg-ink-800"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
