import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, products, type CategoryRow } from "@/lib/db/schema";
import type { Category } from "@/types";

/** Storefront category tile, matching the inline shape in `data/categories.ts`. */
export type CategoryItem = {
  id: Category;
  name: string;
  tagline: string;
  count: number;
  icon: string;
  photo: string;
};

const toItem = (r: CategoryRow): CategoryItem => ({ ...r, id: r.id as Category });

/** "indian-classical" → "Indian Classical", for a category that products use but the table has no row for. */
const titleCase = (id: string) =>
  id.split(/[-_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || id;

/**
 * The storefront's categories, each with a LIVE count of the products in it — the stored `count` column was
 * written once and drifted. A category products are actually filed under but that has no row yet is included
 * too, so a category invented in the admin is reachable from the shop straight away.
 */
export async function getCategories(): Promise<CategoryItem[]> {
  const [rows, counts] = await Promise.all([
    db.select().from(categories),
    db
      .select({ id: products.category, n: sql<number>`count(*)::int` })
      .from(products)
      .where(eq(products.active, true))
      .groupBy(products.category),
  ]);
  const live = new Map(counts.filter((c) => c.id).map((c) => [c.id, Number(c.n)]));
  const known = new Set(rows.map((r) => r.id));
  const listed = rows.map((r) => ({ ...toItem(r), count: live.get(r.id) ?? 0 }));
  const unlisted = [...live.entries()]
    .filter(([id]) => !known.has(id))
    .map(([id, count]) => ({ id: id as Category, name: titleCase(id), tagline: "", count, icon: "", photo: "" }));
  return [...listed, ...unlisted];
}

export async function getCategory(id: string): Promise<CategoryItem | undefined> {
  const [r] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return r ? toItem(r) : undefined;
}

export async function upsertCategory(c: CategoryItem): Promise<CategoryItem> {
  const [r] = await db
    .insert(categories)
    .values(c)
    .onConflictDoUpdate({ target: categories.id, set: c })
    .returning();
  return toItem(r);
}

export async function deleteCategory(id: string): Promise<boolean> {
  const r = await db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id });
  return r.length > 0;
}
