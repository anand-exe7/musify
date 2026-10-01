/**
 * Turn a priced order into a stored one: take the goods out of stock at the
 * fulfilling branch, use up the coupon, then insert the order — undoing the
 * earlier steps if a later one fails.
 *
 * `paid: true` is for orders whose money has already been collected (Razorpay
 * verify): they must be recorded even if stock ran short in the meantime, so the
 * stock write clamps at zero and a coupon that raced to empty is honoured. The
 * shortfall is logged loudly so the shop can sort it out. Unpaid orders (pay on
 * delivery) are refused instead. If the order itself can't be saved, whatever
 * stock was taken goes back in both cases, so a retry never takes it twice.
 */
import { HttpError } from "@/lib/api/errors";
import { getPricingCatalog } from "@/lib/db/queries/products";
import { createOrder } from "@/lib/db/queries/orders";
import { consumeCoupon, releaseCoupon } from "@/lib/db/queries/pos";
import { takeStock, type StockLine } from "@/lib/db/queries/stockOps";
import { variantKey as keyOf } from "@/lib/catalog/variants";
import { orderItemsOf, type PricedOrder } from "@/lib/checkout/pricing";
import type { Branch } from "@/lib/stock";
import type { Order } from "@/types";

export async function fulfilOrder(
  order: Order,
  priced: Pick<PricedOrder, "items" | "couponCode">,
  branch: Branch,
  opts: { paid: boolean },
): Promise<Order> {
  const catalog = new Map((await getPricingCatalog()).map((p) => [p.id, p]));
  const lines: StockLine[] = [];
  for (const it of priced.items) {
    const idx = (catalog.get(it.productId)?.variants ?? []).findIndex((v) => keyOf(v) === it.variantKey);
    // A product with no variants (or a variant that has since been removed)
    // carries no stock to take.
    if (idx >= 0) lines.push({ productId: it.productId, variantIndex: idx, quantity: it.quantity });
  }

  const { undo, shortfalls } = await takeStock(lines, branch, { allowShort: opts.paid });
  for (const s of shortfalls) {
    console.error(
      `[checkout] OVERSOLD ${s.productId} variant #${s.variantIndex} at ${branch}: ${s.quantity} sold, ${s.onHand} on hand (order ${order.id})`,
    );
  }

  let couponUsed = false;
  try {
    if (priced.couponCode) {
      couponUsed = await consumeCoupon(priced.couponCode);
      if (!couponUsed) {
        if (!opts.paid) throw new HttpError(409, "That coupon has just been fully redeemed.");
        console.error(`[checkout] coupon ${priced.couponCode} ran out before payment cleared — honouring it for ${order.id}`);
      }
    }
    return await createOrder({ ...order, items: orderItemsOf(priced) });
  } catch (err) {
    if (couponUsed && priced.couponCode) await releaseCoupon(priced.couponCode).catch(() => {});
    await undo(); // paid or not, a sale that wasn't recorded must not keep the stock
    throw err;
  }
}
