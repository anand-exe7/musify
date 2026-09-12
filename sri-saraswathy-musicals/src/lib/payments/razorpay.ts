/**
 * Razorpay server helpers — client-facing storefront checkout only. (Admin
 * billing/POS does not use Razorpay.) Amounts are in whole rupees at our layer;
 * Razorpay works in paise, so we convert at the boundary.
 */
import crypto from "crypto";
import Razorpay from "razorpay";
import { HttpError } from "@/lib/api/http";

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** The publishable key id the browser checkout needs. */
export function razorpayKeyId(): string {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "";
}

let client: Razorpay | null = null;
function razorpay(): Razorpay {
  if (!razorpayConfigured()) throw new HttpError(503, "Razorpay is not configured");
  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID as string,
      key_secret: process.env.RAZORPAY_KEY_SECRET as string,
    });
  }
  return client;
}

/** Create a Razorpay order for `amountRupees`. Returns the id/amount/currency. */
export async function createRazorpayOrder(amountRupees: number, receipt: string) {
  const order = await razorpay().orders.create({
    amount: Math.round(amountRupees * 100),
    currency: "INR",
    receipt,
  });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}

/** Verify the `order_id|payment_id` HMAC signature Razorpay returns on success. */
export function verifyRazorpaySignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
  } catch {
    return false;
  }
}
