/**
 * Razorpay server helpers — client-facing storefront checkout only. (Admin
 * billing/POS does not use Razorpay.) Amounts are in paise everywhere (our
 * layer and Razorpay's), so no conversion is needed at the boundary.
 */
import crypto from "crypto";
import Razorpay from "razorpay";
import { HttpError } from "@/lib/api/errors";

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

/** Create a Razorpay order for `amountPaise`. Returns the id/amount/currency. */
export async function createRazorpayOrder(amountPaise: number, receipt: string) {
  const order = await razorpay().orders.create({
    amount: Math.round(amountPaise),
    currency: "INR",
    receipt,
  });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}

/** The payment instruments Razorpay reports. Anything unrecognised is kept as-is. */
export type PaymentInstrument = "upi" | "card" | "netbanking" | "wallet" | "emi" | "paylater" | string;

/**
 * How a captured payment was actually made ("upi", "card", "netbanking", …). The browser's
 * `verify` call only carries ids, so the instrument is read back from Razorpay — the invoice
 * should say UPI or Card, not just "razorpay". Best-effort: `undefined` when it can't be read.
 */
export async function fetchPaymentInstrument(paymentId: string): Promise<PaymentInstrument | undefined> {
  if (!paymentId || !razorpayConfigured()) return undefined;
  try {
    const payment = (await razorpay().payments.fetch(paymentId)) as { method?: string };
    return payment?.method || undefined;
  } catch (err) {
    console.error(`[razorpay] couldn't read payment ${paymentId}:`, err);
    return undefined;
  }
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

/** Verify a webhook call: HMAC-SHA256 of the raw request body with the webhook secret, sent in `x-razorpay-signature`. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
