/**
 * Additively insert a batch of real shop inventory into the unified `products`
 * catalog — WITHOUT clearing anything (unlike `db:seed`). Safe to re-run: any
 * product whose slug already exists in the DB is skipped, so a second run does
 * not create duplicates.
 *
 *   npm run inventory:add
 *
 * The batch (flutes, tambourines, rings, mridangams) is defined inline below.
 * Decisions baked in per the shop owner:
 *   • Prices are the GST-inclusive selling price (the app treats `price` as
 *     inclusive), gstRate 18, isGstApplicable true.
 *   • No MRP / cost data → 0. HSN: 9205 for wind (flutes), 9206 for percussion.
 *   • Weights come from the sheet: `baseWeight` = product-only "in KG",
 *     variant `weight` = packed "Total in KG" (both stored as grams).
 *   • Opening stock is randomised (the sheet gave only the unit "PIECES", no
 *     counts) and split across Branch 1 / Branch 2.
 *
 * Env is loaded from `.env.local` before the DB client is imported (dynamic
 * import), mirroring `seed.ts`, so the connection string is available.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv(); // .env fallback

import { slugify } from "../utils";
import type { Category, Origin } from "@/types";

/** Rupees → integer paise (the app's money unit). */
const P = (rupees: number) => Math.round((Number(rupees) || 0) * 100);
/** Kilograms → integer grams (the app's weight unit). */
const G = (kg: number) => Math.round((Number(kg) || 0) * 1000);
/** Inclusive random integer in [min, max]. */
const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

type SeedItem = {
  name: string;
  category: Category;
  origin: Origin;
  hsn: string;
  /** Selling price in rupees, GST-inclusive. */
  price: number;
  /** Product-only weight in kg ("in KG"). */
  kg: number;
  /** Packed weight in kg ("Total in KG"). */
  totalKg: number;
  /** Opening-stock range [min, max] for the randomiser. */
  stock: [number, number];
};

/* ── Batch source (mirrors the owner's sheet) ─────────────────────────── */

const wind = (name: string): SeedItem => ({
  name,
  category: "wind",
  origin: "indian",
  hsn: "9205",
  price: 600,
  kg: 0.3,
  totalKg: 0.8,
  stock: [8, 30],
});

const FLUTE_SIZES = ["1", "1 1/2", "2", "2 1/2", "3", "4", "4 1/2", "5", "5 1/2", "6"];

const items: SeedItem[] = [
  ...FLUTE_SIZES.map((s) => wind(`Flute 6 Holes ${s}`)),
  ...FLUTE_SIZES.map((s) => wind(`Flute 8 Holes ${s}`)),

  { name: 'Tambourine 8"', category: "percussion", origin: "western", hsn: "9206", price: 350, kg: 0.3, totalKg: 0.55, stock: [6, 20] },
  { name: 'Tambourine 10"', category: "percussion", origin: "western", hsn: "9206", price: 450, kg: 0.3, totalKg: 0.55, stock: [6, 20] },
  { name: 'Tambourine 12"', category: "percussion", origin: "western", hsn: "9206", price: 550, kg: 0.45, totalKg: 0.7, stock: [6, 20] },

  { name: 'Ring 8"', category: "percussion", origin: "western", hsn: "9206", price: 200, kg: 0.25, totalKg: 0.5, stock: [8, 25] },
  { name: 'Ring 10"', category: "percussion", origin: "western", hsn: "9206", price: 250, kg: 0.25, totalKg: 0.5, stock: [8, 25] },
  { name: 'Ring 12"', category: "percussion", origin: "western", hsn: "9206", price: 300, kg: 0.25, totalKg: 0.5, stock: [8, 25] },

  { name: 'Mridangam Wood 18"', category: "percussion", origin: "indian", hsn: "9206", price: 10500, kg: 5, totalKg: 8, stock: [1, 5] },
  { name: 'Mridangam Wood 22"', category: "percussion", origin: "indian", hsn: "9206", price: 15500, kg: 5, totalKg: 8, stock: [1, 5] },
  { name: 'Mridangam Wood 24"', category: "percussion", origin: "indian", hsn: "9206", price: 17500, kg: 5, totalKg: 8, stock: [1, 4] },
  { name: 'Mridangam Fiber 18"', category: "percussion", origin: "indian", hsn: "9206", price: 9500, kg: 0, totalKg: 0, stock: [1, 5] },
  { name: 'Mridangam Fiber 22"', category: "percussion", origin: "indian", hsn: "9206", price: 12500, kg: 0, totalKg: 0, stock: [1, 5] },
];

/* ── Runner ───────────────────────────────────────────────────────────── */

async function main() {
  const { db } = await import("./index");
  const { products } = await import("./schema");

  // Skip anything already present (idempotent re-runs); collect existing slugs.
  const existing = new Set((await db.select({ slug: products.slug }).from(products)).map((r) => r.slug));

  const rows: (typeof products.$inferInsert)[] = [];
  const skipped: string[] = [];
  let n = 0;

  for (const it of items) {
    const slug = slugify(it.name);
    if (existing.has(slug)) {
      skipped.push(it.name);
      continue;
    }
    existing.add(slug); // guard against dupes within this same batch too

    const total = rnd(it.stock[0], it.stock[1]);
    const stockByBranch = { "Branch 1": Math.ceil(total / 2), "Branch 2": Math.floor(total / 2) } as const;

    rows.push({
      id: `p${Date.now()}${(n++).toString().padStart(2, "0")}`,
      slug,
      name: it.name,
      brand: "",
      category: it.category,
      origin: it.origin,
      department: it.origin === "western" ? "Western" : "Indian",
      price: P(it.price),
      mrp: 0,
      gstRate: 18,
      isGstApplicable: true,
      hsn: it.hsn,
      cost: 0,
      baseWeight: G(it.kg),
      active: true,
      lowStockAt: 4,
      tagline: "",
      description: "",
      specs: [],
      features: [],
      images: [],
      variants: [
        { attr: "Standard", finish: "Natural", price: P(it.price), weight: G(it.totalKg), stockByBranch: { ...stockByBranch } },
      ],
    });
  }

  if (rows.length > 0) {
    await db.insert(products).values(rows);
  }

  console.log(`✓ Inserted ${rows.length} product(s).`);
  if (skipped.length > 0) {
    console.log(`↷ Skipped ${skipped.length} already present: ${skipped.join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Add-inventory failed:", err);
    process.exit(1);
  });
