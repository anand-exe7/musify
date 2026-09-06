"use client";
import { useEffect, useMemo, useState } from "react";
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
import { usePOS, productStock, genInvoiceId, type Bill, type Source, type Branch } from "@/lib/store/pos";
import { formatINR, cn } from "@/lib/utils";

interface Row {
  id: string;
  name: string;
  price: number;
  qty: number;
}

export default function BillingPage() {
  const coupons = usePOS((s) => s.coupons);
  const invProducts = usePOS((s) => s.invProducts);
  const addBill = usePOS((s) => s.addBill);

  const [source, setSource] = useState<Source>("offline");
  const [branch, setBranch] = useState<Branch>("Branch 1");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [rows, setRows] = useState<Row[]>([{ id: crypto.randomUUID(), name: "", price: 0, qty: 1 }]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [discType, setDiscType] = useState<"₹" | "%">("₹");
  const [discVal, setDiscVal] = useState(0);
  const [delivery, setDelivery] = useState(0);
  const [cash, setCash] = useState<number | "">("");
  const [toast, setToast] = useState<string | null>(null);

  const activeRows = rows.filter((r) => r.name.trim() && r.price > 0);
  const subtotal = activeRows.reduce((n, r) => n + r.price * r.qty, 0);
  const itemCount = activeRows.reduce((n, r) => n + r.qty, 0);

  const coupon = coupons.find((c) => c.code === couponCode);
  const couponDiscount = useMemo(() => {
    if (!coupon) return 0;
    if (subtotal < coupon.minOrder) return 0;
    return Math.round((subtotal * coupon.discountPct) / 100);
  }, [coupon, subtotal]);
  const manualDiscount = discType === "%" ? Math.round((subtotal * (Number(discVal) || 0)) / 100) : Number(discVal) || 0;
  const totalDiscount = Math.min(subtotal, couponDiscount + manualDiscount);
  const grand = Math.max(0, subtotal - totalDiscount) + (Number(delivery) || 0);
  const change = cash === "" ? 0 : Number(cash) - grand;
  const couponBelowMin = coupon && subtotal > 0 && subtotal < coupon.minOrder;

  // How many of each catalog product are already on the bill (for badges).
  const qtyInOrder = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) if (r.name.trim()) m[r.name] = (m[r.name] || 0) + r.qty;
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
  const addRow = () => setRows((rs) => [...rs, { id: crypto.randomUUID(), name: "", price: 0, qty: 1 }]);
  const removeRow = (id: string) =>
    setRows((rs) => (rs.length === 1 ? [{ id: crypto.randomUUID(), name: "", price: 0, qty: 1 }] : rs.filter((r) => r.id !== id)));
  const addFromCatalog = (name: string, price: number) => {
    setRows((rs) => {
      const existing = rs.find((r) => r.name === name);
      if (existing) return rs.map((r) => (r.id === existing.id ? { ...r, qty: r.qty + 1 } : r));
      const blank = rs.find((r) => !r.name.trim());
      if (blank) return rs.map((r) => (r.id === blank.id ? { ...r, name, price, qty: 1 } : r));
      return [...rs, { id: crypto.randomUUID(), name, price, qty: 1 }];
    });
  };

  const clearOrder = () => {
    setRows([{ id: crypto.randomUUID(), name: "", price: 0, qty: 1 }]);
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
    return {
      id: genInvoiceId(),
      createdAt: new Date().toISOString(),
      customerName: customerName.trim() || "Walk-in",
      phone: phone.trim(),
      source,
      branch,
      items: activeRows.map((r) => ({ name: r.name.trim(), price: r.price, qty: r.qty })),
      subtotal,
      coupon: coupon?.code,
      discount: totalDiscount,
      delivery: Number(delivery) || 0,
      total: grand,
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
    const lines = bill.items.map((i) => `• ${i.name} × ${i.qty} — ${formatINR(i.price * i.qty)}`).join("%0A");
    const msg =
      `*Sri Saraswathy Musicals*%0AInvoice ${bill.id}%0A%0A${lines}%0A%0ASubtotal: ${formatINR(bill.subtotal)}` +
      `%0ADiscount: -${formatINR(bill.discount)}%0ADelivery: ${formatINR(bill.delivery)}%0A*Grand Total: ${formatINR(bill.total)}*%0A%0AThank you!`;
    const num = phone.replace(/\D/g, "");
    window.open(`https://wa.me/91${num}?text=${msg}`, "_blank", "noopener,noreferrer");
    setToast(`Bill saved · WhatsApp opened for ${phone}`);
    setTimeout(() => setToast(null), 3000);
    clearOrder();
    setCustomerName("");
    setPhone("");
  };

  const catalogItems = invProducts
    .filter((p) => p.active)
    .filter((p) => p.name.toLowerCase().includes(catalogQuery.toLowerCase()));

  const fieldCls =
    "w-full rounded-xl border border-ink-200 bg-ivory-50 px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";

  return (
    <div className="p-5 md:p-8">
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

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* ── LEFT ── */}
        <div className="space-y-6">
          {/* Customer */}
          <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-gold-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-900">Customer Details</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Customer Name</label>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Enter name" className={fieldCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Mobile Number (WhatsApp)</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter 10-digit number" inputMode="numeric" className={fieldCls} />
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

            {/* Rows — stack on mobile, single line on desktop */}
            <div className="space-y-3">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 rounded-xl border border-ink-100 p-2.5 sm:flex-row sm:items-center sm:border-0 sm:p-0"
                >
                  <input
                    value={r.name}
                    onChange={(e) => setRow(r.id, { name: e.target.value })}
                    placeholder="Item name / description…"
                    className={cn(fieldCls, "w-full sm:min-w-0 sm:flex-1")}
                  />
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <div className="relative flex-1 sm:w-28 sm:flex-none">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">₹</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={r.price || ""}
                        onChange={(e) => setRow(r.id, { price: Number(e.target.value) })}
                        placeholder="Price"
                        className={cn(fieldCls, "pl-7")}
                      />
                    </div>
                    <div className="flex shrink-0 items-center gap-1 rounded-xl border border-ink-200 bg-ivory-50 px-1">
                      <button onClick={() => setRow(r.id, { qty: Math.max(1, r.qty - 1) })} aria-label="Decrease quantity" className="grid h-9 w-8 place-items-center text-ink-500 hover:text-ink-900">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">{r.qty}</span>
                      <button onClick={() => setRow(r.id, { qty: r.qty + 1 })} aria-label="Increase quantity" className="grid h-9 w-8 place-items-center text-ink-500 hover:text-ink-900">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button onClick={() => removeRow(r.id)} aria-label="Remove item" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
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
                <dt className="font-semibold uppercase tracking-[0.18em] text-ink-500">Branch</dt>
                <dd>
                  <select value={branch} onChange={(e) => setBranch(e.target.value as Branch)} className="rounded-md border border-ink-200 bg-ivory-50 px-2 py-1 text-xs font-medium focus:outline-none">
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
            </dl>

            {activeRows.length === 0 ? (
              <p className="py-5 text-center text-sm text-ink-400">No items added yet</p>
            ) : (
              <ul className="max-h-40 space-y-2 overflow-y-auto py-4 text-sm">
                {activeRows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-ink-700">{r.name} <span className="text-ink-400">× {r.qty}</span></span>
                    <span className="shrink-0 font-medium tabular-nums text-ink-900">{formatINR(r.price * r.qty)}</span>
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
              {couponBelowMin && <p className="mt-1 text-[11px] text-danger">Min order {formatINR(coupon!.minOrder)} for {coupon!.code}</p>}
            </div>

            {/* manual discount */}
            <div className="mt-4">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Manual Discount</label>
              <div className="flex gap-2">
                <select value={discType} onChange={(e) => setDiscType(e.target.value as "₹" | "%")} className="w-16 rounded-xl border border-ink-200 bg-ivory-50 px-2 py-2.5 text-sm focus:outline-none">
                  <option value="₹">₹</option>
                  <option value="%">%</option>
                </select>
                <input type="number" value={discVal || ""} onChange={(e) => setDiscVal(Number(e.target.value))} placeholder="0" className={cn(fieldCls, "py-2.5")} />
              </div>
            </div>

            {/* totals */}
            <div className="mt-5 space-y-2 border-t border-ink-100 pt-4 text-sm">
              <div className="flex items-center justify-between text-ink-600">
                <span>Subtotal ({itemCount} items)</span>
                <span className="font-medium tabular-nums text-ink-900">{formatINR(subtotal)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex items-center justify-between text-success">
                  <span>Discount</span>
                  <span className="font-medium tabular-nums">- {formatINR(totalDiscount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-ink-600">
                <span>Delivery</span>
                <input type="number" value={delivery || ""} onChange={(e) => setDelivery(Number(e.target.value))} placeholder="0" className="w-24 rounded-lg border border-ink-200 bg-ivory-50 px-2 py-1 text-right text-sm focus:border-gold-500 focus:outline-none" />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4">
              <span className="text-sm font-bold uppercase tracking-wider text-ink-900">Grand Total</span>
              <span className="text-2xl font-bold tabular-nums text-ink-900">{formatINR(grand)}</span>
            </div>

            {/* cash */}
            {source === "offline" && (
              <div className="mt-4 rounded-xl border border-ink-100 bg-[#FAF7EF] p-3">
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Cash Payment</label>
                <input type="number" value={cash} onChange={(e) => setCash(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Amount received (₹)" className={cn(fieldCls, "py-2.5")} />
                {cash !== "" && grand > 0 && (
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
                  const inOrder = qtyInOrder[p.name] || 0;
                  const stock = productStock(p);
                  const out = stock <= 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => addFromCatalog(p.name, p.basePrice)}
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
                        <p className="text-xs font-medium tabular-nums text-ink-700">{formatINR(p.basePrice)}</p>
                        <p className={cn("text-[11px]", out ? "text-danger" : "text-ink-400")}>
                          {out ? "Out of stock" : `${stock} in stock`}
                        </p>
                      </div>
                      {!out && (
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink-900 text-ivory-50 transition-colors group-hover:bg-gold-500 group-hover:text-ink-900">
                          <Plus className="h-4 w-4" />
                        </span>
                      )}
                    </button>
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
