import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, type CategoryRow } from "@/lib/db/schema";
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

export async function getCategories(): Promise<CategoryItem[]> {
  const rows = await db.select().from(categories);
  return rows.map(toItem);
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
