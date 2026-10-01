import type { NextRequest } from "next/server";
import { handle, ok, created, HttpError, readJson } from "@/lib/api/http";
import { priceOrder, type DeliveryMethod } from "@/lib/checkout/pricing";
import { fulfilOrder } from "@/lib/checkout/fulfil";
import { signDraft } from "@/lib/checkout/draft";
import { nextOrderId } from "@/lib/db/queries/orders";
import { createRazorpayOrder, razorpayConfigured, razorpayKeyId } from "@/lib/payments/razorpay";
import { sendOrderConfirmation } from "@/lib/email/resend";
import { recordOrderInvoice } from "@/lib/billing/ledger";
import type { Order } from "@/types";

export const dynamic = "force-dynamic";

type Branch = "Branch 1" | "Branch 2";

interface CreateBody {
  items: { productId: string; variantKey?: string; quantity: number }[];
  delivery: DeliveryMethod;
  couponCode?: string;
  payment: "upi" | "card" | "bank" | "cod";
  shipState?: string;
  branch?: Branch;
  customerName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

/**
 * Start checkout. Prices the cart server-side, then:
 *  • Pay-on-delivery → creates the order immediately and emails the customer.
 *  • Online payment  → creates a Razorpay order and returns a signed draft; the
 *    browser pays, then `/api/checkout/verify` finalises it.
 */
export function POST(request: NextRequest) {
  return handle("user", async ({ user }) => {
    const body = await readJson<CreateBody>(request);
    const branch: Branch = body.branch === "Branch 2" ? "Branch 2" : "Branch 1";
    const priced = await priceOrder(body.items, body.delivery, body.shipState, {
      couponCode: body.couponCode,
      branch,
    });
    // Anything the shopper could still fix (stale option, short stock, a coupon
    // that no longer applies) stops the order here — they are never charged a
    // different amount than the cart showed.
    if (priced.issues.length > 0) throw new HttpError(409, priced.issues[0].message);

    const customerName = (body.customerName || user.name || "").trim();
    const email = (body.email || user.email || "").trim();
    const phone = (body.phone || "").trim();
    const address = (body.address || (body.shipState ? `Delivery to ${body.shipState}` : "")).trim();

    if (body.payment === "cod") {
      const order: Order = {
        id: await nextOrderId(),
        date: new Date().toISOString().slice(0, 10),
        status: "processing",
        userId: user.id,
        customerName,
        email,
        phone,
        paymentMethod: "cod",
        paymentId: "",
        shipState: (body.shipState || "").trim(),
        branch,
        items: [], // filled from the priced lines by fulfilOrder
        subtotal: priced.subtotal,
        discount: priced.discount,
        couponCode: priced.couponCode,
        gst: priced.gst,
        shipping: priced.shipping,
        total: priced.total,
        address,
      };
      const saved = await fulfilOrder(order, priced, branch, { paid: false });
      await recordOrderInvoice(saved);
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
      shipState: (body.shipState || "").trim(),
      branch,
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
