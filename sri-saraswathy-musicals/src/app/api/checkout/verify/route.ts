import type { NextRequest } from "next/server";
import { handle, created, HttpError, readJson } from "@/lib/api/http";
import { verifyDraft } from "@/lib/checkout/draft";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { getOrderByPaymentId, nextOrderId } from "@/lib/db/queries/orders";
import { isUniqueViolation } from "@/lib/db/queries/_util";
import { fulfilOrder } from "@/lib/checkout/fulfil";
import { sendOrderConfirmation } from "@/lib/email/resend";
import { recordOrderInvoice } from "@/lib/billing/ledger";
import type { Order } from "@/types";

export const dynamic = "force-dynamic";

interface VerifyBody {
  draftToken: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** Finalise a Razorpay payment: verify the signature against the signed draft,
 *  then persist the order and email the customer. */
export function POST(request: NextRequest) {
  return handle("user", async ({ user }) => {
    const body = await readJson<VerifyBody>(request);

    const draft = await verifyDraft(body.draftToken || "");
    if (!draft) throw new HttpError(400, "Your checkout session expired. Please try again.");
    if (draft.userId !== user.id) throw new HttpError(403, "This checkout doesn't belong to you.");
    if (draft.razorpayOrderId !== body.razorpay_order_id) throw new HttpError(400, "Payment/order mismatch.");

    const valid = verifyRazorpaySignature({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });
    if (!valid) throw new HttpError(400, "Payment could not be verified.");

    // Replay guard: if this payment id already produced an order (verify was
    // called twice, or webhook + verify raced), return the existing one.
    const existing = await getOrderByPaymentId(body.razorpay_payment_id);
    if (existing) return created({ orderId: existing.id });

    const order: Order = {
      id: await nextOrderId(),
      date: new Date().toISOString().slice(0, 10),
      status: "processing",
      userId: draft.userId,
      customerName: draft.customerName,
      email: draft.email,
      phone: draft.phone,
      paymentMethod: "razorpay",
      paymentId: body.razorpay_payment_id,
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
    // The customer has already paid, so record the order even if stock ran short.
    // Two verify calls for the same payment can both get past the check above;
    // the unique index on payment_id lets only one order through. The loser has
    // already put its stock back, so it just returns the winner's order.
    let saved: Order;
    try {
      saved = await fulfilOrder(order, draft, draft.branch, { paid: true });
    } catch (err) {
      const winner = isUniqueViolation(err) ? await getOrderByPaymentId(body.razorpay_payment_id) : undefined;
      if (!winner) throw err;
      return created({ orderId: winner.id });
    }
    await recordOrderInvoice(saved);
    await sendOrderConfirmation(saved, draft.email);
    return created({ orderId: saved.id });
  });
}
