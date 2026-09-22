import type { NextRequest } from "next/server";
import { handle, created, HttpError, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/server";
import { verifyDraft } from "@/lib/checkout/draft";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";
import { createOrder, getOrderByPaymentId, nextOrderId } from "@/lib/db/queries/orders";
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
  return handle(async () => {
    const user = await requireUser();
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
      items: draft.items,
      subtotal: draft.subtotal,
      gst: draft.gst,
      shipping: draft.shipping,
      total: draft.total,
      address: draft.address,
    };
    const saved = await createOrder(order);
    await recordOrderInvoice(saved);
    await sendOrderConfirmation(saved, draft.email);
    return created({ orderId: saved.id });
  });
}
