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
 * • Money is stored as an `integer` number of **paise** (₹1 = 100 paise) so all
 *   arithmetic is exact; UI/`formatINR` convert to rupees for display.
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  doublePrecision,
  jsonb,
  check,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  oneOf,
  BRANCHES,
  INQUIRY_BRANCHES,
  USER_ROLES,
  STAFF_ROLES,
  ORDER_STATUSES,
  INVOICE_STATUSES,
  QUOTATION_STATUSES,
  INVOICE_SOURCES,
  BILL_STATUSES,
  BILL_SOURCES,
  REPAIR_STATUSES,
  REPAIR_PRIORITIES,
  PAYMENT_MODES,
  INQUIRY_STATUSES,
} from "./vocab";

/* ─────────────────────────────  Catalog  ───────────────────────────── */

/**
 * The single, unified product catalog — the one table the admin dashboard edits
 * and the storefront reads, in real time. It merges what used to be two tables:
 * the marketing/storefront `products` and the POS `inventory_products`. There is
 * no sync step; toggling `active` off hides a product from the storefront at
 * once. Money columns (`price`, `mrp`, `cost`, and `variants[].price`) are paise.
 *
 * `price` is the base selling price (the old inventory `basePrice`). On-hand
 * stock lives on the variants; a product's storefront availability is the sum of
 * its enabled variants' stock.
 */
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  brand: text("brand").notNull().default(""),
  category: text("category").notNull(),
  /** Storefront origin filter: "indian" | "western". */
  origin: text("origin").notNull().default("indian"),
  /** POS grouping label (Indian / Western / Unisex). */
  department: text("department").notNull().default(""),
  /** Base selling price in paise (was inventory `basePrice`). */
  price: integer("price").notNull().default(0),
  /** List price in paise for the strikethrough; 0 or ≤ price means "no MRP". */
  mrp: integer("mrp").notNull().default(0),
  /** Default GST rate (%); `null` marks a **non-GST** (exempt) product. */
  gstRate: integer("gst_rate"),
  /** Derived convenience flag — `true` when the product is taxable. */
  isGstApplicable: boolean("is_gst_applicable").notNull().default(true),
  hsn: text("hsn").notNull().default(""),
  /** Purchase cost per unit in paise, maintained by stock-inward. Drives profit. */
  cost: integer("cost").notNull().default(0),
  baseWeight: integer("base_weight").notNull().default(0),
  /** Storefront kill switch — `false` hides the product from customers. */
  active: boolean("active").notNull().default(true),
  discountLabel: text("discount_label"),
  lowStockAt: integer("low_stock_at").notNull().default(4),
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

/**
 * A purchasable variant of a product. `position` is the 0-based index the app
 * calls `variantIndex` (stock history and POS bill lines record it), so it must
 * stay stable: variants are never silently renumbered or dropped while they hold
 * stock. `id` is the durable identity.
 */
export const productVariants = pgTable("product_variants", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  attr: text("attr").notNull().default(""),
  finish: text("finish").notNull().default(""),
  /** Selling price, paise. */
  price: integer("price").notNull().default(0),
  weight: integer("weight").notNull().default(0),
  /** This variant's own photo (a compressed WebP data URI or a URL). */
  photo: text("photo"),
  disabled: boolean("disabled").notNull().default(false),
}, (t) => [
  index("product_variants_product_idx").on(t.productId, t.position),
  check("product_variants_price_check", sql`${t.price} >= 0`),
]);

/**
 * On-hand units of one variant at one branch. The CHECK makes a negative balance
 * impossible at the database level; writes are single `UPDATE … qty = qty + n`
 * statements, so concurrent sales can't overwrite each other.
 */
export const variantStock = pgTable("variant_stock", {
  variantId: text("variant_id")
    .notNull()
    .references(() => productVariants.id, { onDelete: "cascade" }),
  branch: text("branch")
    .notNull()
    .references(() => branches.id, { onDelete: "restrict" }),
  qty: integer("qty").notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.variantId, t.branch] }),
  check("variant_stock_qty_check", sql`${t.qty} >= 0`),
]);

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
  /** Primary branch — always the first entry of `branchAccess` (kept for display). */
  branch: text("branch"),
  /** Every branch this (non-admin) user may work in. Full admins ignore it. */
  branchAccess: jsonb("branch_access").$type<string[]>().notNull().default([]),
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
}, (t) => [
  check("users_role_check", oneOf(t.role, USER_ROLES)),
  check("users_branch_check", oneOf(t.branch, BRANCHES)),
  uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
]);

/** Saved delivery addresses for a customer account. */
export const userAddresses = pgTable("user_addresses", {
  id: text("id").primaryKey(),
  /** The customer who owns this address (users.id). */
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  /** Label: "home", "office", or custom free text. */
  type: text("type").notNull().default("home"),
  line1: text("line1").notNull().default(""),
  line2: text("line2").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default("Tamil Nadu"),
  pincode: text("pincode").notNull().default(""),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: text("created_at").notNull().default(""),
});

/** Simpler admin staff roster (see `store/staff.ts`) — kept distinct from `users`. */
export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  active: boolean("active").notNull().default(true),
  branch: text("branch"),
}, (t) => [
  check("staff_role_check", oneOf(t.role, STAFF_ROLES)),
  check("staff_branch_check", oneOf(t.branch, BRANCHES)),
]);

/* ─────────────────────────────  Commerce  ──────────────────────────── */

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  status: text("status").notNull(),
  /** The signed-in customer who placed the order (users.id). */
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
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
  /** `price` is the GST-inclusive unit price; `gstRate` the rate snapshotted at
   *  order time (0 = exempt). Orders placed before the inclusive model may lack it. */
  items: jsonb("items")
    .$type<
      {
        productId: string;
        variantKey?: string;
        variantLabel?: string;
        quantity: number;
        price: number;
        gstRate?: number;
      }[]
    >()
    .notNull()
    .default([]),
  /** Goods total before the coupon, GST-inclusive. */
  subtotal: integer("subtotal").notNull().default(0),
  /** Coupon discount in paise, and the code that earned it. */
  discount: integer("discount").notNull().default(0),
  couponCode: text("coupon_code"),
  /** GST *contained* in the goods total (inclusive model). */
  gst: integer("gst").notNull().default(0),
  shipping: integer("shipping").notNull().default(0),
  /** subtotal − discount + shipping. */
  total: integer("total").notNull().default(0),
  address: text("address").notNull().default(""),
  /** Fulfilment details the shop fills in as the order moves on. */
  courier: text("courier").notNull().default(""),
  trackingNo: text("tracking_no").notNull().default(""),
  shippedAt: text("shipped_at"),
  deliveredAt: text("delivered_at"),
}, (t) => [
  check("orders_status_check", oneOf(t.status, ORDER_STATUSES)),
  check("orders_branch_check", oneOf(t.branch, BRANCHES)),
  // One order per online payment. Cash-on-delivery orders carry an empty
  // payment id, so they are excluded from the constraint.
  uniqueIndex("orders_payment_id_unique").on(t.paymentId).where(sql`${t.paymentId} <> ''`),
]);

/**
 * People who have bought from (or had work done by) the shop, recognised by mobile number. One row per number;
 * the name and GSTIN follow the latest bill that gave them. Created and kept up to date by `createInvoice`,
 * so every tax invoice with a valid mobile lands on its customer (`invoices.customer_id`).
 */
export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  /** The 10-digit mobile number (no +91, spaces or dashes) — what identifies the customer. */
  phone: text("phone").notNull(),
  name: text("name").notNull().default(""),
  gstin: text("gstin"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  uniqueIndex("customers_phone_unique").on(t.phone),
]);

/** GST sales invoices (see `data/invoices.ts`). */
export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  /** GST tax-invoice number (SSM/2026-27/0021) — one sequence across all branches. */
  number: text("number").notNull(),
  /** Customer-facing reference, numbered per branch and year (INV-2026-P0001). */
  reference: text("reference").notNull().default(""),
  date: text("date").notNull(),
  customer: text("customer").notNull(),
  branch: text("branch").notNull(),
  items: jsonb("items")
    .$type<{ name: string; hsn: string; qty: number; rate: number; gst: number; amount: number; mrp?: number; discount?: number; instruction?: string }[]>()
    .notNull()
    .default([]),
  subtotal: integer("subtotal").notNull().default(0),
  cgst: integer("cgst").notNull().default(0),
  sgst: integer("sgst").notNull().default(0),
  /** Inter-state tax (used for online orders shipped outside the home state). */
  igst: integer("igst").notNull().default(0),
  total: integer("total").notNull().default(0),
  paymentMode: text("payment_mode").notNull(),
  /** How it was paid: [{ method: "CASH" | "CARD" | "UPI", amount }] in paise. Empty on older invoices. */
  payments: jsonb("payments").$type<{ method: string; amount: number }[]>().notNull().default([]),
  status: text("status").notNull(),
  /** Where the sale originated: "web" (storefront), "pos" (counter), or "manual". */
  source: text("source").notNull().default("manual"),
  /** Link back to the source order/bill id. */
  refId: text("ref_id").notNull().default(""),
  /** Buyer's GSTIN — optional, shown under "Billed To" when present. */
  customerGstin: text("customer_gstin"),
  /** Buyer's phone — shown under "Billed To". */
  customerPhone: text("customer_phone"),
  /** The customer this invoice belongs to (matched on the mobile number); null when it had no valid number. */
  customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
  /** Delivery / shipping charge in paise (untaxed here) — included in `total`, not in `subtotal`. */
  /** Bill-level discount in paise (coupon + manual ₹/%), on top of the per-line discounts. */
  discount: integer("discount").notNull().default(0),
  delivery: integer("delivery").notNull().default(0),
}, (t) => [
  check("invoices_status_check", oneOf(t.status, INVOICE_STATUSES)),
  check("invoices_source_check", oneOf(t.source, INVOICE_SOURCES)),
  check("invoices_branch_check", oneOf(t.branch, BRANCHES)),
  // GST: invoice numbers must be unique.
  uniqueIndex("invoices_number_unique").on(t.number).where(sql`${t.number} <> ''`),
  uniqueIndex("invoices_reference_unique").on(t.reference).where(sql`${t.reference} <> ''`),
  index("invoices_customer_idx").on(t.customerId),
]);

/** Quotations (price offers). Prices are GST-inclusive, like invoices; `number` runs per branch and year (QT-2026-V0001). */
export const quotations = pgTable("quotations", {
  /** Random id used in the customer share link. */
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  date: text("date").notNull(),
  /** Last day the prices hold (30 days from issue by default). */
  validUntil: text("valid_until").notNull(),
  customer: text("customer").notNull(),
  customerPhone: text("customer_phone"),
  customerGstin: text("customer_gstin"),
  branch: text("branch").notNull(),
  items: jsonb("items")
    .$type<{ name: string; hsn: string; qty: number; rate: number; gst: number; amount: number; note?: string; productId?: string; variantKey?: string }[]>()
    .notNull()
    .default([]),
  subtotal: integer("subtotal").notNull().default(0),
  cgst: integer("cgst").notNull().default(0),
  sgst: integer("sgst").notNull().default(0),
  igst: integer("igst").notNull().default(0),
  discount: integer("discount").notNull().default(0),
  total: integer("total").notNull().default(0),
  /** Advance the customer must pay to start the work / process the order (paise). */
  advance: integer("advance").notNull().default(0),
  status: text("status").notNull().default("open"),
  /** The bill/invoice this quotation was turned into (set when status becomes "invoiced"). */
  invoiceId: text("invoice_id"),
  notes: text("notes").notNull().default(""),
}, (t) => [
  check("quotations_status_check", oneOf(t.status, QUOTATION_STATUSES)),
  check("quotations_branch_check", oneOf(t.branch, BRANCHES)),
  uniqueIndex("quotations_number_unique").on(t.number),
]);

export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),
  /** Human-friendly unique vendor code used for quick lookup at stock-inward. */
  code: text("code").unique(),
  name: text("name").notNull(),
  gst: text("gst").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  address: text("address").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
});

/**
 * Purchase header — one receipt from a vendor, with its money fields: the bill
 * total, the GST breakup, the amount paid at the time of receipt (editable
 * later), the payment mode, and the vendor's invoice number. The actual goods
 * lines live in `stock_inward`, which now references this header via
 * `purchase_id`. Subsequent part-payments are recorded in `vendor_payments`.
 *
 * Money columns are paise. `amount_paid` starts at 0 and can be bumped either
 * directly (admin edits the header) or by inserting rows in `vendor_payments`.
 */
export const purchases = pgTable("purchases", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "restrict" }),
  /** Vendor's own invoice/bill number for this receipt (free text). */
  invoiceNo: text("invoice_no").notNull().default(""),
  /** User-chosen purchase date, independent of `createdAt`. ISO yyyy-mm-dd. */
  purchaseDate: text("purchase_date").notNull().default(""),
  subtotal: integer("subtotal").notNull().default(0),
  /** Combined CGST + SGST (or IGST). Editable; splits aren't persisted separately. */
  tax: integer("tax").notNull().default(0),
  cgst: integer("cgst").notNull().default(0),
  sgst: integer("sgst").notNull().default(0),
  igst: integer("igst").notNull().default(0),
  totalAmount: integer("total_amount").notNull().default(0),
  amountPaid: integer("amount_paid").notNull().default(0),
  /** What each branch paid of `amountPaid` ({ "Branch 2": 150000 }). Null on older purchases, which spread it by goods value. */
  paidAllocations: jsonb("paid_allocations").$type<Record<string, number>>(),
  /** Set on an "opening balance" bill (what was owed before this system): the branch that owes it. It has no lines. */
  openingBranch: text("opening_branch"),
  paymentMode: text("payment_mode").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (t) => [
  check("purchases_payment_mode_check", sql`${t.paymentMode} = '' OR ${t.paymentMode} IN ('CASH','UPI','CARD','BANK','OTHER','CREDIT')`),
]);

/**
 * Goods-received log. Each row is one line of a purchase: a quantity of a
 * product received from a vendor into a branch at a point in time, with its
 * purchase cost. Submitting an inward also bumps the inventory on-hand and the
 * product's `cost`. `productName`/`variant` are snapshots for display.
 *
 * `purchaseId` points at the `purchases` header this line belongs to; it's
 * nullable to keep historical rows that pre-date the header table.
 */
export const stockInward = pgTable("stock_inward", {
  id: text("id").primaryKey(),
  purchaseId: text("purchase_id").references(() => purchases.id, { onDelete: "cascade" }),
  vendorId: text("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "restrict" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  productName: text("product_name").notNull().default(""),
  variant: text("variant").notNull().default(""),
  quantity: integer("quantity").notNull().default(0),
  unitCost: integer("unit_cost").notNull().default(0),
  /** GST rate (%) charged on this line by the vendor. */
  gst: integer("gst").notNull().default(0),
  branch: text("branch").notNull(),
  createdBy: text("created_by").notNull().default(""),
  inwardAt: text("inward_at").notNull(),
}, (t) => [
  check("stock_inward_branch_check", oneOf(t.branch, BRANCHES)),
]);

/**
 * Vendor payment ledger. One row per settlement after a purchase is recorded.
 * A payment can be tied to a specific `purchase_id` (reduces that bill's
 * balance) or be an on-account/lump-sum payment (`purchase_id` null — reduces
 * the vendor's overall outstanding). `branch` says whose cash drawer / bank
 * the money came out of, so branch-wise outstandings net correctly.
 */
export const vendorPayments = pgTable("vendor_payments", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "restrict" }),
  purchaseId: text("purchase_id").references(() => purchases.id, { onDelete: "set null" }),
  branch: text("branch").notNull(),
  amount: integer("amount").notNull().default(0),
  mode: text("mode").notNull().default(""),
  reference: text("reference").notNull().default(""),
  paidAt: text("paid_at").notNull(),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (t) => [
  check("vendor_payments_branch_check", oneOf(t.branch, BRANCHES)),
  check("vendor_payments_mode_check", oneOf(t.mode, PAYMENT_MODES)),
]);

/**
 * Inter-branch stock movement (Phase 4). Each row records one variant leaving
 * `fromBranch` and arriving at `toBranch`; the same POST that saves the row
 * also flips the two branch buckets in `products.variants[i].stockByBranch`.
 */
export const stockTransfers = pgTable("stock_transfers", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  productName: text("product_name").notNull().default(""),
  variant: text("variant").notNull().default(""),
  quantity: integer("quantity").notNull().default(0),
  fromBranch: text("from_branch").notNull(),
  toBranch: text("to_branch").notNull(),
  note: text("note").notNull().default(""),
  createdBy: text("created_by").notNull().default(""),
  transferredAt: text("transferred_at").notNull(),
}, (t) => [
  check("stock_transfers_from_branch_check", oneOf(t.fromBranch, BRANCHES)),
  check("stock_transfers_to_branch_check", oneOf(t.toBranch, BRANCHES)),
]);

/**
 * Physical shop branches. The primary key is the branch *key* ("Branch 1" /
 * "Branch 2") that every `branch` text column across the app already stores, so
 * this table is a source of truth (name, address, per-branch GSTIN) without
 * needing to rewrite those columns into UUID foreign keys.
 */
export const branches = pgTable("branches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull().default("Chennai"),
  address: text("address").notNull().default(""),
  /** Per-branch GSTIN; blank falls back to the business-wide GSTIN. */
  gstin: text("gstin").notNull().default(""),
  phone: text("phone").notNull().default(""),
  /** Short letter used in branch-coded document numbers (e.g. "V", "P"). */
  code: text("code").notNull().default(""),
  active: boolean("active").notNull().default(true),
});

/* ─────────────────────────  POS / inventory  ───────────────────────── */

/** Point-of-sale bills (see `store/pos.ts`). */
export const posBills = pgTable("pos_bills", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  customerName: text("customer_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  /** Customer's GSTIN — optional; printed on the invoice. */
  customerGstin: text("customer_gstin"),
  source: text("source").notNull(),
  branch: text("branch").notNull(),
  items: jsonb("items")
    // `gstRate` is the rate (%) snapshotted onto the line at bill time — so a
    // later change to the product's default rate never rewrites history. `null`
    // / absent means the line was billed as non-GST.
    .$type<{ name: string; price: number; qty: number; gstRate?: number | null; hsn?: string; mrp?: number; discount?: number; instruction?: string; productId?: string; variantIndex?: number }[]>()
    .notNull()
    .default([]),
  subtotal: integer("subtotal").notNull().default(0),
  coupon: text("coupon"),
  discount: integer("discount").notNull().default(0),
  delivery: integer("delivery").notNull().default(0),
  total: integer("total").notNull().default(0),
  /** Whether this bill was raised as a GST tax invoice (vs a plain bill). */
  gstEnabled: boolean("gst_enabled").notNull().default(false),
  /** GST-inclusive breakup — taxable value and the tax split it contains. */
  taxable: integer("taxable").notNull().default(0),
  cgst: integer("cgst").notNull().default(0),
  sgst: integer("sgst").notNull().default(0),
  gst: integer("gst").notNull().default(0),
  status: text("status").notNull(),
  payment: text("payment"),
  /** How it was paid: [{ method: "CASH" | "CARD" | "UPI", amount }] in paise. */
  payments: jsonb("payments").$type<{ method: string; amount: number }[]>().notNull().default([]),
}, (t) => [
  check("pos_bills_status_check", oneOf(t.status, BILL_STATUSES)),
  check("pos_bills_source_check", oneOf(t.source, BILL_SOURCES)),
  check("pos_bills_branch_check", oneOf(t.branch, BRANCHES)),
]);

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
  /** Customer's GSTIN — optional; carried onto the service invoice. */
  customerGstin: text("customer_gstin"),
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
  /** Products sold to the customer during the service (billed on the same invoice, on top of the service charge). */
  parts: jsonb("parts").$type<{ id: string; productId?: string; variantIndex?: number; name: string; hsn?: string; qty: number; price: number; gst: number }[]>().notNull().default([]),
  /**
   * The products already taken out of this branch's stock for this ticket. Stock only comes off once the repair is
   * marked Ready (and goes back if it is cancelled, deleted or moved back), so this records exactly what has been
   * taken — the ticket's stock is always brought in line with it, never adjusted twice.
   */
  stockTaken: jsonb("stock_taken").$type<{ id: string; productId?: string; variantIndex?: number; name: string; hsn?: string; qty: number; price: number; gst: number }[]>().notNull().default([]),
  whatsappSentAt: text("whatsapp_sent_at"),
  completedAt: text("completed_at"),
  invoiceNo: text("invoice_no"),
}, (t) => [
  check("repair_tickets_status_check", oneOf(t.status, REPAIR_STATUSES)),
  check("repair_tickets_priority_check", oneOf(t.priority, REPAIR_PRIORITIES)),
  check("repair_tickets_branch_check", oneOf(t.branch, BRANCHES)),
]);

/**
 * Shop expenditures (rent, salaries, stock purchases, utilities …). Money is
 * whole rupees as `integer`, matching the rest of the app. `paymentMode` is one
 * of CASH / UPI / CARD / BANK / OTHER; `category` is free text so custom
 * categories can be added on the fly. `branch` scopes an expense to a shop.
 */
export const expenses = pgTable("expenses", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull().default("Miscellaneous"),
  amount: integer("amount").notNull().default(0),
  paymentMode: text("payment_mode").notNull().default("CASH"),
  notes: text("notes"),
  /** User-facing spend date (supports backdating); a plain date string. */
  expenseDate: text("expense_date").notNull(),
  createdAt: text("created_at").notNull(),
  branch: text("branch").notNull(),
}, (t) => [
  check("expenses_payment_mode_check", oneOf(t.paymentMode, PAYMENT_MODES)),
  check("expenses_branch_check", oneOf(t.branch, BRANCHES)),
]);

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
}, (t) => [
  check("inquiries_status_check", oneOf(t.status, INQUIRY_STATUSES)),
  check("inquiries_branch_check", oneOf(t.branch, INQUIRY_BRANCHES)),
]);

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
  // Money in paise: ₹25,000 free-shipping threshold, ₹250 standard, ₹600 express.
  freeThreshold: integer("free_threshold").notNull().default(2500000),
  standardCharge: integer("standard_charge").notNull().default(25000),
  expressCharge: integer("express_charge").notNull().default(60000),
  storePickup: boolean("store_pickup").notNull().default(true),
});

/**
 * Courier tariff zones. Each row is one destination band with its state list
 * (the ship-state → zone lookup) and the five surface-transit slabs the
 * courier bills at: ≤250 g, ≤500 g, each additional 500 g up to 5 kg, per kg
 * from 5–10 kg, and per kg above 10 kg. All rupees, GST-inclusive.
 * Legacy `charge` is retained as a flat fallback used only when the tier
 * fields are all zero (e.g. an admin-drawn custom zone).
 */
export const deliveryZones = pgTable("delivery_zones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Indian states this zone applies to. Empty = catch-all / rest-of-India. */
  states: jsonb("states").$type<string[]>().notNull().default([]),
  /** Legacy flat rate — kept for backwards-compat; ignored when tier fields are set. */
  charge: integer("charge").notNull().default(0),
  eta: text("eta").notNull().default(""),
  uptoGm250: integer("upto_gm_250").notNull().default(0),
  uptoGm500: integer("upto_gm_500").notNull().default(0),
  perAddl500: integer("per_addl_500").notNull().default(0),
  above5kgPerKg: integer("above_5kg_per_kg").notNull().default(0),
  above10kgPerKg: integer("above_10kg_per_kg").notNull().default(0),
});

/** Named integer counters for server-generated sequences (e.g. service-invoice serial). */
export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

/* ─────────────────────────  Inferred row types  ────────────────────── */

/** A variant with its per-branch stock folded in (what the app works with). */
export type VariantData = Omit<typeof productVariants.$inferSelect, "productId" | "position"> & {
  stockByBranch: Record<string, number>;
};
export type ProductRow = typeof products.$inferSelect & { variants: VariantData[] };
export type CategoryRow = typeof categories.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type StaffRow = typeof staff.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type QuotationRow = typeof quotations.$inferSelect;
export type VendorRow = typeof vendors.$inferSelect;
export type BranchRow = typeof branches.$inferSelect;
export type StockInwardRow = typeof stockInward.$inferSelect;
export type PurchaseRow = typeof purchases.$inferSelect;
export type VendorPaymentRow = typeof vendorPayments.$inferSelect;
export type StockTransferRow = typeof stockTransfers.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type PosBillRow = typeof posBills.$inferSelect;
/** The unified catalog is the single source for inventory too. */
export type InventoryProductRow = ProductRow;
export type CouponRow = typeof coupons.$inferSelect;
export type RepairTicketRow = typeof repairTickets.$inferSelect;
export type InquiryRow = typeof inquiries.$inferSelect;
export type GstSettingsRow = typeof gstSettings.$inferSelect;
export type DeliverySettingsRow = typeof deliverySettings.$inferSelect;
export type DeliveryZoneRow = typeof deliveryZones.$inferSelect;
export type UserAddressRow = typeof userAddresses.$inferSelect;

/**
 * A checkout waiting for its Razorpay payment. Written when the payment starts, so the order can still be
 * recorded if the customer's browser never reports back (the Razorpay webhook finishes it). Removed once the
 * order exists. `draft` is the exact server-priced order the customer was shown.
 */
export const pendingCheckouts = pgTable("pending_checkouts", {
  razorpayOrderId: text("razorpay_order_id").primaryKey(),
  draft: jsonb("draft").$type<Record<string, unknown>>().notNull(),
  createdAt: text("created_at").notNull(),
});
