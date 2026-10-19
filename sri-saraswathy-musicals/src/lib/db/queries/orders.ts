import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { HttpError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { orders, invoices } from "@/lib/db/schema";
import { getPricingCatalog } from "@/lib/db/queries/products";
import { releaseCoupon } from "@/lib/db/queries/pos";
import { adjustProductStock } from "@/lib/db/queries/stockOps";
import { variantKey } from "@/lib/catalog/variants";
import { isBranch } from "@/lib/stock";
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

/** Undo what an order did: cancel its tax invoice (kept, never erased — GST numbers must stay gap-free), return its
 *  coupon redemption, and put back the stock it took. Only orders placed since web orders began taking stock carry
 *  the per-line `gstRate` snapshot, so older ones are not "restocked" — they never took anything out. */
async function reverseOrder(order: Order): Promise<void> {
  await db.update(invoices).set({ status: "cancelled" }).where(eq(invoices.refId, order.id));
  if (order.couponCode) await releaseCoupon(order.couponCode).catch(() => {});

  const tookStock = order.items.length > 0 && order.items.every((i) => typeof i.gstRate === "number");
  if (tookStock && isBranch(order.branch) && order.status !== "cancelled") {
    const catalog = new Map((await getPricingCatalog()).map((p) => [p.id, p]));
    for (const it of order.items) {
      const idx = (catalog.get(it.productId)?.variants ?? []).findIndex((v) => variantKey(v) === it.variantKey);
      if (idx < 0) continue;
      await adjustProductStock(it.productId, [{ variantIndex: idx, branch: order.branch, delta: it.quantity }]).catch((err) =>
        console.error("[orders] couldn't restore stock for", order.id, it, err),
      );
    }
  }
}

/** Delete an order and reverse what it did (see `reverseOrder`). */
export async function deleteOrder(id: string): Promise<boolean> {
  const order = await getOrder(id);
  if (!order) return false;
  const r = await db.delete(orders).where(eq(orders.id, id)).returning({ id: orders.id });
  if (r.length === 0) return false;
  await reverseOrder(order);
  return true;
}

export interface FulfilmentInput {
  status?: Order["status"];
  courier?: string;
  trackingNo?: string;
}

const STAGES: Order["status"][] = ["processing", "shipped", "delivered", "cancelled"];

/**
 * Move an online order along (processing → shipped → delivered) or cancel it, and record the courier and tracking
 * number. Stages can be corrected backwards (a mis-click), but a cancelled order stays cancelled and a delivered one
 * can't be cancelled (that is a return). Cancelling reverses the sale — invoice cancelled, coupon and stock returned —
 * but keeps the order on record. Returns the order and whether it just moved to a new stage.
 */
export async function fulfilOrder(id: string, input: FulfilmentInput): Promise<{ order: Order; from: Order["status"]; changed: boolean } | undefined> {
  const current = await getOrder(id);
  if (!current) return undefined;
  const to = input.status ?? current.status;
  if (!STAGES.includes(to)) throw new HttpError(400, "Unknown order status.");
  if (current.status === "cancelled" && (to !== "cancelled" || input.courier !== undefined || input.trackingNo !== undefined)) {
    throw new HttpError(409, "This order is cancelled, so it can't be changed.");
  }
  if (to === "cancelled" && current.status === "delivered") {
    throw new HttpError(409, "A delivered order can't be cancelled — it would need a return.");
  }

  const set: Partial<typeof orders.$inferInsert> = {};
  if (input.courier !== undefined) set.courier = String(input.courier).trim().slice(0, 80);
  if (input.trackingNo !== undefined) set.trackingNo = String(input.trackingNo).trim().slice(0, 120);
  const changed = to !== current.status;
  if (changed) {
    set.status = to;
    const now = new Date().toISOString();
    if (to === "processing") { set.shippedAt = null; set.deliveredAt = null; }
    if (to === "shipped") { set.shippedAt = current.shippedAt ?? now; set.deliveredAt = null; }
    if (to === "delivered") { set.shippedAt = current.shippedAt ?? now; set.deliveredAt = now; }
    // Claim the change first: it only goes through if the order is still at the stage we read. Two quick clicks, or two
    // people, can't both win — so the sale is reversed (stock, invoice, coupon) by exactly one of them, and never
    // before the new status is safely saved.
    const [won] = await db.update(orders).set(set).where(and(eq(orders.id, id), eq(orders.status, current.status))).returning();
    if (!won) throw new HttpError(409, "This order was just changed by someone else. Refresh the page and try again.");
    if (to === "cancelled") await reverseOrder(current);
    return { order: row<Order>(won), from: current.status, changed: true };
  }
  if (Object.keys(set).length === 0) return { order: current, from: current.status, changed: false };
  const [r] = await db.update(orders).set(set).where(eq(orders.id, id)).returning();
  return { order: row<Order>(r), from: current.status, changed: false };
}

export interface OrderAlert {
  id: string;
  customerName: string;
  total: number;
  date: string;
  branch: string;
}

/** Online orders still waiting to be shipped — the count for the badge and the latest few for the bell. `branches`
 *  limits it to a branch user's own stores; `null` means every branch. */
export async function getOrderAlerts(branches: string[] | null, limit = 8): Promise<{ count: number; latest: OrderAlert[] }> {
  const where = branches
    ? and(eq(orders.status, "processing"), inArray(orders.branch, branches.length ? branches : ["-"]))
    : eq(orders.status, "processing");
  const [[{ n }], latest] = await Promise.all([
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(orders).where(where),
    db
      .select({ id: orders.id, customerName: orders.customerName, total: orders.total, date: orders.date, branch: orders.branch })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.date), desc(orders.id))
      .limit(limit),
  ]);
  return { count: n, latest };
}
