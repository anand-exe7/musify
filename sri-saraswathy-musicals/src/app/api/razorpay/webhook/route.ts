import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { finalizePaidOrder, getPendingCheckout } from "@/lib/checkout/finalize";

export const dynamic = "force-dynamic";

interface WebhookEvent {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
}

/**
 * POST /api/razorpay/webhook — Razorpay tells us a payment went through, even if the customer's browser never
 * came back. Records the order (and emails the customer) from the checkout saved when payment started. The
 * browser's `verify` call and this webhook share one function, so a payment never makes two orders.
 *
 * Answers 200 for anything it deliberately ignores (so Razorpay stops retrying) and 500 only when recording
 * failed, which makes Razorpay try again.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(raw) as WebhookEvent;
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  if (event.event !== "payment.captured" && event.event !== "order.paid") return NextResponse.json({ ok: true, ignored: event.event });

  const pay = event.payload?.payment?.entity;
  if (!pay?.id || !pay.order_id) return NextResponse.json({ ok: true, ignored: "no payment" });

  try {
    const draft = await getPendingCheckout(pay.order_id);
    // Already recorded by the browser, or not one of our checkouts.
    if (!draft) return NextResponse.json({ ok: true, ignored: "no pending checkout" });
    const order = await finalizePaidOrder(draft, pay.id);
    return NextResponse.json({ ok: true, orderId: order.id });
  } catch (err) {
    console.error(`[razorpay-webhook] could not record payment ${pay.id} for ${pay.order_id}:`, err);
    return NextResponse.json({ error: "Could not record the order" }, { status: 500 });
  }
}
