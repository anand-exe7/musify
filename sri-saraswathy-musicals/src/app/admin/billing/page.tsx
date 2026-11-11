"use client";
import { PaymentBox } from "@/components/ui/PaymentBox";
import { freshPayBox, resolvePayBox, paymentLabel, type PayBox, type PaymentLine } from "@/lib/paymentSplit";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  User as UserIcon,
  ShoppingBag,
  List,
  Plus,
  Minus,
  Trash2,
  Search,
  X,
  Eye,
  Loader2,
  Receipt,
  CheckCircle2,
} from "lucide-react";
import { isValidGstin } from "@/lib/gst/gstin";
import { gstSummary, taxLabel } from "@/lib/print/doc";
import { BillOutputPanel } from "@/components/print/BillOutputPanel";
import type { Invoice } from "@/types";
import { useCategories } from "@/lib/client/catalog";
import { motion, AnimatePresence } from "framer-motion";
import { LoadErrorBanner } from "@/components/admin/LoadState";
import { usePOS, useInventory, productStockAt, variantStockAt, genInvoiceId, billTax, type Bill, type BillItem, type Source, type Branch } from "@/lib/store/pos";
import { useBranchScope, effectiveBranch } from "@/lib/store/branch";
import { BUSINESS } from "@/lib/data/business";
import { formatINR, toPaise, cn } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { clampPct, evaluateCoupon } from "@/lib/checkout/coupon";
import { BRANCH_KEYS, isBranch, branchLabel } from "@/lib/stock";
import { BranchOptions } from "@/components/admin/BranchOptions";
import { useAuth } from "@/lib/store/auth";
import { normalizePhone } from "@/lib/customers/phone";
import { E, waUrl } from "@/lib/whatsapp";

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
  // Branch staff sell catalogue products at catalogue prices; only a full admin can type items or prices.
  const fullAdmin = useAuth((s) => s.adminAccess === "all");
  const coupons = usePOS((s) => s.coupons);
  const loadError = usePOS((s) => s.loadError);
  const invProducts = useInventory();
  const addBill = usePOS((s) => s.addBill);

  const canSwitchBranch = useBranchScope((s) => s.canSwitch);
  const allowedBranches = useBranchScope((s) => s.allowed);
  const scopeSelected = useBranchScope((s) => s.selected);
  // Branch users are pinned to their own branch; admins act as the topbar pick.
  const lockedBranch: Branch | null =
    !canSwitchBranch && allowedBranches.length === 1 ? allowedBranches[0] : null;

  const [source, setSource] = useState<Source>("offline");
  const [branch, setBranch] = useState<Branch>(lockedBranch ?? effectiveBranch(scopeSelected));

  // Follow the branch scope: locked to the user's branch, else the topbar pick.
  useEffect(() => {
    setBranch(lockedBranch ?? effectiveBranch(scopeSelected));
  }, [lockedBranch, scopeSelected]);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");
  // BIL-04: result of the customer lookup — runs by itself once a full 10-digit number is typed (or on Enter / the eye button).
  const [lookup, setLookup] = useState<
    | { kind: "idle" } | { kind: "loading" } | { kind: "new" } | { kind: "error"; message: string }
    | { kind: "found"; bills: number; last: string | null }
  >({ kind: "idle" });
  const [rows, setRows] = useState<Row[]>([{ id: crypto.randomUUID(), name: "", price: 0, qty: 1, gstRate: 18 }]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  // Category chip picked in the catalog ("all" = every category).
  const [catalogCat, setCatalogCat] = useState<string>("all");
  const { categories: shopCategories } = useCategories();
  // Product whose variant list is expanded in the catalog (multi-variant products only).
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [discType, setDiscType] = useState<"₹" | "%">("₹");
  const [discVal, setDiscVal] = useState(0);
  const [delivery, setDelivery] = useState(0);
  const [payBox, setPayBox] = useState<PayBox>(freshPayBox);
  const [toast, setToast] = useState<string | null>(null);
  // BIL-05/06/07: the bill just generated, waiting for the output choice (print thermal / A4, WhatsApp, PDF).
  const [saved, setSaved] = useState<{ id: string; total: number; phone: string; message: string; saving: boolean; invoice: Invoice | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const gstinBad = customerGstin.trim() !== "" && !isValidGstin(customerGstin);

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
  // BIL-01: GST rate labels for the summary (CGST @ 9% …).
  const taxSplit = gstSummary(billItems.map((i) => ({ gst: i.gstRate ?? 0, amount: i.price * i.qty - (i.discount || 0) })), tax.cgst, tax.sgst, 0);
  const totalDiscount = itemDiscounts + billDiscount;
  const grand = Math.max(0, subtotal - totalDiscount) + (Number(delivery) || 0);
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

  /** Units of one catalogue product + variant already on the bill. */
  const catalogQty = (productId: string, variantIndex: number) =>
    rows.reduce((n, r) => n + (r.productId === productId && (r.variantIndex ?? 0) === variantIndex ? r.qty : 0), 0);
  /** − / + from the catalog stepper. Going below 1 takes the line off the bill. */
  const changeCatalogQty = (productId: string, variantIndex: number, delta: number) =>
    setRows((rs) => {
      const idx = rs.findIndex((r) => r.productId === productId && (r.variantIndex ?? 0) === variantIndex);
      if (idx < 0) return rs;
      const qty = rs[idx].qty + delta;
      if (qty >= 1) return rs.map((r, i) => (i === idx ? { ...r, qty } : r));
      const rest = rs.filter((_, i) => i !== idx);
      return rest.length > 0 ? rest : [{ id: crypto.randomUUID(), name: "", price: 0, qty: 1, gstRate: 18 }];
    });

  /** Ask the server whether this mobile number belongs to a returning customer, and fill in their name (and GST number if blank). */
  const lookupCustomer = async () => {
    if (!normalizePhone(phone)) {
      setLookup({ kind: "error", message: "Enter a valid 10-digit mobile number." });
      return;
    }
    setLookup({ kind: "loading" });
    try {
      const res = await fetch(`/api/customers/lookup?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Lookup failed (${res.status})`);
      const { customer: c } = (await res.json()) as { customer: { name: string; gstin: string | null; bills: number; lastPurchase: string | null } | null };
      if (!c) return setLookup({ kind: "new" });
      if (c.name) setCustomerName(c.name);
      if (c.gstin && !customerGstin.trim()) setCustomerGstin(c.gstin);
      setLookup({ kind: "found", bills: c.bills, last: c.lastPurchase });
    } catch (e) {
      setLookup({ kind: "error", message: e instanceof Error ? e.message : "Couldn't look the customer up." });
    }
  };

  const clearOrder = () => {
    setRows([{ id: crypto.randomUUID(), name: "", price: 0, qty: 1, gstRate: 18 }]);
    setCouponCode("");
    setDiscVal(0);
    setDelivery(0);
    setPayBox(freshPayBox());
  };

  const buildBill = (): Bill | null => {
    if (activeRows.length === 0) {
      setToast("Add at least one item first.");
      setTimeout(() => setToast(null), 2500);
      return null;
    }
    const gstin = customerGstin.trim();
    if (gstin && !isValidGstin(gstin)) {
      setToast("GST number must be a valid 15-character GSTIN, or leave it blank.");
      setTimeout(() => setToast(null), 3000);
      return null;
    }
    // How it was paid (counter sales only; online orders are Razorpay).
    let pay: { payment: string; payments?: PaymentLine[]; status: Bill["status"] } = { payment: "Razorpay", status: "completed" };
    if (source === "offline") {
      const r = resolvePayBox(payBox, grand);
      if (!r.ok) {
        setToast(r.error);
        setTimeout(() => setToast(null), 3000);
        return null;
      }
      pay = { payment: paymentLabel(r.lines) || "cash", payments: r.lines, status: r.balance > 0 ? "pending" : "completed" };
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
      status: pay.status,
      payment: pay.payment,
      payments: pay.payments,
    };
  };

  const resetForm = () => {
    clearOrder();
    setCustomerName("");
    setPhone("");
    setCustomerGstin("");
    setLookup({ kind: "idle" });
  };

  /** The WhatsApp message for a bill: items, GST split-up (with rates) and the public invoice link. */
  const billMessage = (bill: Bill, link: string) => {
    const lines = bill.items
      .map((i) => `${E.note} ${i.name} × ${i.qty} — ${formatINR(i.price * i.qty - (i.discount || 0))}${i.discount ? ` _(after ${formatINR(i.discount)} off)_` : ""}`)
      .join("\n");
    const split = gstSummary(bill.items.map((i) => ({ gst: i.gstRate ?? 0, amount: i.price * i.qty - (i.discount || 0) })), bill.cgst ?? 0, bill.sgst ?? 0, 0);
    const gstLines =
      bill.gstEnabled && (bill.gst ?? 0) > 0
        ? `${E.chart} Taxable value: ${formatINR(bill.taxable ?? 0)}\n` +
          `${E.tag} ${taxLabel("CGST", split)}: ${formatINR(bill.cgst ?? 0)}\n` +
          `${E.tag} ${taxLabel("SGST", split)}: ${formatINR(bill.sgst ?? 0)}\n` +
          `${E.tag} Total GST (incl.): ${formatINR(bill.gst ?? 0)}\n`
        : "";
    const name = bill.customerName && bill.customerName !== "Walk-in" ? ` ${bill.customerName}` : "";
    return (
      `${E.notes} *${BUSINESS.name}* ${E.notes}\n` +
      `Hi${name}! ${E.wave} Thank you for shopping with us.\n\n` +
      `${E.receipt} *Invoice:* ${bill.id}\n` +
      `${E.calendar} *Date:* ${new Date(bill.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}\n` +
      `${E.pin} *Branch:* ${branchLabel(bill.branch)}\n\n` +
      `${E.cart} *Your items*\n${lines}\n\n` +
      `${E.dollar} Subtotal: ${formatINR(bill.subtotal)}\n` +
      (bill.discount > 0 ? `${E.gift} Discount: -${formatINR(bill.discount)}\n` : "") +
      (bill.delivery > 0 ? `${E.truck} Delivery: ${formatINR(bill.delivery)}\n` : "") +
      gstLines +
      `\n${E.money} *Grand Total: ${formatINR(bill.total)}*\n` +
      (bill.status === "completed" ? `${E.check} Paid${bill.payment ? ` (${bill.payment})` : ""}\n` : `${E.hourglass} Balance pending\n`) +
      `\n${E.doc} View / download your invoice:\n${link}\n\n` +
      `${E.pray} Thank you! Visit again ${E.guitar}${E.keyboard}${E.drum}`
    );
  };

  /** BIL-05: generate the bill, then ask how to hand it over — Print (thermal / A4), WhatsApp or PDF. */
  const generateBill = async () => {
    const bill = buildBill();
    if (!bill) return;
    // Open the "Bill generated" box straight away; the save finishes behind it (the print buttons wait for it,
    // WhatsApp doesn't need to). The form is cleared only once the save has gone through.
    const link = `${window.location.origin}/invoice/${bill.id}`;
    setSaved({ id: bill.id, total: bill.total, phone: phone.trim(), message: billMessage(bill, link), saving: true, invoice: null });
    setSaving(true);
    const r = await addBill(bill);
    setSaving(false);
    if (!r.ok) {
      setSaved(null); // the store already said why; the form still has everything entered
      return;
    }
    setSaved((cur) => (cur && cur.id === bill.id ? { ...cur, saving: false, invoice: r.invoice } : cur));
    resetForm();
  };

  const sendSavedWhatsApp = () => {
    if (!saved) return;
    if (!saved.phone) {
      setToast("No mobile number on this bill — opening WhatsApp without a recipient.");
      setTimeout(() => setToast(null), 3000);
    }
    const url = waUrl(saved.phone, saved.message);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // BIL-04: look the customer up as soon as a full mobile number is typed (name + GST number fill in).
  useEffect(() => {
    if (lookup.kind !== "idle" || !normalizePhone(phone)) return;
    const t = setTimeout(() => void lookupCustomer(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, lookup.kind]);

  // Categories that actually have products to sell, with a readable name and a count — only shown when there is
  // more than one, so a single-category catalog stays as before.
  const catalogCategories = useMemo(() => {
    const nameOf = new Map(shopCategories.map((c) => [String(c.id), c.name]));
    const counts = new Map<string, number>();
    for (const p of invProducts) if (p.active && p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count, name: nameOf.get(id) ?? id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [invProducts, shopCategories]);
  const activeCat = catalogCategories.some((c) => c.id === catalogCat) ? catalogCat : "all";

  const catalogItems = invProducts
    .filter((p) => p.active)
    .filter((p) => activeCat === "all" || p.category === activeCat)
    .filter((p) => `${p.brand ?? ""} ${p.name}`.toLowerCase().includes(catalogQuery.toLowerCase()))
    // Grouped by category, then A–Z, so related products sit together.
    .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name));

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

      {/* BIL-05/06/07: output choice after the bill is generated */}
      {saved && (
        <div className="fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-ink-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Bill saved">
          <div className="my-auto w-full max-w-md rounded-3xl bg-ivory-50 p-6 shadow-2xl ring-1 ring-ink-900/5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success/15 text-success">{saved.saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}</div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-ink-900">{saved.saving ? "Saving bill…" : "Bill generated"}</h3>
                <p className="text-sm text-ink-500">{saved.id} · {formatINR(saved.total)}</p>
              </div>
              {!saved.saving && <button onClick={() => setSaved(null)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>}
            </div>
            <BillOutputPanel billId={saved.id} saving={saved.saving} invoice={saved.invoice} onWhatsApp={sendSavedWhatsApp} onNewBill={() => setSaved(null)} />
          </div>
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* ── LEFT ── (min-w-0 lets the wide items table scroll inside its card instead of pushing the summary off-screen) */}
        <div className="min-w-0 space-y-6">
          {/* Customer */}
          <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-gold-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-900">Customer Details</h2>
            </div>
            <div className="grid items-start gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Customer Name</label>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Enter name" className={fieldCls} />
              </div>
              <div>
                <label className="mb-1.5 block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">Mobile (WhatsApp)</label>
                <div className="relative">
                  <input
                    value={phone}
                    onChange={(e) => {
                      // Digits only, at most 10. A pasted "+91 98765 43210" or "098765 43210" keeps just the 10-digit number.
                      let d = e.target.value.replace(/\D/g, "");
                      if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
                      if (d.length > 10 && d.startsWith("0")) d = d.slice(1);
                      setPhone(d.slice(0, 10));
                      if (lookup.kind !== "idle") setLookup({ kind: "idle" });
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookupCustomer(); } }}
                    placeholder="Enter 10-digit number"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    autoComplete="tel-national"
                    className={fieldCls + " pr-11"}
                  />
                  <button
                    type="button"
                    onClick={() => void lookupCustomer()}
                    disabled={lookup.kind === "loading" || !phone.trim()}
                    title="Look up this customer"
                    aria-label="Look up customer by mobile number"
                    className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-gold-50 hover:text-gold-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {lookup.kind === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {lookup.kind === "found" && (
                  <p className="mt-1.5 truncate text-[11px] font-medium text-success" title={lookup.last ? `Last on ${new Date(lookup.last).toLocaleDateString("en-IN")}` : undefined}>
                    ✓ Returning customer · {lookup.bills} bill{lookup.bills === 1 ? "" : "s"}{lookup.last ? ` · last ${new Date(lookup.last).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}
                  </p>
                )}
                {lookup.kind === "new" && <p className="mt-1.5 truncate text-[11px] text-ink-500">New customer</p>}
                {lookup.kind === "error" && <p className="mt-1.5 truncate text-[11px] text-danger">{lookup.message}</p>}
              </div>
              <div>
                <label className="mb-1.5 block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">GST No. (optional)</label>
                <input value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())} maxLength={15} placeholder="33XXXXX0000X1ZV" aria-invalid={gstinBad} className={cn(fieldCls, "font-mono tracking-wide", gstinBad && "border-danger focus:border-danger")} />
                {gstinBad && <p className="mt-1.5 truncate text-[11px] text-danger">Enter a valid 15-character GSTIN</p>}
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
                {fullAdmin && <button onClick={addRow} className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </button>}
              </div>
            </div>

            {/* Rows — two-line cards: name + amount on top, details underneath */}
            <div className="space-y-3">
              {rows.map((r, i) => {
                const lbl = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500";
                return (
                  <div key={r.id} className="rounded-xl border border-ink-100 bg-white p-3 md:p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-900/5 text-xs font-semibold text-ink-500">{i + 1}</span>
                      <input
                        value={r.name}
                        onChange={(e) => setRow(r.id, { name: e.target.value })}
                        readOnly={!fullAdmin}
                        placeholder={fullAdmin ? "Item name / description…" : "Choose a product from the Catalog"}
                        aria-label="Item name"
                        className={cn(cell, "min-w-0 flex-1 py-2.5 text-left font-medium")}
                      />
                      <span className="w-28 shrink-0 text-right text-base font-bold tabular-nums text-ink-900">{formatINR(Math.max(0, r.price * r.qty - lineDiscount(r)))}</span>
                      <button onClick={() => removeRow(r.id)} aria-label="Remove item" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger/10">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 sm:pl-10">
                      <div>
                        <label className={lbl}>HSN</label>
                        <input
                          value={r.hsn ?? ""}
                          onChange={(e) => setRow(r.id, { hsn: e.target.value })}
                          disabled={!fullAdmin}
                          placeholder="HSN"
                          aria-label="HSN code"
                          inputMode="numeric"
                          className={cn(cell, "text-left")}
                        />
                      </div>
                      <div>
                        <label className={lbl}>GST</label>
                        <select
                          value={r.gstRate == null ? "none" : String(r.gstRate)}
                          onChange={(e) => setRow(r.id, { gstRate: e.target.value === "none" ? null : Number(e.target.value) })}
                          disabled={!fullAdmin}
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
                      </div>
                      <div>
                        <label className={lbl}>MRP (₹)</label>
                        <MoneyInput
                          value={r.mrp || 0}
                          onChange={(paise) => setRow(r.id, { mrp: paise })}
                          disabled={!fullAdmin}
                          placeholder={r.price > 0 ? String(r.price / 100) : "MRP"}
                          aria-label="MRP per unit"
                          title="MRP per unit — defaults to the catalog MRP; blank = same as price"
                          className={cell}
                        />
                      </div>
                      <div>
                        <label className={lbl}>Price (₹)</label>
                        <MoneyInput value={r.price || 0} onChange={(paise) => setRow(r.id, { price: paise })} disabled={!fullAdmin} title={fullAdmin ? undefined : "Prices come from the catalog"} placeholder="Price" aria-label="Price per unit" className={cell} />
                      </div>
                      <div>
                        <label className={lbl}>Qty</label>
                        <div className="flex items-center justify-between rounded-lg border border-ink-200 bg-ivory-50 px-0.5">
                          <button onClick={() => setRow(r.id, { qty: Math.max(1, r.qty - 1) })} aria-label="Decrease quantity" className="grid h-9 w-8 place-items-center text-ink-500 hover:text-ink-900">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-sm font-semibold tabular-nums">{r.qty}</span>
                          <button onClick={() => setRow(r.id, { qty: r.qty + 1 })} aria-label="Increase quantity" className="grid h-9 w-8 place-items-center text-ink-500 hover:text-ink-900">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className={lbl}>Discount (₹)</label>
                        <MoneyInput
                          value={lineDiscount(r)}
                          onChange={(paise) => setRow(r.id, { discount: Math.min(paise, r.price * r.qty) })}
                          title={r.price > 0 ? `Max ${formatINR(r.price * r.qty)} (the line total)` : undefined}
                          placeholder="0"
                          aria-label="Item discount"
                          className={cell}
                        />
                      </div>
                      <div className="col-span-full">
                        <label className={lbl}>Delivery instruction</label>
                        <input
                          value={r.instruction ?? ""}
                          onChange={(e) => setRow(r.id, { instruction: e.target.value })}
                          placeholder="e.g. serial no."
                          aria-label="Delivery instruction"
                          maxLength={120}
                          className={cn(cell, "text-left")}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ── RIGHT: summary ── */}
        <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
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
                    <BranchOptions />
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
                  <div className="flex items-center justify-between text-ink-500"><span>{taxLabel("CGST", taxSplit)}</span><span className="tabular-nums">{formatINR(tax.cgst)}</span></div>
                  <div className="flex items-center justify-between text-ink-500"><span>{taxLabel("SGST", taxSplit)}</span><span className="tabular-nums">{formatINR(tax.sgst)}</span></div>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4">
              <span className="text-sm font-bold uppercase tracking-wider text-ink-900">Grand Total</span>
              <span className="text-2xl font-bold tabular-nums text-ink-900">{formatINR(grand)}</span>
            </div>

            {/* payment */}
            {source === "offline" && <PaymentBox className="mt-4" total={grand} value={payBox} onChange={setPayBox} />}

            {/* actions — BIL-05: generate first, then choose Print (thermal / A4), WhatsApp or PDF */}
            <button onClick={() => void generateBill()} disabled={saving} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-3.5 text-xs font-bold uppercase tracking-wider text-ivory-50 transition-colors hover:bg-gold-500 hover:text-ink-900 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} {saving ? "Saving…" : "Generate Bill"}
            </button>
            <p className="mt-2 text-center text-[11px] text-ink-400">You&apos;ll choose Print, WhatsApp or PDF next.</p>
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
              className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl bg-ivory-50 shadow-2xl sm:max-h-[85vh] sm:max-w-3xl sm:rounded-2xl"
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
                {/* Category-wise picking — only when the catalog has more than one category */}
                {catalogCategories.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by category">
                    {[{ id: "all", name: "All", count: invProducts.filter((p) => p.active).length }, ...catalogCategories].map((c) => (
                      <button
                        key={c.id}
                        role="tab"
                        aria-selected={activeCat === c.id}
                        onClick={() => { setCatalogCat(c.id); setPickFor(null); }}
                        className={cn(
                          "flex items-center gap-1.5 whitespace-nowrap rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold ring-1 transition-colors",
                          activeCat === c.id ? "bg-ink-900 text-ivory-50 ring-ink-900" : "bg-white text-ink-600 ring-ink-200 hover:text-ink-900 hover:ring-gold-400",
                        )}
                      >
                        {c.name}
                        <span className={cn("grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] tabular-nums", activeCat === c.id ? "bg-ivory-50/20" : "bg-ink-100 text-ink-500")}>{c.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Products grid */}
              <div className="grid flex-1 content-start gap-2.5 overflow-y-auto p-4 sm:grid-cols-2">
                {catalogItems.map((p) => {
                  const inOrder = qtyInOrder[p.id] || 0;
                  const enabled = p.variants.map((v, vi) => ({ v, vi })).filter((x) => !x.v.disabled);
                  const multi = enabled.length > 1;
                  const stock = productStockAt(p, branch);
                  const out = stock <= 0;
                  const single = enabled[0];
                  const singleQty = !multi && single ? catalogQty(p.id, single.vi) : 0;
                  const addSingle = () => single && addFromCatalog(p.name, p.basePrice, p.gstRate ?? null, p.hsn, p.id, single.vi, p.mrp);
                  const open = multi && pickFor === p.id;
                  return (
                    <Fragment key={p.id}>
                    <div
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all",
                        inOrder > 0 ? "border-gold-400 bg-gold-50/60" : "border-ink-100 bg-white hover:border-gold-400 hover:shadow-sm",
                        open && "border-gold-400",
                        out && inOrder === 0 && "opacity-50 hover:border-ink-100 hover:shadow-none",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => (multi ? setPickFor(open ? null : p.id) : singleQty === 0 && addSingle())}
                        disabled={out && !multi}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                      >
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                          {p.photo && <img src={p.photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
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
                            {out ? "Out of stock" : `${stock} in stock · ${branchLabel(branch)}`}
                          </p>
                        </div>
                      </button>
                      {/* No variants: once added, + becomes a − qty + stepper. With variants: + opens the variant list. */}
                      {!multi && singleQty > 0 ? (
                        <QtyStepper
                          qty={singleQty}
                          max={single ? variantStockAt(single.v, branch) : 0}
                          onDec={() => single && changeCatalogQty(p.id, single.vi, -1)}
                          onInc={() => single && changeCatalogQty(p.id, single.vi, 1)}
                        />
                      ) : multi ? (
                        <button
                          type="button"
                          onClick={() => setPickFor(open ? null : p.id)}
                          aria-label={open ? "Hide variants" : "Choose a variant"}
                          className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors", open ? "bg-gold-500 text-ink-900" : "bg-ink-900 text-ivory-50 hover:bg-gold-500 hover:text-ink-900")}
                        >
                          <Plus className={cn("h-4 w-4 transition-transform", open && "rotate-45")} />
                        </button>
                      ) : !out ? (
                        <button type="button" onClick={addSingle} aria-label={`Add ${p.name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-900 text-ivory-50 transition-colors hover:bg-gold-500 hover:text-ink-900">
                          <Plus className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    {open && (
                      <div className="col-span-full space-y-1.5 rounded-xl border border-gold-300 bg-gold-50/40 p-2.5">
                        <p className="px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">Choose a variant of {p.name} · {branchLabel(branch)}</p>
                        {enabled.map(({ v, vi }) => {
                          const vStock = variantStockAt(v, branch);
                          const vName = `${p.name} — ${v.attr}${v.finish ? ` · ${v.finish}` : ""}`;
                          const vPrice = v.price > 0 ? v.price : p.basePrice;
                          const vQty = catalogQty(p.id, vi);
                          return (
                            <div
                              key={vi}
                              className={cn(
                                "flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-sm transition-colors",
                                vQty > 0 ? "border-gold-400 bg-gold-50/60" : "border-ink-100",
                                vStock <= 0 && vQty === 0 && "opacity-50",
                              )}
                            >
                              <span className="min-w-0 truncate font-medium text-ink-900">{v.attr}{v.finish ? ` · ${v.finish}` : ""}</span>
                              <span className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                                <span className="text-ink-700">{formatINR(vPrice)}</span>
                                <span className={cn("hidden sm:inline", vStock <= 0 ? "text-danger" : "text-ink-400")}>{vStock <= 0 ? "Out of stock" : `${vStock} in stock`}</span>
                                {vQty > 0 ? (
                                  <QtyStepper qty={vQty} max={vStock} onDec={() => changeCatalogQty(p.id, vi, -1)} onInc={() => changeCatalogQty(p.id, vi, 1)} small />
                                ) : (
                                  <button
                                    type="button"
                                    disabled={vStock <= 0}
                                    onClick={() => addFromCatalog(vName, vPrice, p.gstRate ?? null, p.hsn, p.id, vi, p.mrp)}
                                    aria-label={`Add ${vName}`}
                                    className="grid h-7 w-7 place-items-center rounded-lg bg-ink-900 text-ivory-50 transition-colors hover:bg-gold-500 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    </Fragment>
                  );
                })}
                {catalogItems.length === 0 && (
                  <p className="col-span-full py-12 text-center text-sm text-ink-400">
                    No products found{activeCat !== "all" ? " in this category" : ""}.
                    {activeCat !== "all" && <button onClick={() => setCatalogCat("all")} className="ml-1 font-semibold text-gold-600 hover:underline">Show all</button>}
                  </p>
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

/** − qty + control shown in the catalog once a product (or variant) is on the bill. */
function QtyStepper({ qty, max, onDec, onInc, small }: { qty: number; max: number; onDec: () => void; onInc: () => void; small?: boolean }) {
  const atMax = max > 0 && qty >= max;
  const btn = cn("grid place-items-center rounded-md text-ivory-50 transition-colors", small ? "h-6 w-6" : "h-7 w-7");
  return (
    <div className={cn("flex shrink-0 items-center gap-1 rounded-lg bg-ink-900 p-0.5 shadow-sm", small && "rounded-md")} role="group" aria-label="Quantity">
      <button type="button" onClick={onDec} aria-label={qty === 1 ? "Remove from bill" : "Decrease quantity"} className={cn(btn, "hover:bg-danger")}>
        {qty === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
      </button>
      <span className={cn("min-w-[1.75rem] text-center font-bold tabular-nums text-ivory-50", small ? "text-xs" : "text-sm")} aria-live="polite">{qty}</span>
      <button type="button" onClick={onInc} disabled={atMax} title={atMax ? `Only ${max} in stock` : undefined} aria-label="Increase quantity" className={cn(btn, "hover:bg-gold-500 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40")}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
