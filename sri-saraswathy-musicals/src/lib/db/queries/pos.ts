import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { posBills, inventoryProducts, coupons, posCategories } from "@/lib/db/schema";
import type { Bill, InvProduct, Coupon } from "@/lib/store/pos";
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
  return row<Bill>(r);
}

export async function deleteBill(id: string): Promise<boolean> {
  const r = await db.delete(posBills).where(eq(posBills.id, id)).returning({ id: posBills.id });
  return r.length > 0;
}

/* ────────────────────────  Inventory products  ─────────────────────── */

export async function getInventory(): Promise<InvProduct[]> {
  return rows<InvProduct>(await db.select().from(inventoryProducts));
}

export async function createInventoryProduct(p: InvProduct): Promise<InvProduct> {
  const [r] = await db.insert(inventoryProducts).values(p).returning();
  return row<InvProduct>(r);
}

export async function updateInventoryProduct(
  id: string,
  patch: Partial<InvProduct>,
): Promise<InvProduct | undefined> {
  const set = definedOnly(patch) as Partial<typeof inventoryProducts.$inferInsert>;
  if (Object.keys(set).length === 0) {
    const [r] = await db.select().from(inventoryProducts).where(eq(inventoryProducts.id, id)).limit(1);
    return r ? row<InvProduct>(r) : undefined;
  }
  const [r] = await db
    .update(inventoryProducts)
    .set(set)
    .where(eq(inventoryProducts.id, id))
    .returning();
  return r ? row<InvProduct>(r) : undefined;
}

export async function deleteInventoryProduct(id: string): Promise<boolean> {
  const r = await db
    .delete(inventoryProducts)
    .where(eq(inventoryProducts.id, id))
    .returning({ id: inventoryProducts.id });
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
