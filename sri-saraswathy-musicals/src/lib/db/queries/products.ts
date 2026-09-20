import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, type ProductRow } from "@/lib/db/schema";
import type { Category, Origin, Product } from "@/types";

/** On-hand available to the storefront = sum of enabled variants' stock. */
function availableStock(variants: ProductRow["variants"]): number {
  return (variants ?? [])
    .filter((v) => !v.disabled)
    .reduce((n, v) => n + (Number(v.stock) || 0), 0);
}

/** Map a unified catalog row to the storefront `Product` shape. Stock is derived
 *  from the variants; a `null` `gstRate` (non-GST product) surfaces as rate 0. */
export function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    brand: r.brand,
    category: r.category as Category,
    origin: r.origin as Origin,
    price: r.price,
    mrp: r.mrp,
    gstRate: r.gstRate ?? 0,
    isGstApplicable: r.isGstApplicable,
    hsn: r.hsn,
    stock: availableStock(r.variants),
    rating: r.rating,
    reviews: r.reviews,
    tagline: r.tagline,
    description: r.description,
    specs: r.specs,
    features: r.features,
    images: r.images,
    photo: r.photo ?? undefined,
    photos: r.photos ?? undefined,
    featured: r.featured,
    bestSeller: r.bestSeller,
    new: r.isNew,
  };
}

/** Map a `Product` to insert columns, synthesising a single default variant that
 *  carries the storefront stock (the unified table keeps on-hand on variants). */
function toInsertRow(p: Product): typeof products.$inferInsert {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category,
    origin: p.origin,
    department: p.origin === "western" ? "Western" : "Indian",
    price: p.price,
    mrp: p.mrp,
    gstRate: p.isGstApplicable === false ? null : p.gstRate,
    isGstApplicable: p.isGstApplicable ?? true,
    hsn: p.hsn,
    rating: p.rating,
    reviews: p.reviews,
    tagline: p.tagline,
    description: p.description,
    specs: p.specs,
    features: p.features,
    images: p.images,
    photo: p.photo ?? null,
    photos: p.photos ?? null,
    featured: p.featured ?? false,
    bestSeller: p.bestSeller ?? false,
    isNew: p.new ?? false,
    variants: [
      { attr: "Standard", finish: "", price: p.price, weight: 0, stock: p.stock ?? 0 },
    ],
  };
}

/* ─────────────────────────────  Reads  ─────────────────────────────── */

/** Every product, active or not — for server-side pricing/lookups (orders,
 *  invoices, email) that must resolve a product even after it's been hidden. */
export async function getAllProducts(): Promise<Product[]> {
  const rows = await db.select().from(products);
  return rows.map(toProduct);
}

/** Only products the storefront should show (the `active` kill switch). */
export async function getStorefrontProducts(): Promise<Product[]> {
  const rows = await db.select().from(products).where(eq(products.active, true));
  return rows.map(toProduct);
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const [row] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  return row ? toProduct(row) : undefined;
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return row ? toProduct(row) : undefined;
}

export async function getProductsByCategory(category: string): Promise<Product[]> {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.category, category), eq(products.active, true)));
  return rows.map(toProduct);
}

export async function getFeaturedProducts(): Promise<Product[]> {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.featured, true), eq(products.active, true)));
  return rows.map(toProduct);
}

export async function getBestSellers(): Promise<Product[]> {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.bestSeller, true), eq(products.active, true)));
  return rows.map(toProduct);
}

/* ─────────────────────────────  Writes  ────────────────────────────── */

export async function createProduct(p: Product): Promise<Product> {
  const [row] = await db.insert(products).values(toInsertRow(p)).returning();
  return toProduct(row);
}

export async function updateProduct(
  id: string,
  patch: Partial<Product>,
): Promise<Product | undefined> {
  // Build a column patch from only the provided fields. `stock` is owned by the
  // variants and is not settable through this storefront-shaped endpoint.
  const values: Partial<typeof products.$inferInsert> = {};
  const p = patch;
  if (p.slug !== undefined) values.slug = p.slug;
  if (p.name !== undefined) values.name = p.name;
  if (p.brand !== undefined) values.brand = p.brand;
  if (p.category !== undefined) values.category = p.category;
  if (p.origin !== undefined) values.origin = p.origin;
  if (p.price !== undefined) values.price = p.price;
  if (p.mrp !== undefined) values.mrp = p.mrp;
  if (p.gstRate !== undefined) values.gstRate = p.gstRate;
  if (p.isGstApplicable !== undefined) values.isGstApplicable = p.isGstApplicable;
  if (p.hsn !== undefined) values.hsn = p.hsn;
  if (p.rating !== undefined) values.rating = p.rating;
  if (p.reviews !== undefined) values.reviews = p.reviews;
  if (p.tagline !== undefined) values.tagline = p.tagline;
  if (p.description !== undefined) values.description = p.description;
  if (p.specs !== undefined) values.specs = p.specs;
  if (p.features !== undefined) values.features = p.features;
  if (p.images !== undefined) values.images = p.images;
  if (p.photo !== undefined) values.photo = p.photo ?? null;
  if (p.photos !== undefined) values.photos = p.photos ?? null;
  if (p.featured !== undefined) values.featured = p.featured;
  if (p.bestSeller !== undefined) values.bestSeller = p.bestSeller;
  if (p.new !== undefined) values.isNew = p.new;

  if (Object.keys(values).length === 0) return getProductById(id);

  const [row] = await db.update(products).set(values).where(eq(products.id, id)).returning();
  return row ? toProduct(row) : undefined;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const rows = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
  return rows.length > 0;
}
