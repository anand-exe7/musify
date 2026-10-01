/**
 * Coupon rules, shared by the server (web checkout) and the POS screen. Pure —
 * the caller supplies the coupon row and "now".
 *
 * Money is paise. `minOrder` is compared against the pre-discount subtotal, and
 * the percentage is applied to that same subtotal. `usageLimit` of 0 means
 * unlimited; otherwise `remaining` must be above 0.
 */
import { formatINR } from "@/lib/utils";

export interface CouponRule {
  code: string;
  discountPct: number;
  minOrder: number;
  /** "dd/mm/yyyy", or blank / "No expiry". */
  expiry: string;
  usageLimit: number;
  remaining: number;
}

/** Whole-number percentage within 0–100 (NaN → 0). */
export function clampPct(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Parse a coupon expiry into the instant it lapses (end of that day, IST).
 * `null` = never expires; `"invalid"` = unreadable (callers fail closed).
 */
export function expiryInstant(expiry: string): number | null | "invalid" {
  const s = (expiry ?? "").trim();
  if (!s || /^no expiry$/i.test(s)) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "invalid";
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const end = Date.UTC(y, mo - 1, d, 23, 59, 59, 999) - IST_OFFSET_MS;
  const check = new Date(end + IST_OFFSET_MS);
  if (check.getUTCDate() !== d || check.getUTCMonth() !== mo - 1) return "invalid"; // e.g. 31/02
  return end;
}

export type CouponResult = { ok: true; discount: number } | { ok: false; reason: string };

export function evaluateCoupon(c: CouponRule | undefined | null, subtotal: number, now: Date = new Date()): CouponResult {
  if (!c) return { ok: false, reason: "That coupon code isn't valid." };
  const lapses = expiryInstant(c.expiry);
  if (lapses === "invalid" || (lapses !== null && now.getTime() > lapses)) {
    return { ok: false, reason: "That coupon has expired." };
  }
  if (c.usageLimit > 0 && c.remaining <= 0) return { ok: false, reason: "That coupon has been fully redeemed." };
  if (subtotal < c.minOrder) {
    return { ok: false, reason: `Add ${formatINR(c.minOrder - subtotal)} more to use this coupon.` };
  }
  const discount = Math.min(subtotal, Math.round((subtotal * clampPct(c.discountPct)) / 100));
  if (discount <= 0) return { ok: false, reason: "That coupon doesn't give a discount." };
  return { ok: true, discount };
}
