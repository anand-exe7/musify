export type Category =
  | "string"
  | "keyboard"
  | "wind"
  | "percussion"
  | "indian-classical"
  | "accessories";

export type Origin = "western" | "indian";

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
  stock: number;
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

export interface CartItem {
  productId: string;
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
  branch?: "Branch 1" | "Branch 2";
  items: { productId: string; quantity: number; price: number }[];
  subtotal: number;
  gst: number;
  shipping: number;
  total: number;
  address: string;
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  customer: string;
  branch: "Branch 1" | "Branch 2";
  items: { name: string; hsn: string; qty: number; rate: number; gst: number; amount: number }[];
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
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "admin" | "branch1-manager" | "branch2-manager" | "cashier" | "customer";
  /** `null`/absent = no branch (full admin, or a plain customer). */
  branch?: "Branch 1" | "Branch 2" | null;
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
  outstanding: number;
  totalPurchases: number;
}
