/**
 * Drizzle schema — the single source of truth for the Neon (Postgres) database.
 *
 * Design notes
 * ────────────
 * • Column *property* names match the app's TypeScript types in `@/types` and
 *   the Zustand stores, so query results map back to the frontend shapes with
 *   little to no translation. The underlying SQL column names are snake_case.
 * • Embedded arrays/objects the app treats as a unit (a product's `specs`, an
 *   order's `items`, a ticket's `events`, an inventory product's `variants`)
 *   are stored as `jsonb` rather than normalised into child tables. This keeps
 *   the schema faithful to how the app already models the data.
 * • Date/time fields are kept as `text` and round-tripped verbatim — the app
 *   stores a mix of ISO strings and display-formatted strings and feeds them
 *   straight into the UI, so preserving the exact string avoids reformatting.
 * • Money is stored in whole rupees as `integer` (the app never uses paise).
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";

/* ─────────────────────────────  Catalog  ───────────────────────────── */

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  category: text("category").notNull(),
  origin: text("origin").notNull(),
  price: integer("price").notNull(),
  mrp: integer("mrp").notNull(),
  gstRate: integer("gst_rate").notNull(),
  hsn: text("hsn").notNull(),
  stock: integer("stock").notNull().default(0),
  rating: doublePrecision("rating").notNull().default(0),
  reviews: integer("reviews").notNull().default(0),
  tagline: text("tagline").notNull().default(""),
  description: text("description").notNull().default(""),
  specs: jsonb("specs").$type<{ label: string; value: string }[]>().notNull().default([]),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  photo: text("photo"),
  photos: jsonb("photos").$type<string[]>(),
  featured: boolean("featured").notNull().default(false),
  bestSeller: boolean("best_seller").notNull().default(false),
  isNew: boolean("is_new").notNull().default(false),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default(""),
  count: integer("count").notNull().default(0),
  icon: text("icon").notNull().default(""),
  photo: text("photo").notNull().default(""),
});

/* ─────────────────────────────  People  ────────────────────────────── */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  role: text("role").notNull(),
  branch: text("branch"),
  active: boolean("active").notNull().default(true),
  /** Authoritative admin flag — `true` grants access to the `/admin` area. */
  isAdmin: boolean("is_admin").notNull().default(false),
  /** Google account subject id (OAuth `sub`), set the first time they sign in. */
  googleId: text("google_id"),
  avatar: text("avatar"),
  lastLogin: text("last_login").notNull().default(""),
  permissions: jsonb("permissions")
    .$type<{ billing: boolean; inventory: boolean; analytics: boolean; users: boolean }>()
    .notNull()
    .default({ billing: false, inventory: false, analytics: false, users: false }),
});

/** Simpler admin staff roster (see `store/staff.ts`) — kept distinct from `users`. */
export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  active: boolean("active").notNull().default(true),
  branch: text("branch"),
});

/* ─────────────────────────────  Commerce  ──────────────────────────── */

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  status: text("status").notNull(),
  /** The signed-in customer who placed the order (users.id). */
  userId: text("user_id"),
  customerName: text("customer_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  /** Payment provider linkage (Razorpay) — empty for cash-on-delivery. */
  paymentMethod: text("payment_method").notNull().default(""),
  paymentId: text("payment_id").notNull().default(""),
  /** Buyer's place of supply (state) — drives the CGST/SGST vs IGST split. */
  shipState: text("ship_state").notNull().default(""),
  /** Fulfilling branch the customer chose at checkout. */
  branch: text("branch").notNull().default("Branch 1"),
  items: jsonb("items")
    .$type<{ productId: string; quantity: number; price: number }[]>()
    .notNull()
    .default([]),
  subtotal: integer("subtotal").notNull().default(0),
  gst: integer("gst").notNull().default(0),
  shipping: integer("shipping").notNull().default(0),
  total: integer("total").notNull().default(0),
  address: text("address").notNull().default(""),
});

/** GST sales invoices (see `data/invoices.ts`). */
export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  date: text("date").notNull(),
  customer: text("customer").notNull(),
  branch: text("branch").notNull(),
  items: jsonb("items")
    .$type<{ name: string; hsn: string; qty: number; rate: number; gst: number; amount: number }[]>()
    .notNull()
    .default([]),
  subtotal: integer("subtotal").notNull().default(0),
  cgst: integer("cgst").notNull().default(0),
  sgst: integer("sgst").notNull().default(0),
  /** Inter-state tax (used for online orders shipped outside the home state). */
  igst: integer("igst").notNull().default(0),
  total: integer("total").notNull().default(0),
  paymentMode: text("payment_mode").notNull(),
  status: text("status").notNull(),
  /** Where the sale originated: "web" (storefront), "pos" (counter), or "manual". */
  source: text("source").notNull().default("manual"),
  /** Link back to the source order/bill id. */
  refId: text("ref_id").notNull().default(""),
});

export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  gst: text("gst").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  outstanding: integer("outstanding").notNull().default(0),
  totalPurchases: integer("total_purchases").notNull().default(0),
});

/* ─────────────────────────  POS / inventory  ───────────────────────── */

/** Point-of-sale bills (see `store/pos.ts`). */
export const posBills = pgTable("pos_bills", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  customerName: text("customer_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  source: text("source").notNull(),
  branch: text("branch").notNull(),
  items: jsonb("items")
    .$type<{ name: string; price: number; qty: number }[]>()
    .notNull()
    .default([]),
  subtotal: integer("subtotal").notNull().default(0),
  coupon: text("coupon"),
  discount: integer("discount").notNull().default(0),
  delivery: integer("delivery").notNull().default(0),
  total: integer("total").notNull().default(0),
  status: text("status").notNull(),
  payment: text("payment"),
});

/** Rich inventory product with variants (see `store/pos.ts` — `InvProduct`). */
export const inventoryProducts = pgTable("inventory_products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  department: text("department").notNull().default(""),
  photo: text("photo"),
  basePrice: integer("base_price").notNull().default(0),
  baseWeight: integer("base_weight").notNull().default(0),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  discountLabel: text("discount_label"),
  newArrival: boolean("new_arrival").notNull().default(false),
  lowStockAt: integer("low_stock_at").notNull().default(4),
  variants: jsonb("variants")
    .$type<
      { attr: string; finish: string; price: number; weight: number; stock: number; disabled?: boolean }[]
    >()
    .notNull()
    .default([]),
});

export const coupons = pgTable("coupons", {
  code: text("code").primaryKey(),
  discountPct: integer("discount_pct").notNull().default(0),
  minOrder: integer("min_order").notNull().default(0),
  expiry: text("expiry").notNull().default(""),
  usageLimit: integer("usage_limit").notNull().default(0),
  remaining: integer("remaining").notNull().default(0),
});

/** Free-form POS category labels (see `store/pos.ts` — `categories`). */
export const posCategories = pgTable("pos_categories", {
  name: text("name").primaryKey(),
});

/* ─────────────────────────────  Service  ───────────────────────────── */

export const repairTickets = pgTable("repair_tickets", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  productName: text("product_name").notNull(),
  category: text("category").notNull(),
  brand: text("brand"),
  serial: text("serial"),
  refInvoice: text("ref_invoice"),
  problem: text("problem").notNull().default(""),
  accessories: text("accessories"),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  branch: text("branch").notNull(),
  technician: text("technician"),
  deadline: text("deadline").notNull(),
  estimate: integer("estimate").notNull().default(0),
  finalCost: integer("final_cost").notNull().default(0),
  advance: integer("advance").notNull().default(0),
  gstRate: integer("gst_rate").notNull().default(18),
  events: jsonb("events").$type<{ at: string; label: string }[]>().notNull().default([]),
  whatsappSentAt: text("whatsapp_sent_at"),
  completedAt: text("completed_at"),
  invoiceNo: text("invoice_no"),
});

export const inquiries = pgTable("inquiries", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  topic: text("topic").notNull(),
  productInterest: text("product_interest"),
  message: text("message").notNull().default(""),
  status: text("status").notNull().default("new"),
  branch: text("branch"),
});

/* ─────────────────────────  Settings (config)  ─────────────────────── */

/** Single-row GST configuration (see `store/gst.ts`). Row id is `"default"`. */
export const gstSettings = pgTable("gst_settings", {
  id: text("id").primaryKey().default("default"),
  homeState: text("home_state").notNull().default("Tamil Nadu"),
  cgstLabel: text("cgst_label").notNull().default("CGST"),
  sgstLabel: text("sgst_label").notNull().default("SGST"),
  igstLabel: text("igst_label").notNull().default("IGST"),
  standardRate: integer("standard_rate").notNull().default(18),
  placeOfSupplyEnabled: boolean("place_of_supply_enabled").notNull().default(true),
});

/** Single-row delivery configuration (see `store/settings.ts`). Row id is `"default"`. */
export const deliverySettings = pgTable("delivery_settings", {
  id: text("id").primaryKey().default("default"),
  freeThreshold: integer("free_threshold").notNull().default(25000),
  standardCharge: integer("standard_charge").notNull().default(250),
  expressCharge: integer("express_charge").notNull().default(600),
  storePickup: boolean("store_pickup").notNull().default(true),
});

export const deliveryZones = pgTable("delivery_zones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  charge: integer("charge").notNull().default(0),
  eta: text("eta").notNull().default(""),
});

/** Named integer counters for server-generated sequences (e.g. service-invoice serial). */
export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

/* ─────────────────────────  Inferred row types  ────────────────────── */

export type ProductRow = typeof products.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type StaffRow = typeof staff.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type VendorRow = typeof vendors.$inferSelect;
export type PosBillRow = typeof posBills.$inferSelect;
export type InventoryProductRow = typeof inventoryProducts.$inferSelect;
export type CouponRow = typeof coupons.$inferSelect;
export type RepairTicketRow = typeof repairTickets.$inferSelect;
export type InquiryRow = typeof inquiries.$inferSelect;
export type GstSettingsRow = typeof gstSettings.$inferSelect;
export type DeliverySettingsRow = typeof deliverySettings.$inferSelect;
export type DeliveryZoneRow = typeof deliveryZones.$inferSelect;
