/**
 * Variants and their per-branch stock live in `product_variants` and
 * `variant_stock`. The rest of the app still works with a product that carries a
 * `variants` array (each with a `stockByBranch` map), so this module is the one
 * place that reads those tables into that shape and writes edits back.
 */
import { asc, eq, getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, productVariants, variantStock, type ProductRow, type VariantData } from "@/lib/db/schema";
import { HttpError } from "@/lib/api/errors";
import { DEFAULT_BRANCH, type Variant } from "@/lib/stock";
import { galleryRef, variantRef, publicGalleryRef, publicVariantRef, keptPhoto, isPhotoRef } from "./photoRefs";

type ProductColumns = typeof products.$inferSelect;

/**
 * Variants (with stock) for the given products, keyed by product id, in position order.
 * Two reads, not one join: a variant carries a photo (tens of KB), and joining it to its stock rows would send
 * that photo once per branch, so a catalogue with photos grew past what one database response can carry.
 */
async function loadVariants(
  productIds: string[],
  opts: { photos?: boolean; photoKeys?: boolean } = {},
): Promise<Map<string, VariantData[]>> {
  const out = new Map<string, VariantData[]>();
  if (productIds.length === 0) return out;
  const withPhotos = opts.photos !== false && !opts.photoKeys;
  const varsQ = db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      attr: productVariants.attr,
      finish: productVariants.finish,
      price: productVariants.price,
      weight: productVariants.weight,
      // Without photos the column is read as NULL — variant photos are most of the catalogue's bytes.
      // `photoKeys` asks for a fingerprint instead, which the caller turns into an image URL.
      photo: withPhotos
        ? productVariants.photo
        : opts.photoKeys
          ? sql<string | null>`md5(nullif(${productVariants.photo}, ''))`
          : sql<string | null>`null`,
      disabled: productVariants.disabled,
    })
    .from(productVariants)
    .where(inArray(productVariants.productId, productIds))
    .orderBy(asc(productVariants.productId), asc(productVariants.position));
  const stockQ = db
    .select({ variantId: variantStock.variantId, branch: variantStock.branch, qty: variantStock.qty })
    .from(variantStock)
    .innerJoin(productVariants, eq(productVariants.id, variantStock.variantId))
    .where(inArray(productVariants.productId, productIds));
  // Independent reads — run them together.
  const [vars, stock] = await Promise.all([varsQ, stockQ]);

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

/**
 * The whole catalogue for lists (billing, purchases, pickers): every product with its variants and stock, but only
 * ONE photo per product — its own, or else its first variant's — and no gallery or variant photos. Reading those
 * from the database is what made the catalogue take 10+ seconds; the product editor loads one product in full.
 */
export async function selectProductsLean(): Promise<ProductRow[]> {
  const { photos: _gallery, photo: _photo, ...cols } = getTableColumns(products);
  void _gallery;
  void _photo;
  // Instead of the photo itself, a short fingerprint of the photo to show (the product's own, else its first
  // variant's). The list then points at `/api/pos/inventory/<id>/photo?v=<fingerprint>`, which the browser caches.
  const rows = await db
    .select({
      ...cols,
      // Fully qualified on purpose: inside the sub-select an unqualified "id" would mean the variant's id.
      photoKey: sql<string | null>`coalesce(
        md5(nullif("products"."photo", '')),
        (select md5(pv.photo) from product_variants pv
          where pv.product_id = "products"."id" and pv.photo is not null and pv.photo <> ''
          order by pv.disabled, pv.position limit 1))`,
    })
    .from(products);
  const variants = await loadVariants(rows.map((r) => r.id), { photos: false });
  return rows.map(({ photoKey, ...r }) => ({
    ...r,
    photos: null,
    photo: photoKey ? `/api/pos/inventory/${encodeURIComponent(r.id)}/photo?v=${photoKey.slice(0, 12)}` : null,
    variants: variants.get(r.id) ?? [],
  }) as ProductRow);
}

/**
 * One product for the editor: every column except the photos themselves, which come back as URLs to the image
 * routes. Opening a product with photographed variants used to send a quarter of a megabyte of base64.
 */
export async function selectProductForEditor(id: string): Promise<ProductRow | undefined> {
  const { photos: _gallery, photo: _photo, ...cols } = getTableColumns(products);
  void _gallery;
  void _photo;
  const [[row], map] = await Promise.all([
    db
      .select({
        ...cols,
        ownKey: sql<string | null>`md5(nullif("products"."photo", ''))`,
        galleryKeys: sql<string[]>`coalesce((select jsonb_agg(md5(e)) from jsonb_array_elements_text(
          case when jsonb_typeof("products"."photos") = 'array' then "products"."photos" else '[]'::jsonb end) e), '[]'::jsonb)`,
      })
      .from(products)
      .where(eq(products.id, id))
      .limit(1),
    loadVariants([id], { photoKeys: true }),
  ]);
  if (!row) return undefined;
  const { ownKey, galleryKeys, ...rest } = row;
  const gallery = (galleryKeys ?? []).map((k, i) => galleryRef(id, i, k ?? ""));
  // A product with no gallery but an own photo still has one slot to show.
  const photos = gallery.length > 0 ? gallery : ownKey ? [galleryRef(id, 0, ownKey)] : [];
  return {
    ...rest,
    photo: photos[0] ?? null,
    photos: photos.length > 0 ? photos : null,
    variants: (map.get(id) ?? []).map((v) => ({ ...v, photo: v.photo ? variantRef(v.id, v.photo) : null })),
  } as ProductRow;
}

/**
 * Products for the STOREFRONT: every column except the photos themselves, which come back as URLs to the
 * public image routes (`/api/catalog/…`). A shop page of twelve instruments used to carry a megabyte of
 * base64 inside its JSON — one photo per product plus one per variant — which is what made the shop,
 * a product page and the cart slow to appear.
 *
 * `order`, `limit` and `offset` are applied in the database so a page reads only its own rows.
 */
export async function selectStorefront(
  where?: SQL,
  opts: { order?: SQL[]; limit?: number; offset?: number } = {},
): Promise<ProductRow[]> {
  const { photos: _gallery, photo: _photo, ...cols } = getTableColumns(products);
  void _gallery;
  void _photo;
  let q = db
    .select({
      ...cols,
      ownKey: sql<string | null>`md5(nullif("products"."photo", ''))`,
      galleryKeys: sql<string[]>`coalesce((select jsonb_agg(md5(e)) from jsonb_array_elements_text(
        case when jsonb_typeof("products"."photos") = 'array' then "products"."photos" else '[]'::jsonb end) e), '[]'::jsonb)`,
    })
    .from(products)
    .$dynamic();
  if (where) q = q.where(where);
  if (opts.order && opts.order.length > 0) q = q.orderBy(...opts.order);
  if (opts.limit !== undefined) q = q.limit(opts.limit);
  if (opts.offset) q = q.offset(opts.offset);

  const rows = await q;
  const variants = await loadVariants(rows.map((r) => r.id), { photoKeys: true });
  return rows.map(({ ownKey, galleryKeys, ...rest }) => {
    const gallery = (galleryKeys ?? []).map((k, i) => publicGalleryRef(rest.id, i, k ?? ""));
    const photos = gallery.length > 0 ? gallery : ownKey ? [publicGalleryRef(rest.id, 0, ownKey)] : [];
    return {
      ...rest,
      photo: photos[0] ?? null,
      photos: photos.length > 0 ? photos : null,
      variants: (variants.get(rest.id) ?? []).map((v) => ({ ...v, photo: v.photo ? publicVariantRef(v.id, v.photo) : null })),
    } as ProductRow;
  });
}

/** One gallery slot's photo (slot 0 falls back to the product's own photo), for the image route. */
export async function galleryPhoto(id: string, index: number): Promise<string | null> {
  const [r] = await db.select({ photo: products.photo, photos: products.photos }).from(products).where(eq(products.id, id)).limit(1);
  if (!r) return null;
  const slots = r.photos && r.photos.length > 0 ? r.photos : r.photo ? [r.photo] : [];
  return slots[index] ?? null;
}

/** The photo a list shows for a product: its own, else its first variant's (a data URL or a plain URL). */
export async function productListPhoto(id: string): Promise<string | null> {
  const res = await db.execute(sql`
    select coalesce(nullif(p.photo, ''),
      (select pv.photo from product_variants pv
        where pv.product_id = p.id and pv.photo is not null and pv.photo <> ''
        order by pv.disabled, pv.position limit 1)) as photo
      from products p where p.id = ${id}`);
  return ((res.rows as { photo: string | null }[])[0]?.photo) ?? null;
}

/** One variant's stored photo (a data URL or plain URL), for the image routes. */
export async function variantPhotoById(variantId: string): Promise<string | null> {
  const [r] = await db.select({ photo: productVariants.photo }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
  return r?.photo || null;
}

/** Products (with variants and stock) matching `where`, or all of them. */
export async function selectProducts(where?: SQL): Promise<ProductRow[]> {
  const rows = where ? await db.select().from(products).where(where) : await db.select().from(products);
  return attachVariants(rows);
}

export async function selectProduct(id: string): Promise<ProductRow | undefined> {
  // The product row and its variants don't depend on each other — read them together, not one after the other.
  const [[row], map] = await Promise.all([
    db.select().from(products).where(eq(products.id, id)).limit(1),
    loadVariants([id]),
  ]);
  return row ? { ...row, variants: map.get(id) ?? [] } : undefined;
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
    // A brand-new variant can't be "keeping" a photo, so a reference here means no photo.
    photo: isPhotoRef(v.photo) ? null : (v.photo ?? null),
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
          ...(v.photo !== undefined ? { photo: keptPhoto(v.photo, current.find((c) => c.id === v.id)?.photo) } : {}),
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

/**
 * Only what server-side pricing needs: money, tax columns and the variants with their per-branch
 * stock. No photos at all — not the product's, not the gallery's, not the variants'. Pricing a
 * two-line cart used to read the whole catalogue with every base64 photo in it, which is why a
 * quote took twenty seconds; with `ids` it now reads just the rows the cart names.
 */
export interface PricingRow {
  id: string;
  name: string;
  brand: string;
  hsn: string;
  price: number;
  mrp: number;
  gstRate: number | null;
  isGstApplicable: boolean;
  variants: VariantData[];
}

export async function selectPricingRows(ids?: string[]): Promise<PricingRow[]> {
  if (ids && ids.length === 0) return [];
  const q = db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      hsn: products.hsn,
      price: products.price,
      mrp: products.mrp,
      gstRate: products.gstRate,
      isGstApplicable: products.isGstApplicable,
    })
    .from(products)
    .$dynamic();
  // With the ids in hand the variants don't have to wait for the product rows — one round trip, not two.
  const [rows, variants] = ids
    ? await Promise.all([q.where(inArray(products.id, ids)), loadVariants(ids, { photos: false })])
    : await (async () => {
        const all = await q;
        return [all, await loadVariants(all.map((r) => r.id), { photos: false })] as const;
      })();
  return rows.map((r) => ({ ...r, variants: variants.get(r.id) ?? [] }));
}
