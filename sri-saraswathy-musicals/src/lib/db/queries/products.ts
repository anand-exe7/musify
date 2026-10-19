import { and, asc, desc, eq, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, type ProductRow } from "@/lib/db/schema";
import { selectProduct, selectProducts, insertVariants, attachVariants } from "./variants";
import { BRANCH_KEYS, variantStock, variantStockAt } from "@/lib/stock";
import { resolveGstColumns } from "@/lib/gst/applicability";
import { HttpError } from "@/lib/api/errors";
import { isForeignKeyViolation } from "./_util";
import type { BranchStock, Category, Origin, Product, ProductVariant } from "@/types";

/** Turn a DB variant (per-branch buckets, possibly legacy `stock`) into the
 *  storefront-facing shape: a single summed `stock` count across every branch. */
function toStorefrontVariants(vs: ProductRow["variants"]): ProductVariant[] {
  return (vs ?? []).map((v) => ({
    id: v.id,
    attr: v.attr,
    finish: v.finish,
    price: v.price,
    weight: v.weight,
    stock: variantStock(v),
    stockByBranch: Object.fromEntries(BRANCH_KEYS.map((b) => [b, variantStockAt(v, b)])),
    disabled: v.disabled,
    photo: v.photo ?? undefined,
  }));
}

/** Enabled variants' stock, split by store. */
function availableByBranch(variants: ProductRow["variants"]): BranchStock {
  const live = (variants ?? []).filter((v) => !v.disabled);
  return Object.fromEntries(BRANCH_KEYS.map((b) => [b, live.reduce((n, v) => n + variantStockAt(v, b), 0)]));
}

/** On-hand available to the storefront = sum of enabled variants' stock. */
function availableStock(variants: ProductRow["variants"]): number {
  return (variants ?? [])
    .filter((v) => !v.disabled)
    .reduce((n, v) => n + variantStock(v), 0);
}

/** The photo a product shows when it has none of its own: its first variant's photo (enabled variants first). */
export function firstVariantPhoto(variants: ProductRow["variants"]): string | undefined {
  const list = variants ?? [];
  return (list.find((v) => !v.disabled && v.photo) ?? list.find((v) => v.photo))?.photo ?? undefined;
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
    stockByBranch: availableByBranch(r.variants),
    variants: toStorefrontVariants(r.variants),
    rating: r.rating,
    reviews: r.reviews,
    tagline: r.tagline,
    description: r.description,
    specs: r.specs,
    features: r.features,
    images: r.images,
    // No main photo → the first variant's photo stands in for it (the stored product is left as it is)
    photo: r.photo || (r.photos && r.photos.length > 0 ? undefined : firstVariantPhoto(r.variants)),
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
    ...resolveGstColumns(p),
    hsn: p.hsn,
    rating: p.rating,
    reviews: p.reviews,
    tagline: p.tagline,
    description: p.description,
    specs: p.specs,
    features: p.features,
    images: p.images,
    photo: p.photo || null,
    photos: p.photos && p.photos.length > 0 ? p.photos : null,
    featured: p.featured ?? false,
    bestSeller: p.bestSeller ?? false,
    isNew: p.new ?? false,
  };
}

/* ─────────────────────────────  Reads  ─────────────────────────────── */

/** Every product, active or not — for server-side pricing/lookups (orders,
 *  invoices, email) that must resolve a product even after it's been hidden. */
export async function getAllProducts(): Promise<Product[]> {
  return (await selectProducts()).map(toProduct);
}

/** What server-side pricing needs per product: money, tax flags and the RAW
 *  variants (with per-branch stock), which `toProduct` flattens away. */
export interface PricingProduct {
  id: string;
  name: string;
  brand: string;
  hsn: string;
  price: number;
  /** `null` ⇒ exempt (non-GST). */
  gstRate: number | null;
  isGstApplicable: boolean;
  variants: ProductRow["variants"];
}

export async function getPricingCatalog(): Promise<PricingProduct[]> {
  const rows = await selectProducts();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    hsn: r.hsn,
    price: r.price,
    gstRate: r.gstRate ?? null,
    isGstApplicable: r.isGstApplicable,
    variants: r.variants ?? [],
  }));
}

/** Only products the storefront should show (the `active` kill switch). */
export async function getStorefrontProducts(): Promise<Product[]> {
  return (await selectProducts(eq(products.active, true))).map(toProduct);
}

/* ─────────────────────────  One page of the shop  ───────────────────────── */

export const SHOP_SORTS = ["featured", "price-asc", "price-desc", "name", "rating"] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export interface ShopPageQuery {
  category?: string;
  origin?: string;
  /** Highest price to show, in paise. */
  maxPrice?: number;
  /** Words to look for in the name, brand or tagline. */
  q?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface ShopPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export const MAX_SHOP_PAGE_SIZE = 60;

/**
 * One page of the storefront: filtered and sorted in the database, so a visitor only ever
 * downloads the products they are looking at. A page past the end is clamped to the last.
 */
export async function getStorefrontPage(q: ShopPageQuery = {}): Promise<ShopPage> {
  const pageSize = Math.min(MAX_SHOP_PAGE_SIZE, Math.max(1, Math.floor(Number(q.pageSize)) || 12));
  const conds = [eq(products.active, true)];
  if (q.category && q.category !== "all") conds.push(eq(products.category, q.category));
  if (q.origin && q.origin !== "all") conds.push(eq(products.origin, q.origin));
  if (Number.isFinite(q.maxPrice) && (q.maxPrice as number) > 0) conds.push(lte(products.price, Math.floor(q.maxPrice as number)));
  const term = (q.q ?? "").trim().slice(0, 80);
  if (term) {
    const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`; // % and _ in what was typed are searched for literally
    conds.push(or(ilike(products.name, like), ilike(products.brand, like), ilike(products.tagline, like), ilike(products.category, like)) as ReturnType<typeof eq>);
  }
  const where = and(...conds);

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(where);
  const total = Number(n);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.floor(Number(q.page)) || 1), pages);

  const order =
    q.sort === "price-asc" ? [asc(products.price)]
    : q.sort === "price-desc" ? [desc(products.price)]
    : q.sort === "name" ? [asc(products.name)]
    : q.sort === "rating" ? [desc(products.rating), asc(products.name)]
    : [desc(products.featured), asc(products.name)];

  const rows = await db.select().from(products).where(where).orderBy(...order, asc(products.id)).limit(pageSize).offset((page - 1) * pageSize);
  return { items: (await attachVariants(rows)).map(toProduct), total, page, pageSize, pages };
}

/** The active products with these ids (a cart, a wishlist). Unknown or hidden ids are simply absent. */
export async function getStorefrontProductsByIds(ids: string[]): Promise<Product[]> {
  const list = [...new Set(ids.filter((i) => typeof i === "string" && i))].slice(0, MAX_SHOP_PAGE_SIZE * 2);
  if (list.length === 0) return [];
  return (await selectProducts(and(inArray(products.id, list), eq(products.active, true)))).map(toProduct);
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const [row] = await selectProducts(eq(products.slug, slug));
  return row ? toProduct(row) : undefined;
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const row = await selectProduct(id);
  return row ? toProduct(row) : undefined;
}

export async function getProductsByCategory(category: string): Promise<Product[]> {
  return (await selectProducts(and(eq(products.category, category), eq(products.active, true)))).map(toProduct);
}

export async function getFeaturedProducts(): Promise<Product[]> {
  return (await selectProducts(and(eq(products.featured, true), eq(products.active, true)))).map(toProduct);
}

export async function getBestSellers(): Promise<Product[]> {
  return (await selectProducts(and(eq(products.bestSeller, true), eq(products.active, true)))).map(toProduct);
}

/* ─────────────────────────────  Writes  ────────────────────────────── */

export async function createProduct(p: Product): Promise<Product> {
  await db.insert(products).values(toInsertRow(p));
  await insertVariants(
    p.id,
    p.variants && p.variants.length > 0
      ? p.variants
      : [{ attr: "Standard", finish: "", price: p.price, weight: 0, stock: p.stock ?? 0, disabled: false }],
  );
  return (await getProductById(p.id)) as Product;
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
  if (p.gstRate !== undefined || p.isGstApplicable !== undefined) {
    if (p.isGstApplicable === false) {
      Object.assign(values, resolveGstColumns({ isGstApplicable: false }));
    } else if (p.gstRate !== undefined) {
      Object.assign(values, resolveGstColumns({ gstRate: p.gstRate, isGstApplicable: true }));
    } else {
      values.isGstApplicable = true; // flag flipped back on; the stored rate is left alone
    }
  }
  if (p.hsn !== undefined) values.hsn = p.hsn;
  if (p.rating !== undefined) values.rating = p.rating;
  if (p.reviews !== undefined) values.reviews = p.reviews;
  if (p.tagline !== undefined) values.tagline = p.tagline;
  if (p.description !== undefined) values.description = p.description;
  if (p.specs !== undefined) values.specs = p.specs;
  if (p.features !== undefined) values.features = p.features;
  if (p.images !== undefined) values.images = p.images;
  if (p.photo !== undefined) values.photo = p.photo || null;
  if (p.photos !== undefined) values.photos = p.photos && p.photos.length > 0 ? p.photos : null;
  if (p.featured !== undefined) values.featured = p.featured;
  if (p.bestSeller !== undefined) values.bestSeller = p.bestSeller;
  if (p.new !== undefined) values.isNew = p.new;

  if (Object.keys(values).length === 0) return getProductById(id);

  const updated = await db.update(products).set(values).where(eq(products.id, id)).returning({ id: products.id });
  return updated.length > 0 ? getProductById(id) : undefined;
}

export async function deleteProduct(id: string): Promise<boolean> {
  try {
    const rows = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
    return rows.length > 0;
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new HttpError(409, "This product has stock history, so it can't be deleted. Hide it from the storefront instead (set it inactive).");
    }
    throw err;
  }
}
