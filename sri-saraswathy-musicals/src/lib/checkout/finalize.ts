/**
 * Turn a paid Razorpay checkout into a recorded order — the one place both the browser's `verify` call and
 * Razorpay's webhook go through, so a payment can never produce two orders or two emails, whichever arrives first.
 */
import { eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { pendingCheckouts } from "@/lib/db/schema";
import { getOrderByPaymentId, nextOrderId } from "@/lib/db/queries/orders";
import { isUniqueViolation } from "@/lib/db/queries/_util";
import { fulfilOrder } from "@/lib/checkout/fulfil";
import { sendOrderConfirmation } from "@/lib/email/resend";
import { recordOrderInvoice } from "@/lib/billing/ledger";
import type { CheckoutDraft } from "@/lib/checkout/draft";
import type { Order } from "@/types";

const KEEP_DAYS = 7;

/** Remember a checkout until its payment clears (and forget ones that never did). */
export async function savePendingCheckout(draft: CheckoutDraft): Promise<void> {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  await db.delete(pendingCheckouts).where(lt(pendingCheckouts.createdAt, cutoff)).catch(() => {});
  await db
    .insert(pendingCheckouts)
    .values({ razorpayOrderId: draft.razorpayOrderId, draft: draft as unknown as Record<string, unknown>, createdAt: new Date().toISOString() })
    .onConflictDoNothing();
}

export async function getPendingCheckout(razorpayOrderId: string): Promise<CheckoutDraft | undefined> {
  const [r] = await db.select().from(pendingCheckouts).where(eq(pendingCheckouts.razorpayOrderId, razorpayOrderId)).limit(1);
  return r ? (r.draft as unknown as CheckoutDraft) : undefined;
}

async function clearPending(razorpayOrderId: string): Promise<void> {
  await db.delete(pendingCheckouts).where(eq(pendingCheckouts.razorpayOrderId, razorpayOrderId)).catch(() => {});
}

/**
 * Record the order for a captured payment. Safe to call any number of times, from the browser and the webhook
 * at once: the unique index on the payment id lets exactly one caller create the order (and send the email).
 */
export async function finalizePaidOrder(draft: CheckoutDraft, paymentId: string): Promise<Order> {
  const existing = await getOrderByPaymentId(paymentId);
  if (existing) {
    await clearPending(draft.razorpayOrderId);
    return existing;
  }

  const order: Order = {
    id: await nextOrderId(),
    date: new Date().toISOString().slice(0, 10),
    status: "processing",
    userId: draft.userId,
    customerName: draft.customerName,
    email: draft.email,
    phone: draft.phone,
    paymentMethod: "razorpay",
    paymentId,
    shipState: draft.shipState,
    branch: draft.branch,
    items: [], // filled from the priced lines by fulfilOrder
    subtotal: draft.subtotal,
    discount: draft.discount,
    couponCode: draft.couponCode,
    gst: draft.gst,
    shipping: draft.shipping,
    total: draft.total,
    address: draft.address,
  };

  // The customer has already paid, so record the order even if stock ran short in the meantime. The loser of a
  // race has already put its stock back, so it just returns the winner's order.
  let saved: Order;
  try {
    saved = await fulfilOrder(order, draft, draft.branch, { paid: true });
  } catch (err) {
    const winner = isUniqueViolation(err) ? await getOrderByPaymentId(paymentId) : undefined;
    if (!winner) throw err;
    await clearPending(draft.razorpayOrderId);
    return winner;
  }
  await recordOrderInvoice(saved);
  await clearPending(draft.razorpayOrderId);
  await sendOrderConfirmation(saved, draft.email);
  return saved;
}
