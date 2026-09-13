/**
 * A short-lived, HMAC-signed "checkout draft" that bridges the two Razorpay
 * steps (create → pay → verify) without persisting a pending order. It captures
 * the exact server-priced order and the Razorpay order id it was created for, so
 * `verify` can trust the amount and contents without re-reading anything the
 * browser sent.
 */
import { SignJWT, jwtVerify } from "jose";
import type { PricedOrder } from "./pricing";

const DRAFT_TTL = "1h";

export interface CheckoutDraft extends PricedOrder {
  userId: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  shipState: string;
  branch: "Branch 1" | "Branch 2";
  razorpayOrderId: string;
}

function key(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV !== "production" ? "dev-insecure-secret-change-me" : "");
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signDraft(draft: CheckoutDraft): Promise<string> {
  return new SignJWT({ draft })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("checkout-draft")
    .setIssuedAt()
    .setExpirationTime(DRAFT_TTL)
    .sign(key());
}

export async function verifyDraft(token: string): Promise<CheckoutDraft | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { audience: "checkout-draft" });
    return (payload.draft as CheckoutDraft) ?? null;
  } catch {
    return null;
  }
}
