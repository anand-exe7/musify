"use client";
import { create } from "zustand";
import { genDocId } from "@/lib/ids";
import { fetchJson, errMsg, readError, makeSender } from "@/lib/client/api";
import { invalidateCatalog } from "@/lib/client/catalog";
import { lineTax, allocateDiscount } from "@/lib/gst/inclusive";
import {
  type Branch,
  type BranchFilter,
  type Variant,
  variantStock,
  variantStockAt,
  setVariantStockAt,
} from "@/lib/stock";

export { variantStock, variantStockAt, setVariantStockAt };
export type { Branch, BranchFilter, Variant };

/* ─────────────────────────────  Types  ───────────────────────────── */

export type Source = "offline" | "online" | "service";

export interface BillItem {
  name: string;
  price: number;
  qty: number;
  /** GST rate (%) snapshotted at bill time. `null`/absent ⇒ line billed non-GST. */
  gstRate?: number | null;
  hsn?: string;
  /** Catalog MRP per unit in paise (printed on the invoice when above `price`). */
  mrp?: number;
  /** Delivery instruction for this line (e.g. serial number) — printed on the invoice. */
  instruction?: string;
  /** Per-line discount in paise (off `price * qty`); GST is computed on the net. */
  discount?: number;
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
  customerGstin?: string; // optional buyer GSTIN
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

const send = makeSender("the change");

interface POSState {
  bills: Bill[];
  invProducts: InvProduct[];
  coupons: Coupon[];
  categories: string[];
  branch: BranchFilter;
  activeBranch: Branch; // branch a new POS bill is created for
  hydrated: boolean;
  /** Which slices failed to load, e.g. "coupons, bills" (null = all fine). A
   *  failed slice keeps its last value but is reported, never shown as "empty". */
  loadError: string | null;
  hydrate: () => Promise<boolean>;
  setBranchFilter: (b: BranchFilter) => void;
  setActiveBranch: (b: Branch) => void;
  addBill: (b: Bill) => void;
  deleteBill: (id: string) => void;
  /** `stockChanges` are the stock figures the editor changed (what it saw → what it wants);
   *  the server applies those as differences, so concurrent sales aren't overwritten. */
  updateProduct: (id: string, patch: Partial<InvProduct>, stockChanges?: { variantIndex: number; branch: Branch; from: number; to: number }[]) => void;
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
  loadError: null,
  hydrate: async () => {
    const [bills, invProducts, coupons, categories] = await Promise.allSettled([
      fetchJson<Bill[]>("/api/pos/bills"),
      fetchJson<InvProduct[]>("/api/pos/inventory"),
      fetchJson<Coupon[]>("/api/pos/coupons"),
      fetchJson<string[]>("/api/pos/categories"),
    ]);
    // Apply whichever slices loaded; name the ones that didn't.
    const patch: Partial<POSState> = {};
    const failed: string[] = [];
    const take = <K extends "bills" | "invProducts" | "coupons" | "categories">(
      key: K,
      label: string,
      r: PromiseSettledResult<POSState[K]>,
    ) => {
      if (r.status === "fulfilled") patch[key] = r.value as never;
      else failed.push(`${label} (${errMsg(r.reason)})`);
    };
    take("bills", "bills", bills);
    take("invProducts", "inventory", invProducts);
    take("coupons", "coupons", coupons);
    take("categories", "categories", categories);
    set({ ...patch, hydrated: failed.length === 0, loadError: failed.length ? `Couldn't load ${failed.join(", ")}` : null });
    // Stock inward/transfers and every edit end in a re-hydrate, so this is also
    // where the storefront's cached catalogue is thrown away.
    if (invProducts.status === "fulfilled") invalidateCatalog();
    return failed.length === 0;
  },

  // Branch selectors are local UI state only.
  setBranchFilter: (b) => set({ branch: b }),
  setActiveBranch: (b) => set({ activeBranch: b }),

  addBill: (b) => {
    const prev = get().bills;
    set((s) => ({ bills: [b, ...s.bills] }));
    // A sale moves stock server-side, so re-read inventory once it is saved —
    // otherwise the catalog keeps showing the pre-sale stock until a page reload.
    void send("/api/pos/bills", "POST", b, get().hydrate, () => set({ bills: prev })).then((ok) => ok && void get().hydrate());
  },
  deleteBill: (id) => {
    const prev = get().bills;
    set((s) => ({ bills: s.bills.filter((x) => x.id !== id) }));
    void send(`/api/pos/bills/${id}`, "DELETE", null, get().hydrate, () => set({ bills: prev })).then((ok) => ok && void get().hydrate());
  },

  updateProduct: (id, patch, stockChanges) => {
    const prev = get().invProducts;
    set((s) => ({ invProducts: s.invProducts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    void send(`/api/pos/inventory/${id}`, "PATCH", stockChanges ? { ...patch, stockChanges } : patch, get().hydrate, () => set({ invProducts: prev })).then((ok) => ok && invalidateCatalog());
  },
  addProduct: (p) => {
    const prev = get().invProducts;
    set((s) => ({ invProducts: [p, ...s.invProducts] }));
    void send("/api/pos/inventory", "POST", p, get().hydrate, () => set({ invProducts: prev })).then((ok) => ok && invalidateCatalog());
  },
  deleteProduct: (id) => {
    const prev = get().invProducts;
    set((s) => ({ invProducts: s.invProducts.filter((p) => p.id !== id) }));
    void send(`/api/pos/inventory/${id}`, "DELETE", null, get().hydrate, () => set({ invProducts: prev })).then((ok) => ok && invalidateCatalog());
  },

  addCoupon: (c) => {
    const prev = get().coupons;
    set((s) => ({ coupons: [c, ...s.coupons.filter((x) => x.code !== c.code)] }));
    void send("/api/pos/coupons", "POST", c, get().hydrate, () => set({ coupons: prev }));
  },
  updateCoupon: (code, patch) => {
    const prev = get().coupons;
    set((s) => ({ coupons: s.coupons.map((c) => (c.code === code ? { ...c, ...patch } : c)) }));
    void send(`/api/pos/coupons/${encodeURIComponent(code)}`, "PATCH", patch, get().hydrate, () => set({ coupons: prev }));
  },
  deleteCoupon: (code) => {
    const prev = get().coupons;
    set((s) => ({ coupons: s.coupons.filter((c) => c.code !== code) }));
    void send(`/api/pos/coupons/${encodeURIComponent(code)}`, "DELETE", null, get().hydrate, () => set({ coupons: prev }));
  },

  addCategory: (name) => {
    if (get().categories.includes(name)) return;
    const prev = get().categories;
    set((s) => ({ categories: [...s.categories, name] }));
    void send("/api/pos/categories", "POST", { name }, get().hydrate, () => set({ categories: prev }));
  },
  renameCategory: (from, to) => {
    const prevCategories = get().categories;
    const prevProducts = get().invProducts;
    set((s) => ({
      categories: s.categories.map((c) => (c === from ? to : c)),
      invProducts: s.invProducts.map((p) => (p.category === from ? { ...p, category: to } : p)),
    }));
    const affected = get().invProducts.filter((p) => p.category === to);
    void (async () => {
      // Every step must succeed — a refused PATCH used to pass silently and
      // leave the database on the old category while the screen showed the new.
      const must = async (res: Response) => {
        if (!res.ok) throw new Error(await readError(res, "Request failed"));
      };
      try {
        await must(await fetch("/api/pos/categories", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name: to }) }));
        const results = await Promise.all(
          affected.map((p) =>
            fetch(`/api/pos/inventory/${p.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ category: to }) }),
          ),
        );
        for (const r of results) await must(r);
        await must(await fetch(`/api/pos/categories/${encodeURIComponent(from)}`, { method: "DELETE" }));
        invalidateCatalog();
      } catch (err) {
        alert(`Couldn't rename the category: ${errMsg(err)}. Reverting to the saved values.`);
        if (!(await get().hydrate())) set({ categories: prevCategories, invProducts: prevProducts });
      }
    })();
  },
  deleteCategory: (name) => {
    const prev = get().categories;
    set((s) => ({ categories: s.categories.filter((c) => c !== name) }));
    void send(`/api/pos/categories/${encodeURIComponent(name)}`, "DELETE", null, get().hydrate, () => set({ categories: prev }));
  },

  resetDemo: () => void get().hydrate(),
}));

if (typeof window !== "undefined") {
  void usePOS.getState().hydrate();
}

/* ─────────────────────────  Derived helpers  ─────────────────────── */

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

// The inclusive-GST primitives live in a pure module shared with the web checkout.
export { lineTax };

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
 *
 * `billDiscount` is the bill-level discount (coupon + manual) in paise. It is
 * spread across the lines and taken off BEFORE tax is extracted, so the tax
 * recorded is the tax actually contained in what the customer pays.
 */
export function billTax(items: BillItem[], gstEnabled: boolean, billDiscount = 0): BillTax {
  const byRate: Record<number, { taxable: number; tax: number }> = {};
  let taxable = 0;
  let tax = 0;
  if (gstEnabled) {
    const nets = items.map((it) => Math.max(0, it.price * it.qty - (it.discount || 0)));
    const shares = allocateDiscount(nets, billDiscount);
    for (const [i, it] of items.entries()) {
      const rate = Number(it.gstRate) || 0;
      const { taxable: tv, tax: tx } = lineTax(nets[i] - shares[i], rate);
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
