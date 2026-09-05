"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { products as seedCatalog } from "@/lib/data/products";

/* ─────────────────────────────  Types  ───────────────────────────── */

export type Branch = "Branch 1" | "Branch 2";
export type BranchFilter = Branch | "all";
export type Source = "offline" | "online";

export interface BillItem {
  name: string;
  price: number;
  qty: number;
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
  status: "completed" | "pending";
  payment?: string;
}

export interface Variant {
  attr: string; // e.g. size / model
  finish: string; // e.g. colour / wood
  price: number;
  weight: number;
  stock: number;
  disabled?: boolean;
}

export interface InvProduct {
  id: string;
  name: string;
  category: string; // display label
  department: string;
  photo?: string;
  basePrice: number;
  baseWeight: number;
  description: string;
  active: boolean; // shown to customers
  discountLabel?: string;
  newArrival?: boolean;
  lowStockAt: number;
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

/* ─────────────────────────────  Seeds  ───────────────────────────── */

const CATEGORY_LABEL: Record<string, string> = {
  "indian-classical": "Indian Classical",
  string: "Strings",
  keyboard: "Keyboards",
  percussion: "Percussion",
  wind: "Wind",
  accessories: "Accessories",
};

function seedProducts(): InvProduct[] {
  return seedCatalog.map((p, i) => {
    // Split the catalog stock across one or two variants for realism.
    const twoWay = i % 3 === 0 && p.stock > 4;
    const variants: Variant[] = twoWay
      ? [
          { attr: "Standard", finish: "Natural", price: p.price, weight: 1400, stock: Math.ceil(p.stock / 2) },
          { attr: "Deluxe", finish: "Rosewood", price: p.price + 2500, weight: 1600, stock: Math.floor(p.stock / 2) },
        ]
      : [{ attr: "Standard", finish: "Natural", price: p.price, weight: 1400, stock: p.stock }];
    return {
      id: p.id,
      name: p.name,
      category: CATEGORY_LABEL[p.category] ?? p.category,
      department: p.origin === "indian" ? "Indian" : "Western",
      photo: p.photo,
      basePrice: p.price,
      baseWeight: 1400,
      description: p.description,
      active: true,
      discountLabel: p.mrp > p.price ? "In-store offer" : undefined,
      newArrival: p.new,
      lowStockAt: 4,
      variants,
    };
  });
}

function iso(dateStr: string) {
  return new Date(dateStr).toISOString();
}

function seedBills(): Bill[] {
  // Music-themed sample ledger spread across 2026 so period filters have data.
  return [
    {
      id: "INV-2026-QNXVYKMC", createdAt: iso("2026-08-28T11:20:00"), customerName: "Bala Music Academy", phone: "9784562309",
      source: "online", branch: "Branch 1",
      items: [{ name: "Saraswathi Veena", price: 42500, qty: 1 }, { name: "Bansuri Set (5 keys)", price: 8500, qty: 1 }],
      subtotal: 51000, coupon: "VIP20", discount: 10200, delivery: 250, total: 41050, status: "completed", payment: "Razorpay",
    },
    {
      id: "INV-2026-3H6EGZ", createdAt: iso("2026-08-23T15:10:00"), customerName: "Vignesh Kumar", phone: "7894561238",
      source: "offline", branch: "Branch 2",
      items: [{ name: "Concert Tabla Set", price: 18500, qty: 1 }], subtotal: 18500, coupon: "LUXURY15", discount: 1500, delivery: 100, total: 17100, status: "completed", payment: "Cash",
    },
    {
      id: "INV-2026-X47P6K2V", createdAt: iso("2026-08-23T12:05:00"), customerName: "Chennai Music College", phone: "9784562309",
      source: "online", branch: "Branch 1",
      items: [{ name: "Kanailal Sitar", price: 68000, qty: 1 }], subtotal: 68000, coupon: "SARASWATHY10", discount: 6800, delivery: 250, total: 61450, status: "completed", payment: "Razorpay",
    },
    {
      id: "INV-2026-BZ964Y", createdAt: iso("2026-08-23T10:00:00"), customerName: "Meera Nair", phone: "7904199050",
      source: "offline", branch: "Branch 1",
      items: [{ name: "3-Reed Scale-Changer Harmonium", price: 34500, qty: 1 }], subtotal: 34500, discount: 0, delivery: 0, total: 34500, status: "completed", payment: "Card",
    },
    {
      id: "INV-2026-32D49J", createdAt: iso("2026-07-19T16:40:00"), customerName: "Rajiv Menon", phone: "7904199050",
      source: "offline", branch: "Branch 2",
      items: [{ name: "Classical Mridangam", price: 14500, qty: 1 }, { name: "Bansuri Set (5 keys)", price: 8500, qty: 1 }], subtotal: 23000, coupon: "SARASWATHY10", discount: 2300, delivery: 0, total: 20700, status: "completed", payment: "UPI",
    },
    {
      id: "INV-2026-T3H53C", createdAt: iso("2026-07-11T13:15:00"), customerName: "Priya Ramesh", phone: "7904199050",
      source: "offline", branch: "Branch 1",
      items: [{ name: "Female Tanpura (4-string)", price: 22000, qty: 1 }], subtotal: 22000, discount: 0, delivery: 0, total: 22000, status: "completed", payment: "Cash",
    },
    {
      id: "INV-2026-3F443RAN", createdAt: iso("2026-06-22T18:30:00"), customerName: "Anand Rao", phone: "9784562309",
      source: "online", branch: "Branch 2",
      items: [{ name: "Yamaha C3X Grand", price: 249000, qty: 1 }], subtotal: 249000, discount: 0, delivery: 250, total: 249250, status: "completed", payment: "Razorpay",
    },
    {
      id: "INV-2026-9KLM2P", createdAt: iso("2026-05-14T14:05:00"), customerName: "Sruthi Layers", phone: "9840012345",
      source: "online", branch: "Branch 1",
      items: [{ name: "Selmer Mark VI Tenor", price: 189000, qty: 1 }], subtotal: 189000, discount: 0, delivery: 250, total: 189250, status: "completed", payment: "Razorpay",
    },
  ];
}

function seedCoupons(): Coupon[] {
  return [
    { code: "SARASWATHY10", discountPct: 10, minOrder: 0, expiry: "31/12/2027", usageLimit: 500, remaining: 498 },
    { code: "LUXURY15", discountPct: 15, minOrder: 10000, expiry: "31/10/2027", usageLimit: 50, remaining: 49 },
    { code: "VIP20", discountPct: 20, minOrder: 20000, expiry: "31/12/2027", usageLimit: 30, remaining: 29 },
  ];
}

/* ─────────────────────────────  Store  ───────────────────────────── */

interface POSState {
  bills: Bill[];
  invProducts: InvProduct[];
  coupons: Coupon[];
  categories: string[];
  branch: BranchFilter;
  activeBranch: Branch; // branch a new POS bill is created for
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

export const usePOS = create<POSState>()(
  persist(
    (set) => ({
      bills: seedBills(),
      invProducts: seedProducts(),
      coupons: seedCoupons(),
      categories: Object.values(CATEGORY_LABEL),
      branch: "all",
      activeBranch: "Branch 1",
      setBranchFilter: (b) => set({ branch: b }),
      setActiveBranch: (b) => set({ activeBranch: b }),
      addBill: (b) => set((s) => ({ bills: [b, ...s.bills] })),
      deleteBill: (id) => set((s) => ({ bills: s.bills.filter((x) => x.id !== id) })),
      updateProduct: (id, patch) =>
        set((s) => ({ invProducts: s.invProducts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      addProduct: (p) => set((s) => ({ invProducts: [p, ...s.invProducts] })),
      deleteProduct: (id) => set((s) => ({ invProducts: s.invProducts.filter((p) => p.id !== id) })),
      addCoupon: (c) => set((s) => ({ coupons: [c, ...s.coupons.filter((x) => x.code !== c.code)] })),
      updateCoupon: (code, patch) =>
        set((s) => ({ coupons: s.coupons.map((c) => (c.code === code ? { ...c, ...patch } : c)) })),
      deleteCoupon: (code) => set((s) => ({ coupons: s.coupons.filter((c) => c.code !== code) })),
      addCategory: (name) =>
        set((s) => (s.categories.includes(name) ? s : { categories: [...s.categories, name] })),
      renameCategory: (from, to) =>
        set((s) => ({
          categories: s.categories.map((c) => (c === from ? to : c)),
          invProducts: s.invProducts.map((p) => (p.category === from ? { ...p, category: to } : p)),
        })),
      deleteCategory: (name) =>
        set((s) => ({ categories: s.categories.filter((c) => c !== name) })),
      resetDemo: () => set({ bills: seedBills(), invProducts: seedProducts(), coupons: seedCoupons(), categories: Object.values(CATEGORY_LABEL) }),
    }),
    { name: "ssm-pos-v1" },
  ),
);

/* ─────────────────────────  Derived helpers  ─────────────────────── */

export function productStock(p: InvProduct): number {
  return p.variants.filter((v) => !v.disabled).reduce((n, v) => n + (Number(v.stock) || 0), 0);
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
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `INV-2026-${s}`;
}
