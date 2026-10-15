export type Category =
  | "string"
  | "keyboard"
  | "wind"
  | "percussion"
  | "indian-classical"
  | "accessories";

export type Origin = "western" | "indian";

/** On-hand at each physical store. */
export type BranchStock = Record<string, number>;

/** A purchasable option under a product (size/finish combo). Money in paise;
 *  `stock` is on-hand across every branch, `stockByBranch` the same split by store. */
export interface ProductVariant {
  /** Durable variant id (absent on legacy/local data). */
  id?: string;
  attr: string;
  finish: string;
  price: number;
  weight: number;
  stock: number;
  stockByBranch?: BranchStock;
  disabled?: boolean;
  /** This variant's own photo, when it has one. */
  photo?: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: Category;
  origin: Origin;
  price: number;
  mrp: number;
  gstRate: number;
  /** When `false`, this product is exempt from GST — checkout adds no tax and
   *  the invoice records the line at rate 0. Defaults to `true` on the schema. */
  isGstApplicable?: boolean;
  hsn: string;
  /** Storefront on-hand = sum of enabled variants' stock. */
  stock: number;
  /** The same total, split by store (enabled variants only). */
  stockByBranch?: BranchStock;
  /** The purchasable options. DB rows always carry this; seed literals may omit it. */
  variants?: ProductVariant[];
  rating: number;
  reviews: number;
  tagline: string;
  description: string;
  specs: { label: string; value: string }[];
  features: string[];
  images: string[]; // SVG keys (fallback)
  photo?: string;    // primary product photograph URL
  photos?: string[]; // gallery URLs
  featured?: boolean;
  bestSeller?: boolean;
  new?: boolean;
}

/** A cart line is identified by (productId, variantKey). One product with two
 *  variants selected shows up as two independent lines. */
export interface CartItem {
  productId: string;
  variantKey: string;
  quantity: number;
}

export interface Order {
  id: string;
  date: string;
  status: "delivered" | "shipped" | "processing" | "cancelled";
  userId?: string | null;
  customerName?: string;
  email?: string;
  phone?: string;
  paymentMethod?: string;
  paymentId?: string;
  shipState?: string;
  branch?: string;
  /** `price` is the GST-inclusive unit price; `gstRate` the rate snapshotted at order time. */
  items: { productId: string; variantKey?: string; variantLabel?: string; quantity: number; price: number; gstRate?: number }[];
  /** Goods total before the coupon, GST-inclusive. */
  subtotal: number;
  /** Coupon discount in paise (0 when none) and its code. */
  discount?: number;
  couponCode?: string | null;
  /** GST contained in the goods total. Orders placed before the inclusive model
   *  carried GST on top instead (total = subtotal + gst + shipping). */
  gst: number;
  shipping: number;
  /** subtotal − discount + shipping. */
  total: number;
  address: string;
}

export interface Invoice {
  id: string;
  /** GST tax-invoice number (SSM/2026-27/0021), sequenced across all branches. */
  number: string;
  /** Customer-facing reference, numbered per branch and year (INV-2026-P0001). */
  reference?: string;
  date: string;
  customer: string;
  branch: string;
  /** `rate` is the GST-inclusive unit price; `mrp` the unit MRP and `discount` the line discount, both paise (optional on older invoices). */
  items: { name: string; hsn: string; qty: number; rate: number; gst: number; amount: number; mrp?: number; discount?: number; instruction?: string }[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst?: number;
  total: number;
  /** cash / card / upi / bank / razorpay / cod — kept open so web + POS methods fit. */
  paymentMode: string;
  status: "paid" | "pending" | "cancelled";
  /** "web" (storefront), "pos" (counter), "service" (repair), or "manual". */
  source?: "web" | "pos" | "service" | "manual";
  /** Link back to the source order/bill id. */
  refId?: string;
  /** Buyer's GSTIN (optional). */
  customerGstin?: string | null;
  /** Buyer's phone (optional). */
  customerPhone?: string | null;
  /** Delivery / shipping charge (paise); part of `total`, excluded from `subtotal`. */
  delivery?: number;
  /** Overall (bill-level) discount in paise, separate from per-line `items[].discount`. */
  discount?: number;
}

export interface QuotationLine {
  name: string;
  hsn: string;
  qty: number;
  /** GST-inclusive unit price (paise). */
  rate: number;
  gst: number;
  /** qty × rate (paise), before the quotation-level discount. */
  amount: number;
  note?: string;
}

export interface Quotation {
  /** Random id, used in the customer share link. */
  id: string;
  /** Per branch and year, e.g. QT-2026-V0001. */
  number: string;
  date: string;
  validUntil: string;
  customer: string;
  customerPhone?: string | null;
  customerGstin?: string | null;
  branch: string;
  items: QuotationLine[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst?: number;
  discount?: number;
  total: number;
  /** Advance needed to start work / process the order (paise). */
  advance?: number;
  status: "open" | "accepted" | "declined";
  notes?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  /** `null`/absent = no branch (full admin, or a plain customer). */
  branch?: string | null;
  /** All branches a non-admin may work in (first = primary). */
  branchAccess?: string[];
  active: boolean;
  /** Authoritative admin flag — grants access to the `/admin` area. */
  isAdmin: boolean;
  googleId?: string | null;
  avatar?: string | null;
  lastLogin: string;
  permissions: {
    billing: boolean;
    inventory: boolean;
    analytics: boolean;
    users: boolean;
  };
}

export interface Vendor {
  id: string;
  /** Unique lookup code (e.g. "V-001"); optional on legacy rows. */
  code?: string | null;
  name: string;
  gst: string;
  phone: string;
  email: string;
  address?: string;
  createdAt?: string;
}

export interface UserAddress {
  id: string;
  userId: string;
  name: string;
  phone: string;
  /** Label: "home", "office", or custom text */
  type: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
  createdAt: string;
}
