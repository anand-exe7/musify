"use client";
import { create } from "zustand";
import { genDocId } from "@/lib/ids";

/* ─────────────────────────────  Types  ───────────────────────────── */

export type Branch = "Branch 1" | "Branch 2";
export type BranchFilter = Branch | "all";
export type Source = "offline" | "online" | "service";

export interface BillItem {
  name: string;
  price: number;
  qty: number;
  /** GST rate (%) snapshotted at bill time. `null`/absent ⇒ line billed non-GST. */
  gstRate?: number | null;
  hsn?: string;
  /** Set when the line was picked from the catalog — enables server-side stock
   *  decrement of that variant at the bill's `branch`. Freeform lines omit. */
  productId?: string;
  variantIndex?: number;
}

export interface Bill {
  id: string;
  createdAt: string; // ISO date-time
  customerName: string;
  phone: string;
  source: Source;
  branch: Branch;
  items: BillItem[];
  subtotal: number;
  coupon?: string;
  discount: number; // coupon + manual, on subtotal
  delivery: number;
  total: number;
  /** True when raised as a GST tax invoice; false for a plain (non-GST) bill. */
  gstEnabled?: boolean;
  /** GST-inclusive breakup of the taxed lines (whole rupees). */
  taxable?: number;
  cgst?: number;
  sgst?: number;
  gst?: number;
  status: "completed" | "pending";
  payment?: string;
}

export interface Variant {
  attr: string; // e.g. size / model
  finish: string; // e.g. colour / wood
  price: number;
  weight: number;
  /** Per-branch on-hand. Legacy rows may carry a flat `stock: number` instead;
   *  `variantStock` / `variantStockAt` read either shape. */
  stockByBranch?: Partial<Record<Branch, number>>;
  /** @deprecated Legacy single-bucket stock, treated as sitting in Branch 1. */
  stock?: number;
  disabled?: boolean;
}

/**
 * The unified catalog product — the single model the admin edits and the
 * storefront reads. Money fields (`basePrice`, `mrp`, `cost`, `variants[].price`)
 * are in **paise**. Website-facing fields (slug, brand, origin, mrp, tagline,
 * gallery, specs, features, featured/bestSeller) live here too so a product
 * created in admin renders on the storefront with no second entry.
 */
export interface InvProduct {
  id: string;
  name: string;
  category: string; // display label
  department: string;
  /** Storefront URL slug (unique). */
  slug?: string;
  brand?: string;
  /** Storefront origin filter. */
  origin?: "indian" | "western";
  photo?: string;
  photos?: string[];
  images?: string[];
  basePrice: number; // paise — the base selling price (storefront `price`)
  mrp?: number; // paise — list price for the strikethrough
  baseWeight: number;
  description: string;
  tagline?: string;
  rating?: number;
  reviews?: number;
  specs?: { label: string; value: string }[];
  features?: string[];
  active: boolean; // shown to customers
  featured?: boolean;
  bestSeller?: boolean;
  discountLabel?: string;
  newArrival?: boolean;
  lowStockAt: number;
  /** Default GST rate (%) used when billed as a GST sale. `null` ⇒ non-GST. */
  gstRate?: number | null;
  hsn?: string;
  isGstApplicable?: boolean;
  /** Purchase cost per unit (paise), maintained by stock-inward. Drives profit. */
  cost?: number;
  variants: Variant[];
}

export interface Coupon {
  code: string;
  discountPct: number;
  minOrder: number;
  expiry: string; // dd/mm/yyyy display
  usageLimit: number;
  remaining: number;
}

/* ─────────────────────────────  Store  ───────────────────────────── */

const JSON_HEADERS = { "Content-Type": "application/json" };

async function send(url: string, method: string, body: unknown, onError: () => void) {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? JSON_HEADERS : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error("save failed");
  } catch {
    alert("Couldn't save the change. Reverting to the saved values.");
    onError();
  }
}

interface POSState {
  bills: Bill[];
  invProducts: InvProduct[];
  coupons: Coupon[];
  categories: string[];
  branch: BranchFilter;
  activeBranch: Branch; // branch a new POS bill is created for
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setBranchFilter: (b: BranchFilter) => void;
  setActiveBranch: (b: Branch) => void;
  addBill: (b: Bill) => void;
  deleteBill: (id: string) => void;
  updateProduct: (id: string, patch: Partial<InvProduct>) => void;
  addProduct: (p: InvProduct) => void;
  deleteProduct: (id: string) => void;
  addCoupon: (c: Coupon) => void;
  updateCoupon: (code: string, patch: Partial<Coupon>) => void;
  deleteCoupon: (code: string) => void;
  addCategory: (name: string) => void;
  renameCategory: (from: string, to: string) => void;
  deleteCategory: (name: string) => void;
  resetDemo: () => void;
}

export const usePOS = create<POSState>()((set, get) => ({
  bills: [],
  invProducts: [],
  coupons: [],
  categories: [],
  branch: "all",
  activeBranch: "Branch 1",
  hydrated: false,
  hydrate: async () => {
    try {
      const [bills, invProducts, coupons, categories] = await Promise.all([
        fetch("/api/pos/bills").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/pos/inventory").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/pos/coupons").then((r) => (r.ok ? r.json() : [])),
        fetch("/api/pos/categories").then((r) => (r.ok ? r.json() : [])),
      ]);
      set({ bills, invProducts, coupons, categories, hydrated: true });
    } catch {
      /* keep empty */
    }
  },

  // Branch selectors are local UI state only.
  setBranchFilter: (b) => set({ branch: b }),
  setActiveBranch: (b) => set({ activeBranch: b }),

  addBill: (b) => {
    set((s) => ({ bills: [b, ...s.bills] }));
    void send("/api/pos/bills", "POST", b, get().hydrate);
  },
  deleteBill: (id) => {
    set((s) => ({ bills: s.bills.filter((x) => x.id !== id) }));
    void send(`/api/pos/bills/${id}`, "DELETE", null, get().hydrate);
  },

  updateProduct: (id, patch) => {
    set((s) => ({ invProducts: s.invProducts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    void send(`/api/pos/inventory/${id}`, "PATCH", patch, get().hydrate);
  },
  addProduct: (p) => {
    set((s) => ({ invProducts: [p, ...s.invProducts] }));
    void send("/api/pos/inventory", "POST", p, get().hydrate);
  },
  deleteProduct: (id) => {
    set((s) => ({ invProducts: s.invProducts.filter((p) => p.id !== id) }));
    void send(`/api/pos/inventory/${id}`, "DELETE", null, get().hydrate);
  },

  addCoupon: (c) => {
    set((s) => ({ coupons: [c, ...s.coupons.filter((x) => x.code !== c.code)] }));
    void send("/api/pos/coupons", "POST", c, get().hydrate);
  },
  updateCoupon: (code, patch) => {
    set((s) => ({ coupons: s.coupons.map((c) => (c.code === code ? { ...c, ...patch } : c)) }));
    void send(`/api/pos/coupons/${encodeURIComponent(code)}`, "PATCH", patch, get().hydrate);
  },
  deleteCoupon: (code) => {
    set((s) => ({ coupons: s.coupons.filter((c) => c.code !== code) }));
    void send(`/api/pos/coupons/${encodeURIComponent(code)}`, "DELETE", null, get().hydrate);
  },

  addCategory: (name) => {
    if (get().categories.includes(name)) return;
    set((s) => ({ categories: [...s.categories, name] }));
    void send("/api/pos/categories", "POST", { name }, get().hydrate);
  },
  renameCategory: (from, to) => {
    set((s) => ({
      categories: s.categories.map((c) => (c === from ? to : c)),
      invProducts: s.invProducts.map((p) => (p.category === from ? { ...p, category: to } : p)),
    }));
    const affected = get().invProducts.filter((p) => p.category === to);
    void (async () => {
      try {
        let res = await fetch("/api/pos/categories", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name: to }) });
        if (!res.ok) throw new Error();
        await Promise.all(
          affected.map((p) =>
            fetch(`/api/pos/inventory/${p.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ category: to }) }),
          ),
        );
        res = await fetch(`/api/pos/categories/${encodeURIComponent(from)}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      } catch {
        alert("Couldn't rename the category. Reverting to the saved values.");
        void get().hydrate();
      }
    })();
  },
  deleteCategory: (name) => {
    set((s) => ({ categories: s.categories.filter((c) => c !== name) }));
    void send(`/api/pos/categories/${encodeURIComponent(name)}`, "DELETE", null, get().hydrate);
  },

  resetDemo: () => void get().hydrate(),
}));

if (typeof window !== "undefined") {
  void usePOS.getState().hydrate();
}

/* ─────────────────────────  Derived helpers  ─────────────────────── */

/** On-hand at a specific branch for one variant. Tolerates the legacy shape:
 *  a variant that pre-dates per-branch buckets carries `stock: number`, which
 *  is treated as sitting in Branch 1 (see the seed / stock-inward path). */
export function variantStockAt(v: Variant, branch: Branch): number {
  if (v.stockByBranch && typeof v.stockByBranch[branch] === "number") {
    return Number(v.stockByBranch[branch]) || 0;
  }
  return branch === "Branch 1" ? Number(v.stock) || 0 : 0;
}

/** Total on-hand across every branch for one variant. */
export function variantStock(v: Variant): number {
  if (v.stockByBranch) {
    return (Number(v.stockByBranch["Branch 1"]) || 0) + (Number(v.stockByBranch["Branch 2"]) || 0);
  }
  return Number(v.stock) || 0;
}

/** On-hand at one branch across every enabled variant of a product. */
export function productStockAt(p: InvProduct, branch: Branch): number {
  return p.variants.filter((v) => !v.disabled).reduce((n, v) => n + variantStockAt(v, branch), 0);
}

/** Total on-hand for a product (all branches, enabled variants). */
export function productStock(p: InvProduct): number {
  return p.variants.filter((v) => !v.disabled).reduce((n, v) => n + variantStock(v), 0);
}

export function stockState(p: InvProduct): "out" | "low" | "in" {
  const s = productStock(p);
  if (s <= 0) return "out";
  if (s <= p.lowStockAt) return "low";
  return "in";
}

/** Set the `branch` bucket to `qty`, preserving other buckets. Migrates a
 *  legacy `stock` field into the map. Returns a new object; never mutates. */
export function setVariantStockAt(v: Variant, branch: Branch, qty: number): Variant {
  const legacyBranch1 = v.stockByBranch ? undefined : Number(v.stock) || 0;
  const next: Partial<Record<Branch, number>> = {
    ...(v.stockByBranch ?? {}),
    ...(legacyBranch1 !== undefined ? { "Branch 1": legacyBranch1 } : {}),
    [branch]: Math.max(0, Math.round(qty)),
  };
  const { stock: _drop, ...rest } = v;
  void _drop;
  return { ...rest, stockByBranch: next };
}

export type Period = "all" | "today" | "week" | "month" | "year" | "custom";

export function inPeriod(
  isoDate: string,
  period: Period,
  today = new Date(),
  custom?: { from?: string; to?: string },
): boolean {
  const d = new Date(isoDate);
  const t = new Date(today);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  switch (period) {
    case "today":
      return startOfDay(d).getTime() === startOfDay(t).getTime();
    case "week": {
      const weekAgo = new Date(t);
      weekAgo.setDate(t.getDate() - 6);
      return d >= startOfDay(weekAgo) && d <= new Date(startOfDay(t).getTime() + 86400000 - 1);
    }
    case "month":
      return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
    case "year":
      return d.getFullYear() === t.getFullYear();
    case "custom": {
      if (!custom?.from && !custom?.to) return true;
      const from = custom?.from ? startOfDay(new Date(custom.from)) : new Date(0);
      const to = custom?.to ? new Date(startOfDay(new Date(custom.to)).getTime() + 86400000 - 1) : new Date(8640000000000000);
      return d >= from && d <= to;
    }
    default:
      return true;
  }
}

export function filterBills(
  bills: Bill[],
  opts: { period?: Period; branch?: BranchFilter; source?: Source | "all"; custom?: { from?: string; to?: string }; today?: Date },
): Bill[] {
  const { period = "all", branch = "all", source = "all", custom, today } = opts;
  return bills.filter(
    (b) =>
      b.status === "completed" &&
      (branch === "all" || b.branch === branch) &&
      (source === "all" || b.source === source) &&
      inPeriod(b.createdAt, period, today, custom),
  );
}

export function genInvoiceId(): string {
  return genDocId("INV");
}

/* ─────────────────────────────  GST maths  ──────────────────────────── */

/**
 * Split a **GST-inclusive** line amount into its taxable value and the tax it
 * already contains. e.g. ₹1180 @ 18% → { taxable: 1000, tax: 180 }. A rate of
 * 0 / null (a non-GST line) yields all-taxable, zero tax. Whole rupees.
 */
export function lineTax(amount: number, rate?: number | null): { taxable: number; tax: number } {
  const r = Number(rate) || 0;
  if (r <= 0) return { taxable: Math.round(amount), tax: 0 };
  const taxable = Math.round(amount / (1 + r / 100));
  return { taxable, tax: Math.round(amount) - taxable };
}

export interface BillTax {
  taxable: number; // GST-inclusive taxable value of taxed lines
  cgst: number;
  sgst: number;
  gst: number; // cgst + sgst
  byRate: Record<number, { taxable: number; tax: number }>; // per-rate breakup (5/12/18/28…)
}

/**
 * Aggregate the GST contained in a bill's lines. When `gstEnabled` is false the
 * whole bill is untaxed. Intra-state (home branch) split: CGST = SGST = tax/2.
 */
export function billTax(items: BillItem[], gstEnabled: boolean): BillTax {
  const byRate: Record<number, { taxable: number; tax: number }> = {};
  let taxable = 0;
  let tax = 0;
  if (gstEnabled) {
    for (const it of items) {
      const rate = Number(it.gstRate) || 0;
      const { taxable: tv, tax: tx } = lineTax(it.price * it.qty, rate);
      if (rate > 0) {
        taxable += tv;
        tax += tx;
        const b = byRate[rate] ?? { taxable: 0, tax: 0 };
        b.taxable += tv;
        b.tax += tx;
        byRate[rate] = b;
      }
    }
  }
  const cgst = Math.round(tax / 2);
  return { taxable, cgst, sgst: tax - cgst, gst: tax, byRate };
}
