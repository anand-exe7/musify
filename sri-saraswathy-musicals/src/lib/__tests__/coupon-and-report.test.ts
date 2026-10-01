import { describe, it, expect } from "vitest";
import { evaluateCoupon, expiryInstant, clampPct, type CouponRule } from "@/lib/checkout/coupon";
import { buildGstr1, safeGstr1, InvalidInvoiceDateError, type Period } from "@/lib/gst/report";
import { invoiceRateOf } from "@/lib/gst/summary";
import type { Invoice } from "@/types";

const rule = (over: Partial<CouponRule> = {}): CouponRule => ({
  code: "X", discountPct: 10, minOrder: 0, expiry: "No expiry", usageLimit: 0, remaining: 0, ...over,
});

describe("clampPct (M6)", () => {
  it("keeps whole percentages in 0–100", () => {
    expect([clampPct(150), clampPct(-5), clampPct(12.6), clampPct("abc"), clampPct(NaN)]).toEqual([100, 0, 13, 0, 0]);
  });
});

describe("expiryInstant", () => {
  it("none / unreadable / impossible dates", () => {
    expect(expiryInstant("")).toBeNull();
    expect(expiryInstant("No expiry")).toBeNull();
    expect(expiryInstant("2026-01-01")).toBe("invalid");
    expect(expiryInstant("31/02/2026")).toBe("invalid");
  });
  it("lapses at the end of the named day, IST", () => {
    const t = expiryInstant("15/08/2026") as number;
    expect(new Date(t).toISOString()).toBe("2026-08-15T18:29:59.999Z"); // 23:59:59.999 IST
  });
});

describe("evaluateCoupon", () => {
  const now = new Date("2026-08-15T10:00:00Z");
  it("computes the discount on the subtotal", () => {
    expect(evaluateCoupon(rule(), 10000, now)).toEqual({ ok: true, discount: 1000 });
  });
  it("never discounts more than the subtotal, even at a corrupt >100%", () => {
    expect(evaluateCoupon(rule({ discountPct: 250 }), 10000, now)).toEqual({ ok: true, discount: 10000 });
  });
  it("rejects missing, expired, redeemed-out, below-minimum and zero-value coupons", () => {
    expect(evaluateCoupon(undefined, 100, now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(rule({ expiry: "14/08/2026" }), 100, now)).toMatchObject({ ok: false, reason: expect.stringMatching(/expired/) });
    expect(evaluateCoupon(rule({ expiry: "15/08/2026" }), 100, now)).toMatchObject({ ok: true });
    expect(evaluateCoupon(rule({ expiry: "garbage" }), 100, now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(rule({ usageLimit: 3, remaining: 0 }), 100, now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(rule({ usageLimit: 3, remaining: 1 }), 100, now)).toMatchObject({ ok: true });
    expect(evaluateCoupon(rule({ minOrder: 5000 }), 4000, now)).toMatchObject({ ok: false });
    expect(evaluateCoupon(rule({ discountPct: 0 }), 100, now)).toMatchObject({ ok: false });
  });
});

/* ───────────────────────────  GSTR-1  ─────────────────────────── */

const inv = (over: Partial<Invoice>): Invoice => ({
  id: "i", number: "SSM/2026-27/0001", date: "2026-09-10T10:00:00.000Z", customer: "c", branch: "Branch 1",
  items: [{ name: "x", hsn: "9205", qty: 1, rate: 11800, gst: 18, amount: 11800 }],
  subtotal: 10000, cgst: 900, sgst: 900, igst: 0, total: 11800, paymentMode: "cash", status: "paid", source: "pos", ...over,
});
const sep: Period = { fromYear: 2026, fromMonth: 8, toYear: 2026, toMonth: 8 };

describe("buildGstr1 (H7)", () => {
  it("reports the tax the ledger recorded — not a recomputation", () => {
    // Mixed-rate cart: ₹1180@18% + ₹1050@5%. Recomputing at one rate would be wrong.
    const mixed = inv({
      items: [
        { name: "a", hsn: "", qty: 1, rate: 118000, gst: 18, amount: 118000 },
        { name: "b", hsn: "", qty: 1, rate: 105000, gst: 5, amount: 105000 },
      ],
      subtotal: 200000, cgst: 14000, sgst: 14000, total: 228000,
    });
    const { sales, totals } = buildGstr1([mixed], sep);
    expect(sales[0]).toMatchObject({ taxableValue: 200000, centralTax: 14000, stateTax: 14000, integratedTax: 0, invoiceValue: 228000 });
    expect(totals.centralTax).toBe(14000);
  });
  it("reports IGST as recorded for inter-state invoices", () => {
    const { sales } = buildGstr1([inv({ cgst: 0, sgst: 0, igst: 1800 })], sep);
    expect(sales[0]).toMatchObject({ integratedTax: 1800, centralTax: 0, stateTax: 0 });
  });
  it("reports a zero-tax (bill of supply) invoice with no tax", () => {
    const { sales } = buildGstr1([inv({ cgst: 0, sgst: 0, igst: 0, subtotal: 11800, items: [{ name: "x", hsn: "", qty: 1, rate: 11800, gst: 0, amount: 11800 }] })], sep);
    expect(sales[0]).toMatchObject({ rate: 0, centralTax: 0, stateTax: 0, taxableValue: 11800 });
  });
  it("uses the SAME rate as the collections summary", () => {
    const i = inv({ items: [], subtotal: 10000, cgst: 600, sgst: 600, total: 11200 });
    expect(buildGstr1([i], sep).sales[0].rate).toBe(invoiceRateOf(i));
    expect(invoiceRateOf(i)).toBe(12); // derived from the data, never an assumed 18
  });
  it("skips cancelled invoices and other months", () => {
    const { sales } = buildGstr1([inv({ status: "cancelled" }), inv({ date: "2026-08-31T10:00:00.000Z" })], sep);
    expect(sales).toHaveLength(0);
  });
  it("totals are exact sums of the rows", () => {
    const { totals } = buildGstr1([inv({ id: "a" }), inv({ id: "b", number: "SSM/2026-27/0002" })], sep);
    expect(totals).toMatchObject({ invoiceValue: 23600, taxableValue: 20000, centralTax: 1800, stateTax: 1800 });
  });
});

describe("unreadable invoice dates (M5)", () => {
  const bad = inv({ number: "SSM/2026-27/0099", date: "not a date" });
  it("buildGstr1 refuses to silently drop the invoice", () => {
    expect(() => buildGstr1([inv({}), bad], sep)).toThrow(InvalidInvoiceDateError);
    expect(() => buildGstr1([bad], sep)).toThrow(/SSM\/2026-27\/0099/);
  });
  it("safeGstr1 turns it into a message for the screen", () => {
    const r = safeGstr1([bad], sep);
    expect(r.error).toMatch(/unreadable date/);
    expect(r.data.sales).toEqual([]);
  });
  it("even cancelled-looking or out-of-period rows can't hide a bad date", () => {
    expect(() => buildGstr1([{ ...bad, status: "paid" }], { fromYear: 2020, fromMonth: 0, toYear: 2020, toMonth: 0 })).toThrow();
  });
});
