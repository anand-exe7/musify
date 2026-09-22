import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import type { Order } from "@/types";
import { row, rows, definedOnly } from "./_util";
import { genDocId } from "@/lib/ids";

export async function getOrders(): Promise<Order[]> {
  return rows<Order>(await db.select().from(orders).orderBy(desc(orders.date)));
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const [r] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return r ? row<Order>(r) : undefined;
}

/** Look up an already-recorded order by its Razorpay payment id. Used by
 *  `/api/checkout/verify` to short-circuit replayed calls with the same
 *  signature, so one payment can't produce two orders. */
export async function getOrderByPaymentId(paymentId: string): Promise<Order | undefined> {
  if (!paymentId) return undefined;
  const [r] = await db.select().from(orders).where(eq(orders.paymentId, paymentId)).limit(1);
  return r ? row<Order>(r) : undefined;
}

/** Orders placed by a specific signed-in customer, newest first. */
export async function getOrdersByUser(userId: string): Promise<Order[]> {
  return rows<Order>(
    await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.date)),
  );
}

/** Generate the next order id, e.g. `ORD-2026-7QK3M`. Checks the DB for a free
 *  code before returning it, retrying on the rare clash. */
export async function nextOrderId(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = genDocId("ORD");
    const [existing] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, candidate)).limit(1);
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique order id");
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
