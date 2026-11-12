/**
 * The admin Inventory screen, read one page at a time.
 *
 * `getInventory()` hands back every product with every variant and every branch's stock — fine for a picker that
 * needs the whole catalogue, wasteful for a list that shows 25 rows. This module answers "page N of the filtered
 * list" with a light row per product (branch totals only); a product's variants are fetched only when its row is
 * opened (`getInventoryVariants`).
 */
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, productVariants, variantStock } from "@/lib/db/schema";
import { BRANCH_KEYS } from "@/lib/stock";

export type InvStatus = "all" | "low" | "out";
export type InvSort = "name" | "price" | "stock";

export interface InvFilter {
  q?: string;
  category?: string;
  department?: string;
  /** INV-04: when set, "in stock / low / out" and the stock sort read this branch only. */
  branch?: string;
  status?: InvStatus;
  sort?: InvSort;
  page?: number;
  pageSize?: number;
}

/** One product as the list shows it — no variants, just what is on hand per branch. */
export interface InvRow {
  id: string;
  name: string;
  brand: string;
  category: string;
  department: string;
  /** Fingerprint of the row's photo, or null when it has none. The image itself is served by
   *  `/api/pos/inventory/{id}/photo?v={photoKey}` — sending the data URL made this list megabytes. */
  photoKey: string | null;
  basePrice: number;
  active: boolean;
  lowStockAt: number;
  variantCount: number;
  stockByBranch: Record<string, number>;
  total: number;
  state: "in" | "low" | "out";
}

export interface InvPage {
  items: InvRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  categories: string[];
  departments: string[];
}

export interface InvVariantRow {
  id: string;
  attr: string;
  finish: string;
  price: number;
  weight: number;
  /** As `InvRow.photoKey`; the image comes from `/api/inventory/variants/{id}/photo?v={photoKey}`. */
  photoKey: string | null;
  disabled: boolean;
  stockByBranch: Record<string, number>;
  total: number;
}

export interface StockAlert {
  productId: string;
  productName: string;
  category: string;
  variant: string;
  stock: number;
  state: "low" | "out";
}

/**
 * On-hand per product across its enabled variants (a product with none counts as 0).
 * With a branch, only that branch's rows are joined, so "low / out" is answered for that branch alone (INV-04).
 */
function productTotals(branch?: string) {
  return db
    .select({
      productId: productVariants.productId,
      total: sql<number>`coalesce(sum(${variantStock.qty}), 0)`.mapWith(Number).as("total"),
    })
    .from(productVariants)
    .leftJoin(
      variantStock,
      branch
        ? and(eq(variantStock.variantId, productVariants.id), eq(variantStock.branch, branch))
        : eq(variantStock.variantId, productVariants.id),
    )
    .where(eq(productVariants.disabled, false))
    .groupBy(productVariants.productId)
    .as("pt");
}

/** The branch a filter asks for, or undefined for "all branches". */
const branchOf = (f: InvFilter) => (f.branch && f.branch !== "all" && BRANCH_KEYS.includes(f.branch) ? f.branch : undefined);

const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function conditions(f: InvFilter, total: SQL<number>): SQL[] {
  const c: SQL[] = [];
  const q = f.q?.trim();
  if (q) c.push(or(ilike(products.name, likeOf(q)), ilike(products.brand, likeOf(q))) as SQL);
  if (f.category && f.category !== "all") c.push(eq(products.category, f.category));
  if (f.department && f.department !== "all") c.push(eq(products.department, f.department));
  if (f.status === "out") c.push(sql`${total} <= 0`);
  if (f.status === "low") c.push(sql`${total} > 0 and ${total} <= ${products.lowStockAt}`);
  return c;
}

export async function getInventoryPage(f: InvFilter): Promise<InvPage> {
  const pt = productTotals(branchOf(f));
  const total = sql<number>`coalesce(${pt.total}, 0)`;
  const where = and(...conditions(f, total));
  const pageSize = Math.min(200, Math.max(1, Math.floor(f.pageSize ?? 10) || 10));
  const wanted = Math.max(1, Math.floor(f.page ?? 1) || 1);

  const order =
    f.sort === "price" ? [desc(products.price), asc(products.name)]
    : f.sort === "stock" ? [desc(total), asc(products.name)]
    : [asc(products.name), asc(products.id)];

  // The row carries a fingerprint of its photo, never the photo: a data URL is tens of KB and this list used to
  // send one per product plus one per variant. `md5(null)` is null, so "no photo anywhere" stays null.
  const photoKey = sql<string | null>`md5(coalesce(nullif(${products.photo}, ''), (
    select pv.photo from product_variants pv
     where pv.product_id = ${products.id} and pv.photo is not null and pv.photo <> ''
     order by pv.disabled, pv.position limit 1)))`;

  // Per-branch on-hand and the variant count come back with the row as subselects, so one page of the list is
  // a single round trip to the database instead of three.
  const stockByBranch = sql<Record<string, number>>`coalesce((
    select jsonb_object_agg(x.branch, x.qty) from (
      select vs.branch, sum(vs.qty)::int as qty
        from variant_stock vs join product_variants pv on pv.id = vs.variant_id
       where pv.product_id = ${products.id} and pv.disabled = false
       group by vs.branch) x), '{}'::jsonb)`;
  const variantCount = sql<number>`(select count(*) from product_variants pv where pv.product_id = ${products.id})`.mapWith(Number);

  const rowsAt = (page: number) =>
    db
      .select({
        id: products.id,
        name: products.name,
        brand: products.brand,
        category: products.category,
        department: products.department,
        photoKey,
        basePrice: products.price,
        active: products.active,
        lowStockAt: products.lowStockAt,
        total,
        stockByBranch,
        variantCount,
      })
      .from(products)
      .leftJoin(pt, eq(pt.productId, products.id))
      .where(where)
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

  // One round trip for all four: the count, the rows for the page asked for, and the filter dropdowns.
  const [[{ n }], cats, depts, firstRows] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(products).leftJoin(pt, eq(pt.productId, products.id)).where(where),
    db.selectDistinct({ v: products.category }).from(products).orderBy(asc(products.category)),
    db.selectDistinct({ v: products.department }).from(products).orderBy(asc(products.department)),
    rowsAt(wanted),
  ]);

  const pages = Math.max(1, Math.ceil(n / pageSize));
  const page = Math.min(wanted, pages);
  // Only when the page asked for ran past the end (filters just changed) is a second read needed.
  const rows = page === wanted ? firstRows : await rowsAt(page);

  const items: InvRow[] = rows.map((r) => {
    const by = r.stockByBranch ?? {};
    const perBranch: Record<string, number> = {};
    for (const b of BRANCH_KEYS) perBranch[b] = Number(by[b]) || 0;
    return {
      ...r,
      stockByBranch: perBranch,
      state: r.total <= 0 ? "out" : r.total <= r.lowStockAt ? "low" : "in",
    };
  });

  return {
    items,
    total: n,
    page,
    pages,
    pageSize,
    categories: cats.map((c) => c.v).filter(Boolean),
    departments: depts.map((d) => d.v).filter(Boolean),
  };
}

/** Ids of every product matching the filter (for exporting the filtered set without loading it into the page). */
export async function getInventoryIds(f: InvFilter): Promise<string[]> {
  const pt = productTotals(branchOf(f));
  const total = sql<number>`coalesce(${pt.total}, 0)`;
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .leftJoin(pt, eq(pt.productId, products.id))
    .where(and(...conditions(f, total)));
  return rows.map((r) => r.id);
}

/**
 * A product's variants with what each branch has on hand — loaded when its row is opened.
 * Two parallel reads of the two variant tables; photos are sent as fingerprints, not data URLs.
 */
export async function getInventoryVariants(productId: string): Promise<InvVariantRow[] | undefined> {
  const [vars, stock] = await Promise.all([
    db
      .select({
        id: productVariants.id,
        attr: productVariants.attr,
        finish: productVariants.finish,
        price: productVariants.price,
        weight: productVariants.weight,
        photoKey: sql<string | null>`md5(nullif(${productVariants.photo}, ''))`,
        disabled: productVariants.disabled,
      })
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(asc(productVariants.position)),
    db
      .select({ variantId: variantStock.variantId, branch: variantStock.branch, qty: variantStock.qty })
      .from(variantStock)
      .innerJoin(productVariants, eq(productVariants.id, variantStock.variantId))
      .where(eq(productVariants.productId, productId)),
  ]);

  if (vars.length === 0) {
    // No variants is a normal state for a product, but an unknown id must still be a 404.
    const [p] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
    if (!p) return undefined;
    return [];
  }

  const byId = new Map(vars.map((v) => [v.id, {} as Record<string, number>]));
  for (const s of stock) {
    const m = byId.get(s.variantId);
    if (m) m[s.branch] = s.qty ?? 0;
  }
  return vars.map((v) => {
    const by = byId.get(v.id) ?? {};
    const stockByBranch: Record<string, number> = {};
    for (const b of BRANCH_KEYS) stockByBranch[b] = Number(by[b]) || 0;
    return {
      ...v,
      stockByBranch,
      total: BRANCH_KEYS.reduce((n, b) => n + stockByBranch[b], 0),
    };
  });
}

/** One variant's photo (a data URL or plain URL), for the image route. */
export async function variantPhoto(variantId: string): Promise<string | null> {
  const [r] = await db.select({ photo: productVariants.photo }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
  return r?.photo || null;
}

/** Every enabled variant that is out of stock or at/below its product's reorder level. */
export async function getStockAlerts(): Promise<StockAlert[]> {
  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      category: products.category,
      attr: productVariants.attr,
      finish: productVariants.finish,
      lowStockAt: products.lowStockAt,
      stock: sql<number>`coalesce(sum(${variantStock.qty}), 0)`.mapWith(Number),
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(variantStock, eq(variantStock.variantId, productVariants.id))
    .where(eq(productVariants.disabled, false))
    .groupBy(productVariants.id, products.id, productVariants.attr, productVariants.finish, productVariants.position)
    .having(sql`coalesce(sum(${variantStock.qty}), 0) <= ${products.lowStockAt}`)
    .orderBy(asc(products.name), asc(productVariants.position));
  return rows.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    category: r.category,
    variant: `${r.attr} · ${r.finish}`,
    stock: r.stock,
    state: r.stock <= 0 ? "out" : "low",
  }));
}
