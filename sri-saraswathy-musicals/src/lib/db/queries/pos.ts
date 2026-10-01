import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { posBills, products, coupons, posCategories, invoices, type ProductRow } from "@/lib/db/schema";
import type { Bill, InvProduct, Coupon } from "@/lib/store/pos";
import { isBranch, applyStockDeltas, type Branch, type StockDelta, type Variant as StockVariant } from "@/lib/stock";
import { HttpError } from "@/lib/api/errors";
import { adjustProductStock, takeStock, type StockLine } from "@/lib/db/queries/stockOps";
import { slugify } from "@/lib/utils";
import { resolveGstColumns } from "@/lib/gst/applicability";
import { clampPct, evaluateCoupon } from "@/lib/checkout/coupon";
import { row, rows, definedOnly } from "./_util";

/* ─────────────────────────────  Bills  ─────────────────────────────── */

export async function getBills(): Promise<Bill[]> {
  return rows<Bill>(await db.select().from(posBills).orderBy(desc(posBills.createdAt)));
}

export async function getBill(id: string): Promise<Bill | undefined> {
  const [r] = await db.select().from(posBills).where(eq(posBills.id, id)).limit(1);
  return r ? row<Bill>(r) : undefined;
}

/** Catalogue lines on a bill — the ones that move stock. Freeform lines don't. */
function stockLinesOf(b: Bill): StockLine[] {
  return b.items
    .filter((it) => it.productId && typeof it.variantIndex === "number" && (it.qty ?? 0) > 0)
    .map((it) => ({ productId: it.productId as string, variantIndex: it.variantIndex as number, quantity: it.qty }));
}

/**
 * Save a POS bill. Everything that can refuse the sale happens first and is
 * undone if a later step fails: the coupon must still be valid (expiry,
 * redemptions left, minimum), and every catalogue line must be in stock at the
 * bill's branch — a short sale is rejected with a 409, never floored to zero.
 */
export async function createBill(b: Bill): Promise<Bill> {
  if (!isBranch(b.branch)) throw new HttpError(400, `Unknown branch: ${String(b.branch)}`);
  const branch = b.branch;

  // A discount can never exceed what it is taken from.
  for (const it of b.items) {
    if ((it.discount || 0) < 0 || (it.discount || 0) > it.price * it.qty) throw new HttpError(400, `Discount on "${it.name}" can't exceed its price.`);
  }
  const lineNet = b.items.reduce((n, i) => n + i.price * i.qty - (i.discount || 0), 0);
  const lineDisc = b.items.reduce((n, i) => n + (i.discount || 0), 0);
  if ((b.discount || 0) < lineDisc || (b.discount || 0) - lineDisc > lineNet) throw new HttpError(400, "Overall discount can't exceed the bill total.");

  let couponUsed: string | null = null;
  if (b.coupon) {
    const net = b.items.reduce((n, i) => n + Math.max(0, i.price * i.qty - (i.discount || 0)), 0);
    const check = evaluateCoupon(await getCoupon(b.coupon), net);
    if (!check.ok) throw new HttpError(409, check.reason);
    if (!(await consumeCoupon(b.coupon))) throw new HttpError(409, "That coupon has just been fully redeemed.");
    couponUsed = b.coupon;
  }

  let undoStock: (() => Promise<void>) | null = null;
  try {
    ({ undo: undoStock } = await takeStock(stockLinesOf(b), branch));
    const [r] = await db.insert(posBills).values(b).returning();
    return row<Bill>(r);
  } catch (err) {
    if (undoStock) await undoStock();
    if (couponUsed) await releaseCoupon(couponUsed).catch(() => {});
    throw err;
  }
}

/**
 * Delete a POS bill and reverse what it did: the stock it took goes back to the
 * bill's branch, its coupon redemption is returned, and its tax invoice is
 * cancelled (kept, not erased — GST invoice numbers must stay gap-free and a
 * cancelled invoice is excluded from every return).
 */
export async function deleteBill(id: string): Promise<boolean> {
  const bill = await getBill(id);
  if (!bill) return false;
  const gone = await db.delete(posBills).where(eq(posBills.id, id)).returning({ id: posBills.id });
  if (gone.length === 0) return false; // lost a race with another delete — don't restore twice

  if (isBranch(bill.branch)) {
    for (const l of stockLinesOf(bill)) {
      try {
        await adjustProductStock(l.productId, [{ variantIndex: l.variantIndex, branch: bill.branch, delta: l.quantity }]);
      } catch (err) {
        // The product may have been deleted since; the bill is gone either way.
        console.error("[pos] couldn't restore stock for deleted bill", id, l, err);
      }
    }
  }
  if (bill.coupon) await releaseCoupon(bill.coupon).catch(() => {});
  await db.update(invoices).set({ status: "cancelled" }).where(eq(invoices.refId, id));
  return true;
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
    ...resolveGstColumns(p),
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
  if (p.gstRate !== undefined || p.isGstApplicable !== undefined) {
    if (p.isGstApplicable === false || p.gstRate === null) {
      Object.assign(v, resolveGstColumns({ gstRate: null, isGstApplicable: false }));
    } else if (p.gstRate !== undefined) {
      Object.assign(v, resolveGstColumns({ gstRate: p.gstRate, isGstApplicable: true }));
    } else {
      v.isGstApplicable = true; // flag flipped back on; the stored rate is left alone
    }
  }
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

/** A stock figure the editor changed: it saw `from` and wants `to`. */
export interface StockChange {
  variantIndex: number;
  branch: Branch;
  from: number;
  to: number;
}

const EDIT_ATTEMPTS = 6;

/**
 * Save an edit from the product editor.
 *
 * Stock is not the editor's to overwrite: sales and receipts keep changing it
 * while the form is open, so saving the form's stale copy would hand sold units
 * back. When the variants are only being edited (same count as in the database)
 * their stock is taken from the database, and each stock figure the user really
 * changed is applied as the difference they made (`to − from`), on top of
 * whatever the stock is now. The write is a compare-and-swap on `variants`, so
 * a sale that lands mid-save triggers a re-read instead of being lost.
 *
 * Adding or removing a variant re-numbers them, so that (admin-only) case is
 * written as the editor has it.
 */
export async function updateInventoryProduct(
  id: string,
  patch: Partial<InvProduct>,
  stockChanges: StockChange[] = [],
): Promise<InvProduct | undefined> {
  const set = toColumnPatch(patch);
  const deltas: StockDelta[] = stockChanges
    .filter((c) => c.to !== c.from)
    .map((c) => ({ variantIndex: c.variantIndex, branch: c.branch, delta: c.to - c.from }));

  if (patch.variants === undefined && deltas.length === 0) {
    if (Object.keys(set).length === 0) {
      const [r] = await db.select().from(products).where(eq(products.id, id)).limit(1);
      return r ? toInvProduct(r) : undefined;
    }
    const [r] = await db.update(products).set(set).where(eq(products.id, id)).returning();
    return r ? toInvProduct(r) : undefined;
  }

  for (let attempt = 0; attempt < EDIT_ATTEMPTS; attempt++) {
    const [prod] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!prod) return undefined;
    const prev = (prod.variants ?? []) as StockVariant[];

    let next: StockVariant[];
    try {
      if (patch.variants !== undefined && patch.variants.length !== prev.length) {
        next = patch.variants as StockVariant[]; // variants added/removed: written as edited
      } else {
        const base: StockVariant[] =
          patch.variants === undefined
            ? prev
            : (patch.variants as StockVariant[]).map((v, i) => {
                const { stock: _s, stockByBranch: _b, ...rest } = v;
                void _s;
                void _b;
                const live = prev[i];
                return {
                  ...rest,
                  ...(live.stockByBranch !== undefined ? { stockByBranch: live.stockByBranch } : {}),
                  ...(live.stock !== undefined ? { stock: live.stock } : {}),
                };
              });
        next = applyStockDeltas(base, deltas, { allowShort: true });
      }
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "Invalid stock change");
    }

    const updated = await db
      .update(products)
      .set({ ...set, variants: next as ProductRow["variants"] })
      .where(and(eq(products.id, id), sql`${products.variants} = ${JSON.stringify(prev)}::jsonb`))
      .returning();
    if (updated.length > 0) return toInvProduct(updated[0]);
    // Stock moved between our read and write — go round again with the new numbers.
  }
  throw new HttpError(409, "This product's stock is changing right now — please save again.");
}

export async function deleteInventoryProduct(id: string): Promise<boolean> {
  const r = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
  return r.length > 0;
}

/* ─────────────────────────────  Coupons  ───────────────────────────── */

export async function getCoupons(): Promise<Coupon[]> {
  return rows<Coupon>(await db.select().from(coupons));
}

/** Coupon codes are case-insensitive; stored upper-case. */
export async function getCoupon(code: string): Promise<Coupon | undefined> {
  const key = (code ?? "").trim().toUpperCase();
  if (!key) return undefined;
  const [r] = await db.select().from(coupons).where(eq(coupons.code, key)).limit(1);
  return r ? row<Coupon>(r) : undefined;
}

/** Keep stored coupons sane: whole-number discount within 0–100, no negatives. */
function sanitizeCoupon<T extends Partial<Coupon>>(c: T): T {
  const out = { ...c };
  if (out.discountPct !== undefined) out.discountPct = clampPct(out.discountPct);
  if (out.minOrder !== undefined) out.minOrder = Math.max(0, Math.round(Number(out.minOrder) || 0));
  if (out.usageLimit !== undefined) out.usageLimit = Math.max(0, Math.round(Number(out.usageLimit) || 0));
  if (out.remaining !== undefined) out.remaining = Math.max(0, Math.round(Number(out.remaining) || 0));
  return out;
}

/**
 * Use up one redemption. Atomic: a single conditional UPDATE, so two buyers
 * can't both take the last one. Unlimited coupons (usageLimit 0) always succeed.
 * Returns false when the coupon is gone or fully redeemed.
 */
export async function consumeCoupon(code: string): Promise<boolean> {
  const key = (code ?? "").trim().toUpperCase();
  const r = await db
    .update(coupons)
    .set({ remaining: sql`${coupons.remaining} - 1` })
    .where(and(eq(coupons.code, key), gt(coupons.usageLimit, 0), gt(coupons.remaining, 0)))
    .returning({ code: coupons.code });
  if (r.length > 0) return true;
  const [c] = await db.select().from(coupons).where(eq(coupons.code, key)).limit(1);
  return Boolean(c && c.usageLimit === 0);
}

/** Give a redemption back (a sale failed after the coupon was consumed). */
export async function releaseCoupon(code: string): Promise<void> {
  const key = (code ?? "").trim().toUpperCase();
  await db
    .update(coupons)
    .set({ remaining: sql`${coupons.remaining} + 1` })
    .where(and(eq(coupons.code, key), gt(coupons.usageLimit, 0), sql`${coupons.remaining} < ${coupons.usageLimit}`));
}

export async function upsertCoupon(input: Coupon): Promise<Coupon> {
  const c = sanitizeCoupon(input);
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
  const set = sanitizeCoupon(definedOnly(patch)) as Partial<typeof coupons.$inferInsert>;
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
