import type { NextRequest } from "next/server";
import { handle, created, HttpError, readJson } from "@/lib/api/http";
import { verifyDraft } from "@/lib/checkout/draft";
import { finalizePaidOrder } from "@/lib/checkout/finalize";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";

interface VerifyBody {
  draftToken: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** Finalise a Razorpay payment: verify the signature against the signed draft,
 *  then record the order and email the customer. */
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

    // Shared with the Razorpay webhook: whichever arrives first records the order, the other gets it back.
    const saved = await finalizePaidOrder(draft, body.razorpay_payment_id);
    return created({ orderId: saved.id });
  });
}
