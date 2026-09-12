import type { NextRequest } from "next/server";
import { handle, ok, created, HttpError, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/server";
import { priceOrder, type DeliveryMethod } from "@/lib/checkout/pricing";
import { signDraft } from "@/lib/checkout/draft";
import { createOrder } from "@/lib/db/queries/orders";
import { createRazorpayOrder, razorpayConfigured, razorpayKeyId } from "@/lib/payments/razorpay";
import { sendOrderConfirmation } from "@/lib/email/resend";
import type { Order } from "@/types";

export const dynamic = "force-dynamic";

interface CreateBody {
  items: { productId: string; quantity: number }[];
  delivery: DeliveryMethod;
  payment: "upi" | "card" | "bank" | "cod";
  shipState?: string;
  customerName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

const newOrderId = () => `ORD${Date.now().toString().slice(-8)}`;

/**
 * Start checkout. Prices the cart server-side, then:
 *  • Pay-on-delivery → creates the order immediately and emails the customer.
 *  • Online payment  → creates a Razorpay order and returns a signed draft; the
 *    browser pays, then `/api/checkout/verify` finalises it.
 */
export function POST(request: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const body = await readJson<CreateBody>(request);
    const priced = await priceOrder(body.items, body.delivery);

    const customerName = (body.customerName || user.name || "").trim();
    const email = (body.email || user.email || "").trim();
    const phone = (body.phone || "").trim();
    const address = (body.address || (body.shipState ? `Delivery to ${body.shipState}` : "")).trim();

    if (body.payment === "cod") {
      const order: Order = {
        id: newOrderId(),
        date: new Date().toISOString().slice(0, 10),
        status: "processing",
        userId: user.id,
        customerName,
        email,
        phone,
        paymentMethod: "cod",
        paymentId: "",
        items: priced.items,
        subtotal: priced.subtotal,
        gst: priced.gst,
        shipping: priced.shipping,
        total: priced.total,
        address,
      };
      const saved = await createOrder(order);
      await sendOrderConfirmation(saved, email);
      return created({ mode: "cod", orderId: saved.id });
    }

    // Online payment via Razorpay.
    if (!razorpayConfigured()) {
      throw new HttpError(503, "Online payments aren't configured yet. Please choose Pay on delivery.");
    }
    const rp = await createRazorpayOrder(priced.total, `rcpt_${Date.now().toString(36)}`);
    const draftToken = await signDraft({
      ...priced,
      userId: user.id,
      customerName,
      email,
      phone,
      address,
      razorpayOrderId: rp.id,
    });

    return ok({
      mode: "razorpay",
      key: razorpayKeyId(),
      razorpayOrderId: rp.id,
      amount: rp.amount,
      currency: rp.currency,
      draftToken,
      customerName,
      email,
      phone,
    });
  });
}
