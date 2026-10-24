/**
 * Variants and their per-branch stock live in `product_variants` and
 * `variant_stock`. The rest of the app still works with a product that carries a
 * `variants` array (each with a `stockByBranch` map), so this module is the one
 * place that reads those tables into that shape and writes edits back.
 */
import { asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, productVariants, variantStock, type ProductRow, type VariantData } from "@/lib/db/schema";
import { HttpError } from "@/lib/api/errors";
import { DEFAULT_BRANCH, type Variant } from "@/lib/stock";

type ProductColumns = typeof products.$inferSelect;

/**
 * Variants (with stock) for the given products, keyed by product id, in position order.
 * Two reads, not one join: a variant carries a photo (tens of KB), and joining it to its stock rows would send
 * that photo once per branch, so a catalogue with photos grew past what one database response can carry.
 */
async function loadVariants(productIds: string[]): Promise<Map<string, VariantData[]>> {
  const out = new Map<string, VariantData[]>();
  if (productIds.length === 0) return out;
  const vars = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      attr: productVariants.attr,
      finish: productVariants.finish,
      price: productVariants.price,
      weight: productVariants.weight,
      photo: productVariants.photo,
      disabled: productVariants.disabled,
    })
    .from(productVariants)
    .where(inArray(productVariants.productId, productIds))
    .orderBy(asc(productVariants.productId), asc(productVariants.position));
  const stock = await db
    .select({ variantId: variantStock.variantId, branch: variantStock.branch, qty: variantStock.qty })
    .from(variantStock)
    .innerJoin(productVariants, eq(productVariants.id, variantStock.variantId))
    .where(inArray(productVariants.productId, productIds));

  const byId = new Map<string, VariantData>();
  for (const x of vars) {
    const v: VariantData = { id: x.id, attr: x.attr, finish: x.finish, price: x.price, weight: x.weight, photo: x.photo, disabled: x.disabled, stockByBranch: {} };
    byId.set(x.id, v);
    const list = out.get(x.productId) ?? [];
    list.push(v);
    out.set(x.productId, list);
  }
  for (const s of stock) {
    const v = byId.get(s.variantId);
    if (v) v.stockByBranch[s.branch] = s.qty ?? 0;
  }
  return out;
}

export async function attachVariants(rows: ProductColumns[]): Promise<ProductRow[]> {
  const map = await loadVariants(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, variants: map.get(r.id) ?? [] }));
}

/** Products (with variants and stock) matching `where`, or all of them. */
export async function selectProducts(where?: SQL): Promise<ProductRow[]> {
  const rows = where ? await db.select().from(products).where(where) : await db.select().from(products);
  return attachVariants(rows);
}

export async function selectProduct(id: string): Promise<ProductRow | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return row ? (await attachVariants([row]))[0] : undefined;
}

/** Opening/edited stock for a variant as (branch, qty) pairs. A legacy flat `stock` sits in the default branch. */
function stockEntries(v: Variant): [string, number][] {
  if (v.stockByBranch) {
    return Object.entries(v.stockByBranch)
      .map(([b, q]) => [b, Math.max(0, Math.round(Number(q) || 0))] as [string, number])
      .filter(([, q]) => q > 0);
  }
  const flat = Math.max(0, Math.round(Number(v.stock) || 0));
  return flat > 0 ? [[DEFAULT_BRANCH, flat]] : [];
}

async function insertVariant(productId: string, position: number, v: Variant): Promise<void> {
  const id = crypto.randomUUID();
  await db.insert(productVariants).values({
    id,
    productId,
    position,
    attr: v.attr ?? "",
    finish: v.finish ?? "",
    price: Math.max(0, Math.round(v.price ?? 0)),
    weight: Math.max(0, Math.round(v.weight ?? 0)),
    photo: v.photo ?? null,
    disabled: v.disabled ?? false,
  });
  const stock = stockEntries(v);
  if (stock.length > 0) {
    await db.insert(variantStock).values(stock.map(([branch, qty]) => ({ variantId: id, branch, qty })));
  }
}

/** Insert a new product's variants (and any opening stock they carry). */
export async function insertVariants(productId: string, variants: Variant[]): Promise<void> {
  for (const [i, v] of variants.entries()) await insertVariant(productId, i, v);
}

/**
 * Apply an edited variant list from the product editor. Existing variants (matched
 * by `id`) have their details and position updated but their STOCK is left alone —
 * stock changes go through `adjustProductStock` so a sale that lands mid-edit isn't
 * overwritten. New variants are inserted with whatever opening stock they carry.
 * A variant that was removed must be empty, so no stock disappears silently.
 */
export async function syncVariants(productId: string, edited: Variant[]): Promise<void> {
  const current = (await loadVariants([productId])).get(productId) ?? [];
  const keep = new Set(edited.map((v) => v.id).filter((id): id is string => !!id));

  for (const c of current) {
    if (keep.has(c.id)) continue;
    const onHand = Object.values(c.stockByBranch).reduce((n, q) => n + q, 0);
    if (onHand > 0) {
      throw new HttpError(409, `"${c.attr}" still has ${onHand} in stock — zero its stock before removing it.`);
    }
    await db.delete(productVariants).where(eq(productVariants.id, c.id));
  }

  const known = new Set(current.map((c) => c.id));
  for (const [i, v] of edited.entries()) {
    if (v.id && known.has(v.id)) {
      await db
        .update(productVariants)
        .set({
          position: i,
          attr: v.attr ?? "",
          finish: v.finish ?? "",
          price: Math.max(0, Math.round(v.price ?? 0)),
          weight: Math.max(0, Math.round(v.weight ?? 0)),
          ...(v.photo !== undefined ? { photo: v.photo } : {}),
          disabled: v.disabled ?? false,
        })
        .where(eq(productVariants.id, v.id));
    } else {
      await insertVariant(productId, i, v);
    }
  }
}

/** Set one variant's selling price (paise). */
export async function setVariantPrice(productId: string, variantIndex: number, price: number): Promise<void> {
  const done = await db
    .update(productVariants)
    .set({ price })
    .where(sql`${productVariants.productId} = ${productId} and ${productVariants.position} = ${variantIndex}`)
    .returning({ id: productVariants.id });
  if (done.length === 0) throw new HttpError(400, "Unknown variant on this product");
}

export interface BumpResult {
  /** On-hand just before this change. */
  before: number;
}

/**
 * Add `delta` (negative = take out) to one variant's stock at one branch, as a
 * single atomic statement. Without `allowShort` a change that would leave the
 * balance below zero is refused (`null`); with it the balance is clamped at zero.
 * Returns `undefined` when the variant doesn't exist.
 */
export async function bumpStock(
  productId: string,
  variantIndex: number,
  branch: string,
  delta: number,
  allowShort: boolean,
): Promise<BumpResult | null | undefined> {
  const guard = allowShort ? sql`` : sql`and vs.qty + ${delta} >= 0`;
  const upd = await db.execute(sql`
    with tgt as (
      select vs.variant_id, vs.branch, vs.qty as old_qty
      from variant_stock vs
      join product_variants pv on pv.id = vs.variant_id
      where pv.product_id = ${productId} and pv.position = ${variantIndex} and vs.branch = ${branch}
      for update of vs
    )
    update variant_stock vs
       set qty = greatest(0, vs.qty + ${delta})
      from tgt
     where vs.variant_id = tgt.variant_id and vs.branch = tgt.branch ${guard}
    returning tgt.old_qty as old_qty`);
  const hit = (upd.rows as { old_qty: number }[])[0];
  if (hit) return { before: Number(hit.old_qty) };

  // No row was updated: either the variant is unknown, the bucket doesn't exist
  // yet, or the change would overdraw it.
  const found = await db.execute(sql`
    select pv.id as id, (vs.variant_id is not null) as has_row
    from product_variants pv
    left join variant_stock vs on vs.variant_id = pv.id and vs.branch = ${branch}
    where pv.product_id = ${productId} and pv.position = ${variantIndex}`);
  const pv = (found.rows as { id: string; has_row: boolean }[])[0];
  if (!pv) return undefined;
  if (pv.has_row) return null; // the bucket exists, so the guard refused the overdraw

  // First stock at this branch: create the bucket (nothing to overdraw on zero).
  if (delta < 0 && !allowShort) return null;
  await db
    .insert(variantStock)
    .values({ variantId: pv.id, branch, qty: Math.max(0, delta) })
    .onConflictDoUpdate({
      target: [variantStock.variantId, variantStock.branch],
      set: { qty: sql`greatest(0, ${variantStock.qty} + ${delta})` },
    });
  return { before: 0 };
}

/** Current on-hand for one variant/branch (0 when there is none). */
export async function stockAt(productId: string, variantIndex: number, branch: string): Promise<number> {
  const r = await db.execute(sql`
    select coalesce(vs.qty, 0) as qty
    from product_variants pv
    left join variant_stock vs on vs.variant_id = pv.id and vs.branch = ${branch}
    where pv.product_id = ${productId} and pv.position = ${variantIndex}`);
  return Number((r.rows as { qty: number }[])[0]?.qty ?? 0);
}
