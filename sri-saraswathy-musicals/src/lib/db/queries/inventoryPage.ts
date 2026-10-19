/**
 * The admin Inventory screen, read one page at a time.
 *
 * `getInventory()` hands back every product with every variant and every branch's stock — fine for a picker that
 * needs the whole catalogue, wasteful for a list that shows 25 rows. This module answers "page N of the filtered
 * list" with a light row per product (branch totals only); a product's variants are fetched only when its row is
 * opened (`getInventoryVariants`).
 */
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, productVariants, variantStock } from "@/lib/db/schema";
import { BRANCH_KEYS } from "@/lib/stock";
import { selectProduct } from "./variants";

export type InvStatus = "all" | "low" | "out";
export type InvSort = "name" | "price" | "stock";

export interface InvFilter {
  q?: string;
  category?: string;
  department?: string;
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
  photo: string | null;
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
  photo: string | null;
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

/** On-hand per product across its enabled variants (a product with none counts as 0). */
function productTotals() {
  return db
    .select({
      productId: productVariants.productId,
      total: sql<number>`coalesce(sum(${variantStock.qty}), 0)`.mapWith(Number).as("total"),
    })
    .from(productVariants)
    .leftJoin(variantStock, eq(variantStock.variantId, productVariants.id))
    .where(eq(productVariants.disabled, false))
    .groupBy(productVariants.productId)
    .as("pt");
}

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
  const pt = productTotals();
  const total = sql<number>`coalesce(${pt.total}, 0)`;
  const where = and(...conditions(f, total));
  const pageSize = Math.min(200, Math.max(1, Math.floor(f.pageSize ?? 10) || 10));

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(products)
    .leftJoin(pt, eq(pt.productId, products.id))
    .where(where);
  const pages = Math.max(1, Math.ceil(n / pageSize));
  const page = Math.min(Math.max(1, Math.floor(f.page ?? 1) || 1), pages);

  const order =
    f.sort === "price" ? [desc(products.price), asc(products.name)]
    : f.sort === "stock" ? [desc(total), asc(products.name)]
    : [asc(products.name), asc(products.id)];

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      category: products.category,
      department: products.department,
      photo: products.photo,
      basePrice: products.price,
      active: products.active,
      lowStockAt: products.lowStockAt,
      total,
    })
    .from(products)
    .leftJoin(pt, eq(pt.productId, products.id))
    .where(where)
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const ids = rows.map((r) => r.id);
  const perBranch = new Map<string, Record<string, number>>();
  const counts = new Map<string, number>();
  const variantPhoto = new Map<string, string>(); // stands in for a missing main photo
  if (ids.length > 0) {
    const branchRows = await db
      .select({
        productId: productVariants.productId,
        branch: variantStock.branch,
        qty: sql<number>`sum(${variantStock.qty})`.mapWith(Number),
      })
      .from(variantStock)
      .innerJoin(productVariants, eq(productVariants.id, variantStock.variantId))
      .where(and(inArray(productVariants.productId, ids), eq(productVariants.disabled, false)))
      .groupBy(productVariants.productId, variantStock.branch);
    for (const b of branchRows) {
      const m = perBranch.get(b.productId) ?? {};
      m[b.branch] = b.qty;
      perBranch.set(b.productId, m);
    }
    const countRows = await db
      .select({ productId: productVariants.productId, n: sql<number>`count(*)`.mapWith(Number) })
      .from(productVariants)
      .where(inArray(productVariants.productId, ids))
      .groupBy(productVariants.productId);
    for (const c of countRows) counts.set(c.productId, c.n);
    // first photographed variant per product (enabled ones first, then by position)
    const photoRows = await db
      .select({ productId: productVariants.productId, photo: productVariants.photo })
      .from(productVariants)
      .where(and(inArray(productVariants.productId, ids), sql`${productVariants.photo} is not null and ${productVariants.photo} <> ''`))
      .orderBy(asc(productVariants.disabled), asc(productVariants.position));
    for (const r of photoRows) if (r.photo && !variantPhoto.has(r.productId)) variantPhoto.set(r.productId, r.photo);
  }

  const [cats, depts] = await Promise.all([
    db.selectDistinct({ v: products.category }).from(products).orderBy(asc(products.category)),
    db.selectDistinct({ v: products.department }).from(products).orderBy(asc(products.department)),
  ]);

  const items: InvRow[] = rows.map((r) => {
    const by = perBranch.get(r.id) ?? {};
    const stockByBranch: Record<string, number> = {};
    for (const b of BRANCH_KEYS) stockByBranch[b] = by[b] ?? 0;
    return {
      ...r,
      photo: r.photo || variantPhoto.get(r.id) || null,
      variantCount: counts.get(r.id) ?? 0,
      stockByBranch,
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
  const pt = productTotals();
  const total = sql<number>`coalesce(${pt.total}, 0)`;
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .leftJoin(pt, eq(pt.productId, products.id))
    .where(and(...conditions(f, total)));
  return rows.map((r) => r.id);
}

/** A product's variants with what each branch has on hand — loaded when its row is opened. */
export async function getInventoryVariants(productId: string): Promise<InvVariantRow[] | undefined> {
  const p = await selectProduct(productId);
  if (!p) return undefined;
  return p.variants.map((v) => {
    const stockByBranch: Record<string, number> = {};
    for (const b of BRANCH_KEYS) stockByBranch[b] = Number(v.stockByBranch?.[b]) || 0;
    return {
      id: v.id,
      attr: v.attr,
      finish: v.finish,
      price: v.price,
      weight: v.weight,
      photo: v.photo ?? null,
      disabled: v.disabled,
      stockByBranch,
      total: BRANCH_KEYS.reduce((n, b) => n + stockByBranch[b], 0),
    };
  });
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
