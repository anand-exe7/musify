import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { posBills, products, coupons, posCategories, type ProductRow } from "@/lib/db/schema";
import type { Bill, InvProduct, Coupon } from "@/lib/store/pos";
import { setVariantStockAt, variantStockAt, type Branch } from "@/lib/stock";
import { slugify } from "@/lib/utils";
import { row, rows, definedOnly } from "./_util";

/* ─────────────────────────────  Bills  ─────────────────────────────── */

export async function getBills(): Promise<Bill[]> {
  return rows<Bill>(await db.select().from(posBills).orderBy(desc(posBills.createdAt)));
}

export async function getBill(id: string): Promise<Bill | undefined> {
  const [r] = await db.select().from(posBills).where(eq(posBills.id, id)).limit(1);
  return r ? row<Bill>(r) : undefined;
}

export async function createBill(b: Bill): Promise<Bill> {
  const [r] = await db.insert(posBills).values(b).returning();
  // Decrement stock at the bill's branch for every line that was picked from
  // the catalog (has productId + variantIndex). Freeform lines don't touch it.
  // One product per DB roundtrip keeps this simple — POS bills are short.
  const branch = b.branch as Branch;
  for (const it of b.items) {
    if (!it.productId || typeof it.variantIndex !== "number" || (it.qty ?? 0) <= 0) continue;
    const [prod] = await db.select().from(products).where(eq(products.id, it.productId)).limit(1);
    if (!prod) continue;
    const variants = prod.variants ?? [];
    const v = variants[it.variantIndex];
    if (!v) continue;
    const onHand = variantStockAt(v, branch);
    const nextVariants = variants.map((x, i) =>
      i === it.variantIndex ? setVariantStockAt(x, branch, Math.max(0, onHand - it.qty)) : x,
    );
    await db.update(products).set({ variants: nextVariants }).where(eq(products.id, it.productId));
  }
  return row<Bill>(r);
}

export async function deleteBill(id: string): Promise<boolean> {
  const r = await db.delete(posBills).where(eq(posBills.id, id)).returning({ id: posBills.id });
  return r.length > 0;
}

/* ────────────────────────  Inventory products  ─────────────────────── */
/* Inventory *is* the unified `products` table — the admin and the storefront   */
/* share one row per product. These map between that row and the full           */
/* `InvProduct` model the admin UI works with (`price` ⇄ `basePrice`,           */
/* `isNew` ⇄ `newArrival`).                                                      */

function toInvProduct(r: ProductRow): InvProduct {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    department: r.department,
    slug: r.slug,
    brand: r.brand,
    origin: (r.origin as "indian" | "western") ?? undefined,
    photo: r.photo ?? undefined,
    photos: r.photos ?? undefined,
    images: r.images,
    basePrice: r.price,
    mrp: r.mrp,
    baseWeight: r.baseWeight,
    description: r.description,
    tagline: r.tagline,
    rating: r.rating,
    reviews: r.reviews,
    specs: r.specs,
    features: r.features,
    active: r.active,
    featured: r.featured,
    bestSeller: r.bestSeller,
    discountLabel: r.discountLabel ?? undefined,
    newArrival: r.isNew,
    lowStockAt: r.lowStockAt,
    gstRate: r.gstRate,
    hsn: r.hsn,
    isGstApplicable: r.isGstApplicable,
    cost: r.cost,
    variants: r.variants,
  };
}

/** Build a full insert row for a new product created from the admin form. */
function toInsertRow(p: InvProduct): typeof products.$inferInsert {
  const gstRate = p.gstRate === undefined ? 18 : p.gstRate;
  return {
    id: p.id,
    slug: p.slug?.trim() || `${slugify(p.name || "product")}-${p.id}`,
    name: p.name,
    brand: p.brand ?? "",
    category: p.category,
    origin: p.origin ?? "indian",
    department: p.department ?? "",
    price: p.basePrice ?? 0,
    mrp: p.mrp ?? 0,
    gstRate,
    isGstApplicable: gstRate != null,
    hsn: p.hsn ?? "",
    cost: p.cost ?? 0,
    baseWeight: p.baseWeight ?? 0,
    active: p.active ?? true,
    discountLabel: p.discountLabel ?? null,
    lowStockAt: p.lowStockAt ?? 4,
    rating: p.rating ?? 0,
    reviews: p.reviews ?? 0,
    tagline: p.tagline ?? "",
    description: p.description ?? "",
    specs: p.specs ?? [],
    features: p.features ?? [],
    images: p.images ?? [],
    photo: p.photo ?? null,
    photos: p.photos ?? null,
    featured: p.featured ?? false,
    bestSeller: p.bestSeller ?? false,
    isNew: p.newArrival ?? false,
    variants: p.variants ?? [],
  };
}

/** Translate a partial `InvProduct` patch to unified `products` columns. */
function toColumnPatch(patch: Partial<InvProduct>): Partial<typeof products.$inferInsert> {
  const v: Partial<typeof products.$inferInsert> = {};
  const p = patch;
  if (p.slug !== undefined) v.slug = p.slug;
  if (p.name !== undefined) v.name = p.name;
  if (p.brand !== undefined) v.brand = p.brand;
  if (p.category !== undefined) v.category = p.category;
  if (p.origin !== undefined) v.origin = p.origin;
  if (p.department !== undefined) v.department = p.department;
  if (p.basePrice !== undefined) v.price = p.basePrice;
  if (p.mrp !== undefined) v.mrp = p.mrp;
  if (p.gstRate !== undefined) {
    v.gstRate = p.gstRate;
    v.isGstApplicable = p.gstRate != null;
  }
  if (p.isGstApplicable !== undefined && p.gstRate === undefined) v.isGstApplicable = p.isGstApplicable;
  if (p.hsn !== undefined) v.hsn = p.hsn;
  if (p.cost !== undefined) v.cost = p.cost;
  if (p.baseWeight !== undefined) v.baseWeight = p.baseWeight;
  if (p.active !== undefined) v.active = p.active;
  if (p.discountLabel !== undefined) v.discountLabel = p.discountLabel ?? null;
  if (p.lowStockAt !== undefined) v.lowStockAt = p.lowStockAt;
  if (p.rating !== undefined) v.rating = p.rating;
  if (p.reviews !== undefined) v.reviews = p.reviews;
  if (p.tagline !== undefined) v.tagline = p.tagline;
  if (p.description !== undefined) v.description = p.description;
  if (p.specs !== undefined) v.specs = p.specs;
  if (p.features !== undefined) v.features = p.features;
  if (p.images !== undefined) v.images = p.images;
  if (p.photo !== undefined) v.photo = p.photo ?? null;
  if (p.photos !== undefined) v.photos = p.photos ?? null;
  if (p.featured !== undefined) v.featured = p.featured;
  if (p.bestSeller !== undefined) v.bestSeller = p.bestSeller;
  if (p.newArrival !== undefined) v.isNew = p.newArrival;
  if (p.variants !== undefined) v.variants = p.variants;
  return v;
}

export async function getInventory(): Promise<InvProduct[]> {
  return (await db.select().from(products)).map(toInvProduct);
}

export async function createInventoryProduct(p: InvProduct): Promise<InvProduct> {
  const [r] = await db.insert(products).values(toInsertRow(p)).returning();
  return toInvProduct(r);
}

export async function updateInventoryProduct(
  id: string,
  patch: Partial<InvProduct>,
): Promise<InvProduct | undefined> {
  const set = toColumnPatch(patch);
  if (Object.keys(set).length === 0) {
    const [r] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    return r ? toInvProduct(r) : undefined;
  }
  const [r] = await db.update(products).set(set).where(eq(products.id, id)).returning();
  return r ? toInvProduct(r) : undefined;
}

export async function deleteInventoryProduct(id: string): Promise<boolean> {
  const r = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
  return r.length > 0;
}

/* ─────────────────────────────  Coupons  ───────────────────────────── */

export async function getCoupons(): Promise<Coupon[]> {
  return rows<Coupon>(await db.select().from(coupons));
}

export async function upsertCoupon(c: Coupon): Promise<Coupon> {
  const [r] = await db
    .insert(coupons)
    .values(c)
    .onConflictDoUpdate({ target: coupons.code, set: c })
    .returning();
  return row<Coupon>(r);
}

export async function updateCoupon(
  code: string,
  patch: Partial<Coupon>,
): Promise<Coupon | undefined> {
  const set = definedOnly(patch) as Partial<typeof coupons.$inferInsert>;
  if (Object.keys(set).length === 0) {
    const [r] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
    return r ? row<Coupon>(r) : undefined;
  }
  const [r] = await db.update(coupons).set(set).where(eq(coupons.code, code)).returning();
  return r ? row<Coupon>(r) : undefined;
}

export async function deleteCoupon(code: string): Promise<boolean> {
  const r = await db.delete(coupons).where(eq(coupons.code, code)).returning({ code: coupons.code });
  return r.length > 0;
}

/* ────────────────────────  POS category labels  ────────────────────── */

export async function getPosCategories(): Promise<string[]> {
  const r = await db.select().from(posCategories);
  return r.map((x) => x.name);
}

export async function addPosCategory(name: string): Promise<void> {
  await db.insert(posCategories).values({ name }).onConflictDoNothing();
}

export async function deletePosCategory(name: string): Promise<boolean> {
  const r = await db.delete(posCategories).where(eq(posCategories.name, name)).returning({ name: posCategories.name });
  return r.length > 0;
}
