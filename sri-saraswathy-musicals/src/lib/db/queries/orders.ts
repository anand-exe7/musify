import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import type { Order } from "@/types";
import { row, rows, definedOnly } from "./_util";

export async function getOrders(): Promise<Order[]> {
  return rows<Order>(await db.select().from(orders).orderBy(desc(orders.date)));
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const [r] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return r ? row<Order>(r) : undefined;
}

export async function createOrder(o: Order): Promise<Order> {
  const [r] = await db.insert(orders).values(o).returning();
  return row<Order>(r);
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<Order | undefined> {
  const set = definedOnly(patch) as Partial<typeof orders.$inferInsert>;
  if (Object.keys(set).length === 0) return getOrder(id);
  const [r] = await db.update(orders).set(set).where(eq(orders.id, id)).returning();
  return r ? row<Order>(r) : undefined;
}

export async function deleteOrder(id: string): Promise<boolean> {
  const r = await db.delete(orders).where(eq(orders.id, id)).returning({ id: orders.id });
  return r.length > 0;
}
