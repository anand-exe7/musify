/**
 * Seed the Neon database with the app's demo data.
 *
 *   npm run db:seed
 *
 * Idempotent: every table is cleared and re-inserted, so it can be run
 * repeatedly. Catalog/category/user/invoice/vendor/order data is imported from
 * `src/lib/data/*`; the data that previously lived only in the client Zustand
 * stores (repair tickets, inquiries, POS bills, coupons, staff, settings) is
 * defined inline below so this script has no dependency on client modules.
 *
 * Env is loaded from `.env.local` before the DB client is imported (dynamic
 * import) so the connection string is available when `db/index.ts` evaluates.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv(); // .env fallback

import { products as catalog } from "../data/products";
import { categories as categoryData } from "../data/categories";
import { users as staffUsers, currentUser } from "../data/users";
import { invoices as invoiceData, vendors as vendorData, customerOrders } from "../data/invoices";

const iso = (d: string) => new Date(d).toISOString();

/* ─────────────────────  Derived: inventory products  ───────────────── */

const CATEGORY_LABEL: Record<string, string> = {
  "indian-classical": "Indian Classical",
  string: "Strings",
  keyboard: "Keyboards",
  percussion: "Percussion",
  wind: "Wind",
  accessories: "Accessories",
};

function inventoryFromCatalog() {
  return catalog.map((p, i) => {
    const twoWay = i % 3 === 0 && p.stock > 4;
    const variants = twoWay
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
      photo: p.photo ?? null,
      basePrice: p.price,
      baseWeight: 1400,
      description: p.description,
      active: true,
      discountLabel: p.mrp > p.price ? "In-store offer" : null,
      newArrival: p.new ?? false,
      lowStockAt: 4,
      variants,
    };
  });
}

/* ────────────────────────────  Inline seeds  ───────────────────────── */

const repairSeed = [
  {
    id: "REP-2026-K7QM9", createdAt: iso("2026-09-02T10:15:00"), updatedAt: iso("2026-09-08T16:00:00"),
    customerName: "Bala Music Academy", phone: "9784562309", email: "office@balamusic.in",
    productName: "Saraswathi Veena", category: "Indian Classical", brand: "Kanailal", serial: "VN-2291",
    refInvoice: "INV-2026-7QN42",
    problem: "Two frets loose, buzzing on lower octave. Needs re-waxing and bridge levelling.",
    accessories: "Soft case, tuning key",
    status: "in-progress", priority: "high", branch: "Branch 1", technician: "Ravi Shankar",
    deadline: iso("2026-09-09T18:00:00"),
    estimate: 3500, finalCost: 0, advance: 1000, gstRate: 18,
    events: [
      { at: iso("2026-09-02T10:15:00"), label: "Ticket raised · received at Branch 1" },
      { at: iso("2026-09-03T11:00:00"), label: "Status → Diagnosing" },
      { at: iso("2026-09-05T15:30:00"), label: "Status → In Progress · assigned to Ravi Shankar" },
    ],
    whatsappSentAt: iso("2026-09-02T10:20:00"), completedAt: null, invoiceNo: null,
  },
  {
    id: "REP-2026-M3XT2", createdAt: iso("2026-09-06T12:40:00"), updatedAt: iso("2026-09-09T09:10:00"),
    customerName: "Vignesh Kumar", phone: "7894561238", email: null,
    productName: "Yamaha P-125 Digital Piano", category: "Keyboards", brand: "Yamaha", serial: "YP-88431",
    refInvoice: null,
    problem: "Middle C key sticking, no sound from left speaker.",
    accessories: "Sustain pedal, power adapter",
    status: "awaiting-parts", priority: "normal", branch: "Branch 2", technician: "Karthik M",
    deadline: iso("2026-09-12T18:00:00"),
    estimate: 4200, finalCost: 0, advance: 0, gstRate: 18,
    events: [
      { at: iso("2026-09-06T12:40:00"), label: "Ticket raised · received at Branch 2" },
      { at: iso("2026-09-07T10:00:00"), label: "Status → Diagnosing" },
      { at: iso("2026-09-09T09:10:00"), label: "Status → Awaiting Parts · speaker unit ordered" },
    ],
    whatsappSentAt: null, completedAt: null, invoiceNo: null,
  },
  {
    id: "REP-2026-P9WL4", createdAt: iso("2026-09-08T14:05:00"), updatedAt: iso("2026-09-10T14:05:00"),
    customerName: "Meera Nair", phone: "7904199050", email: null,
    productName: "Cremona Violin 4/4", category: "Strings", brand: "Cremona", serial: "CV-4471",
    refInvoice: null,
    problem: "Sound-post collapsed, one fine tuner stripped. Full re-string requested.",
    accessories: "Bow, rosin, hard case",
    status: "diagnosing", priority: "urgent", branch: "Branch 1", technician: "Deepa Iyer",
    deadline: iso("2026-09-13T18:00:00"),
    estimate: 2800, finalCost: 0, advance: 500, gstRate: 18,
    events: [
      { at: iso("2026-09-08T14:05:00"), label: "Ticket raised · received at Branch 1" },
      { at: iso("2026-09-10T14:05:00"), label: "Status → Diagnosing · assigned to Deepa Iyer" },
    ],
    whatsappSentAt: iso("2026-09-08T14:12:00"), completedAt: null, invoiceNo: null,
  },
  {
    id: "REP-2026-T5RB8", createdAt: iso("2026-09-10T11:20:00"), updatedAt: iso("2026-09-10T11:20:00"),
    customerName: "Chennai Music College", phone: "9840012345", email: "hod@cmc.edu.in",
    productName: "Concert Tabla Set", category: "Percussion", brand: "Bina", serial: null,
    refInvoice: null,
    problem: "Dayan skin torn, needs re-heading and syahi touch-up on both drums.",
    accessories: "Cushion ring set",
    status: "received", priority: "normal", branch: "Branch 2", technician: "Unassigned",
    deadline: iso("2026-09-20T18:00:00"),
    estimate: 5500, finalCost: 0, advance: 0, gstRate: 18,
    events: [{ at: iso("2026-09-10T11:20:00"), label: "Ticket raised · received at Branch 2" }],
    whatsappSentAt: null, completedAt: null, invoiceNo: null,
  },
  {
    id: "REP-2026-C2HN6", createdAt: iso("2026-09-09T16:30:00"), updatedAt: iso("2026-09-11T09:00:00"),
    customerName: "Rajiv Menon", phone: "7904199050", email: null,
    productName: "Selmer Tenor Saxophone", category: "Wind", brand: "Selmer", serial: "SX-7781",
    refInvoice: null,
    problem: "Sticky G# pad, bent key guard. Full pad seal check.",
    accessories: null,
    status: "ready", priority: "high", branch: "Branch 1", technician: "Ravi Shankar",
    deadline: iso("2026-09-14T18:00:00"),
    estimate: 6500, finalCost: 6800, advance: 2000, gstRate: 18,
    events: [
      { at: iso("2026-09-04T16:30:00"), label: "Ticket raised · received at Branch 1" },
      { at: iso("2026-09-06T10:00:00"), label: "Status → In Progress" },
      { at: iso("2026-09-11T09:00:00"), label: "Status → Ready · final cost ₹6,800 · ready for pickup" },
    ],
    whatsappSentAt: iso("2026-09-11T09:05:00"), completedAt: null, invoiceNo: null,
  },
  {
    id: "REP-2026-A8FD1", createdAt: iso("2026-08-20T10:00:00"), updatedAt: iso("2026-08-28T17:00:00"),
    customerName: "Priya Ramesh", phone: "9784562309", email: null,
    productName: "Female Tanpura (4-string)", category: "Indian Classical", brand: "Miraj", serial: "TP-3312",
    refInvoice: null,
    problem: "Jawari worn out, gourd hairline crack sealed.",
    accessories: null,
    status: "completed", priority: "normal", branch: "Branch 1", technician: "Deepa Iyer",
    deadline: iso("2026-08-27T18:00:00"),
    estimate: 4000, finalCost: 4500, advance: 5310, gstRate: 18,
    completedAt: iso("2026-08-28T17:00:00"), invoiceNo: "SER-2026-J4T7Q",
    events: [
      { at: iso("2026-08-20T10:00:00"), label: "Ticket raised · received at Branch 1" },
      { at: iso("2026-08-23T12:00:00"), label: "Status → In Progress" },
      { at: iso("2026-08-27T15:00:00"), label: "Status → Ready" },
      { at: iso("2026-08-28T17:00:00"), label: "Status → Completed · invoice SER-2026-J4T7Q · paid in full" },
    ],
    whatsappSentAt: iso("2026-08-28T17:05:00"),
  },
  {
    id: "REP-2026-B4KP3", createdAt: iso("2026-08-12T13:10:00"), updatedAt: iso("2026-08-19T16:00:00"),
    customerName: "Sruthi Layers", phone: "9840012345", email: null,
    productName: "Roland RD-2000 Stage Piano", category: "Keyboards", brand: "Roland", serial: "RD-9921",
    refInvoice: null,
    problem: "Pitch-bend lever unresponsive, firmware reflash requested.",
    accessories: null,
    status: "completed", priority: "high", branch: "Branch 2", technician: "Karthik M",
    deadline: iso("2026-08-18T18:00:00"),
    estimate: 3200, finalCost: 3200, advance: 3776, gstRate: 18,
    completedAt: iso("2026-08-19T16:00:00"), invoiceNo: "SER-2026-D8M2X",
    events: [
      { at: iso("2026-08-12T13:10:00"), label: "Ticket raised · received at Branch 2" },
      { at: iso("2026-08-15T11:00:00"), label: "Status → In Progress" },
      { at: iso("2026-08-19T16:00:00"), label: "Status → Completed · invoice SER-2026-D8M2X" },
    ],
    whatsappSentAt: null,
  },
  {
    id: "REP-2026-D6JQ7", createdAt: iso("2026-09-01T09:45:00"), updatedAt: iso("2026-09-07T18:00:00"),
    customerName: "Anand Rao", phone: "7894561238", email: null,
    productName: "Kanailal Sitar", category: "Indian Classical", brand: "Kanailal", serial: "ST-1180",
    refInvoice: null,
    problem: "Main bridge (jawari) buzzing, two tarab pegs slipping.",
    accessories: null,
    status: "completed", priority: "normal", branch: "Branch 2", technician: "Suresh Babu",
    deadline: iso("2026-09-07T18:00:00"),
    estimate: 5000, finalCost: 5200, advance: 6136, gstRate: 18,
    completedAt: iso("2026-09-07T18:00:00"), invoiceNo: "SER-2026-R6V9L",
    events: [
      { at: iso("2026-09-01T09:45:00"), label: "Ticket raised · received at Branch 2" },
      { at: iso("2026-09-04T14:00:00"), label: "Status → In Progress" },
      { at: iso("2026-09-07T18:00:00"), label: "Status → Completed · invoice SER-2026-R6V9L" },
    ],
    whatsappSentAt: null,
  },
  {
    id: "REP-2026-E1MZ5", createdAt: iso("2026-09-05T15:00:00"), updatedAt: iso("2026-09-06T10:00:00"),
    customerName: "Lakshmi Venkat", phone: "9884012345", email: null,
    productName: "Fender Stratocaster", category: "Strings", brand: "Fender", serial: "FS-6620",
    refInvoice: null,
    problem: "Output jack crackling — customer withdrew, will service elsewhere.",
    accessories: null,
    status: "cancelled", priority: "low", branch: "Branch 1", technician: "Unassigned",
    deadline: iso("2026-09-15T18:00:00"),
    estimate: 1800, finalCost: 0, advance: 0, gstRate: 18,
    events: [
      { at: iso("2026-09-05T15:00:00"), label: "Ticket raised · received at Branch 1" },
      { at: iso("2026-09-06T10:00:00"), label: "Status → Cancelled · customer withdrew" },
    ],
    whatsappSentAt: null,
  },
];

const inquirySeed = [
  {
    id: "INQ-2026-7GK2P", createdAt: iso("2026-09-10T18:22:00"),
    name: "Anjali Suresh", phone: "9840567123", email: "anjali.s@gmail.com",
    topic: "Product enquiry", productInterest: "Saraswathi Veena",
    message: "Looking for a concert-grade veena for my daughter's arangetram. Do you have Kanailal in stock at Chennai?",
    status: "new", branch: "Branch 1",
  },
  {
    id: "INQ-2026-3MZ9Q", createdAt: iso("2026-09-09T11:05:00"),
    name: "David Fernandes", phone: "9995012388", email: "",
    topic: "Repair & service", productInterest: "Acoustic guitar",
    message: "My Taylor guitar has a lifting bridge. Can you look at it and give an estimate?",
    status: "contacted", branch: "Any",
  },
  {
    id: "INQ-2026-P1LN4", createdAt: iso("2026-09-06T15:40:00"),
    name: "St. Thomas School (Music Dept)", phone: "9884321000", email: "music@stthomas.edu.in",
    topic: "Bulk / institutional order", productInterest: "20 recorders + 5 keyboards",
    message: "We need a quote for our new music lab — 20 recorders and 5 entry-level keyboards. GST invoice required.",
    status: "resolved", branch: "Branch 2",
  },
];

const posBillSeed = [
  {
    id: "INV-2026-Q3XV9", createdAt: iso("2026-08-28T11:20:00"), customerName: "Bala Music Academy", phone: "9784562309",
    source: "online", branch: "Branch 1",
    items: [{ name: "Saraswathi Veena", price: 42500, qty: 1 }, { name: "Bansuri Set (5 keys)", price: 8500, qty: 1 }],
    subtotal: 51000, coupon: "VIP20", discount: 10200, delivery: 250, total: 41050, status: "completed", payment: "Razorpay",
  },
  {
    id: "INV-2026-3H6EG", createdAt: iso("2026-08-23T15:10:00"), customerName: "Vignesh Kumar", phone: "7894561238",
    source: "offline", branch: "Branch 2",
    items: [{ name: "Concert Tabla Set", price: 18500, qty: 1 }], subtotal: 18500, coupon: "LUXURY15", discount: 1500, delivery: 100, total: 17100, status: "completed", payment: "Cash",
  },
  {
    id: "INV-2026-X47P6", createdAt: iso("2026-08-23T12:05:00"), customerName: "Chennai Music College", phone: "9784562309",
    source: "online", branch: "Branch 1",
    items: [{ name: "Kanailal Sitar", price: 68000, qty: 1 }], subtotal: 68000, coupon: "SARASWATHY10", discount: 6800, delivery: 250, total: 61450, status: "completed", payment: "Razorpay",
  },
  {
    id: "INV-2026-BZ964", createdAt: iso("2026-08-23T10:00:00"), customerName: "Meera Nair", phone: "7904199050",
    source: "offline", branch: "Branch 1",
    items: [{ name: "3-Reed Scale-Changer Harmonium", price: 34500, qty: 1 }], subtotal: 34500, coupon: null, discount: 0, delivery: 0, total: 34500, status: "completed", payment: "Card",
  },
  {
    id: "INV-2026-32D49", createdAt: iso("2026-07-19T16:40:00"), customerName: "Rajiv Menon", phone: "7904199050",
    source: "offline", branch: "Branch 2",
    items: [{ name: "Classical Mridangam", price: 14500, qty: 1 }, { name: "Bansuri Set (5 keys)", price: 8500, qty: 1 }], subtotal: 23000, coupon: "SARASWATHY10", discount: 2300, delivery: 0, total: 20700, status: "completed", payment: "UPI",
  },
  {
    id: "INV-2026-T3H53", createdAt: iso("2026-07-11T13:15:00"), customerName: "Priya Ramesh", phone: "7904199050",
    source: "offline", branch: "Branch 1",
    items: [{ name: "Female Tanpura (4-string)", price: 22000, qty: 1 }], subtotal: 22000, coupon: null, discount: 0, delivery: 0, total: 22000, status: "completed", payment: "Cash",
  },
  {
    id: "INV-2026-3F44R", createdAt: iso("2026-06-22T18:30:00"), customerName: "Anand Rao", phone: "9784562309",
    source: "online", branch: "Branch 2",
    items: [{ name: "Yamaha C3X Grand", price: 249000, qty: 1 }], subtotal: 249000, coupon: null, discount: 0, delivery: 250, total: 249250, status: "completed", payment: "Razorpay",
  },
  {
    id: "INV-2026-9KLM2", createdAt: iso("2026-05-14T14:05:00"), customerName: "Sruthi Layers", phone: "9840012345",
    source: "online", branch: "Branch 1",
    items: [{ name: "Selmer Mark VI Tenor", price: 189000, qty: 1 }], subtotal: 189000, coupon: null, discount: 0, delivery: 250, total: 189250, status: "completed", payment: "Razorpay",
  },
];

const couponSeed = [
  { code: "SARASWATHY10", discountPct: 10, minOrder: 0, expiry: "31/12/2027", usageLimit: 500, remaining: 498 },
  { code: "LUXURY15", discountPct: 15, minOrder: 10000, expiry: "31/10/2027", usageLimit: 50, remaining: 49 },
  { code: "VIP20", discountPct: 20, minOrder: 20000, expiry: "31/12/2027", usageLimit: 30, remaining: 29 },
];

const staffSeed = [
  { id: "s1", name: "Cenexa Systems", email: "cenexasystems@gmail.com", role: "Admin", active: true, branch: null },
  { id: "s2", name: "R. Krishnan Naidu", email: "ravi@sarasvathymusicals.com", role: "Admin", active: true, branch: null },
  { id: "s3", name: "Lakshmi Menon", email: "lakshmi.b1@sarasvathymusicals.com", role: "Manager", active: true, branch: "Branch 1" },
  { id: "s4", name: "Suresh Iyer", email: "suresh.b2@sarasvathymusicals.com", role: "Manager", active: true, branch: "Branch 2" },
  { id: "s5", name: "Priya Sundaram", email: "priya.cash@sarasvathymusicals.com", role: "Cashier", active: true, branch: "Branch 1" },
];

// Professional Couriers Chennai — Domestic Surface Transit tariff, effective
// 01.01.2026. Rates are ₹ per parcel, inclusive of GST. Air Transit (OBC),
// Surface Cargo and Pro Premium (express) slabs are deliberately excluded.
const zoneSeed = [
  {
    id: "z-tn",
    name: "Tamil Nadu",
    states: ["Tamil Nadu"],
    charge: 0,
    eta: "1–2 days",
    uptoGm250: 90,
    uptoGm500: 105,
    perAddl500: 40,
    above5kgPerKg: 70,
    above10kgPerKg: 50,
  },
  {
    id: "z-south",
    name: "Kerala · Karnataka · Andhra Pradesh · Telangana",
    states: ["Kerala", "Karnataka", "Andhra Pradesh", "Telangana"],
    charge: 0,
    eta: "3–4 days",
    uptoGm250: 95,
    uptoGm500: 115,
    perAddl500: 45,
    above5kgPerKg: 80,
    above10kgPerKg: 55,
  },
  {
    id: "z-rest",
    name: "Rest of India",
    states: [],
    charge: 0,
    eta: "5–7 days",
    uptoGm250: 95,
    uptoGm500: 115,
    perAddl500: 45,
    above5kgPerKg: 80,
    above10kgPerKg: 55,
  },
];

/* ─────────────────────────────  Runner  ────────────────────────────── */

async function main() {
  const {
    db,
    products,
    categories,
    users,
    staff,
    orders,
    invoices,
    vendors,
    posBills,
    inventoryProducts,
    coupons,
    posCategories,
    repairTickets,
    inquiries,
    gstSettings,
    deliverySettings,
    deliveryZones,
    counters,
  } = await import("./index");

  console.log("Clearing existing rows…");
  await Promise.all([
    db.delete(products),
    db.delete(categories),
    db.delete(users),
    db.delete(staff),
    db.delete(orders),
    db.delete(invoices),
    db.delete(vendors),
    db.delete(posBills),
    db.delete(inventoryProducts),
    db.delete(coupons),
    db.delete(posCategories),
    db.delete(repairTickets),
    db.delete(inquiries),
    db.delete(gstSettings),
    db.delete(deliverySettings),
    db.delete(deliveryZones),
    db.delete(counters),
  ]);

  console.log("Inserting catalog…");
  await db.insert(products).values(
    catalog.map((p) => ({
      id: p.id, slug: p.slug, name: p.name, brand: p.brand, category: p.category, origin: p.origin,
      price: p.price, mrp: p.mrp, gstRate: p.gstRate, hsn: p.hsn, stock: p.stock, rating: p.rating,
      reviews: p.reviews, tagline: p.tagline, description: p.description, specs: p.specs,
      features: p.features, images: p.images, photo: p.photo ?? null, photos: p.photos ?? null,
      featured: p.featured ?? false, bestSeller: p.bestSeller ?? false, isNew: p.new ?? false,
    })),
  );

  await db.insert(categories).values(categoryData.map((c) => ({ ...c })));

  await db.insert(users).values(
    [...staffUsers, currentUser].map((u) => ({
      id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role,
      branch: u.branch ?? null, active: u.active, isAdmin: u.isAdmin,
      googleId: u.googleId ?? null, avatar: u.avatar ?? null,
      lastLogin: u.lastLogin, permissions: u.permissions,
    })),
  );

  await db.insert(staff).values(staffSeed);

  await db.insert(orders).values(customerOrders.map((o) => ({ ...o })));

  await db.insert(invoices).values(invoiceData.map((v) => ({ ...v })));

  await db.insert(vendors).values(vendorData.map((v) => ({ ...v })));

  console.log("Inserting POS / inventory…");
  await db.insert(posBills).values(posBillSeed);
  await db.insert(inventoryProducts).values(inventoryFromCatalog());
  await db.insert(coupons).values(couponSeed);
  await db.insert(posCategories).values(Object.values(CATEGORY_LABEL).map((name) => ({ name })));

  console.log("Inserting service / inquiries…");
  await db.insert(repairTickets).values(repairSeed);
  await db.insert(inquiries).values(inquirySeed);

  console.log("Inserting settings…");
  await db.insert(gstSettings).values({ id: "default" });
  await db.insert(deliverySettings).values({ id: "default" });
  await db.insert(deliveryZones).values(zoneSeed);

  console.log("✓ Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
