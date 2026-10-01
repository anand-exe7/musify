/**
 * Money maths — one GST-inclusive model for every channel. Covers the pure
 * primitives (`lineTax`, `allocateDiscount`, `taxLines`), the POS `billTax`
 * (incl. the audit's H1 coupon example), and the server's `priceOrder`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { lineTax, billTax, type BillItem } from "@/lib/store/pos";
import { extractGst } from "@/lib/store/gst";
import { allocateDiscount, splitTax, taxLines } from "@/lib/gst/inclusive";
import { isIntraSupply } from "@/lib/gst/place-of-supply";

describe("lineTax (GST-inclusive split)", () => {
  it("splits an inclusive amount into taxable + tax", () => {
    expect(lineTax(1180, 18)).toEqual({ taxable: 1000, tax: 180 });
    expect(lineTax(10500, 5)).toEqual({ taxable: 10000, tax: 500 });
  });
  it("always sums back to the gross amount", () => {
    for (const amt of [1, 99, 12345, 99999]) {
      for (const rate of [5, 12, 18, 28]) {
        const { taxable, tax } = lineTax(amt, rate);
        expect(taxable + tax).toBe(amt);
      }
    }
  });
  it("treats 0 / null / undefined / negative rate as non-GST", () => {
    for (const r of [0, null, undefined, -5]) {
      expect(lineTax(500, r)).toEqual({ taxable: 500, tax: 0 });
    }
  });
});

describe("allocateDiscount", () => {
  it("shares add up to exactly the discount", () => {
    for (const d of [0, 1, 7, 100, 333]) {
      const shares = allocateDiscount([100, 200, 300], d);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(d);
    }
  });
  it("is proportional and never exceeds a line", () => {
    expect(allocateDiscount([100, 300], 40)).toEqual([10, 30]);
    expect(allocateDiscount([10, 10], 1000)).toEqual([10, 10]);
  });
  it("handles empty / zero inputs", () => {
    expect(allocateDiscount([], 5)).toEqual([]);
    expect(allocateDiscount([0, 0], 5)).toEqual([0, 0]);
  });
});

describe("splitTax", () => {
  it("intra: CGST+SGST with the odd paisa on SGST; inter: IGST", () => {
    expect(splitTax(181, true)).toEqual({ cgst: 91, sgst: 90, igst: 0 });
    expect(splitTax(180, false)).toEqual({ cgst: 0, sgst: 0, igst: 180 });
  });
});

describe("taxLines (discount BEFORE tax)", () => {
  it("each line's taxable + tax equals what is paid for it", () => {
    const { lines, totals } = taxLines(
      [{ gross: 100000, rate: 18 }, { gross: 52500, rate: 5 }, { gross: 30000, rate: 0 }],
      18259,
      true,
    );
    for (const l of lines) expect(l.taxable + l.tax).toBe(l.net);
    expect(totals.net).toBe(182500 - 18259);
    expect(totals.cgst + totals.sgst).toBe(totals.tax);
    expect(totals.discount).toBe(18259);
  });
  it("inter-state puts everything in IGST", () => {
    const { totals } = taxLines([{ gross: 11800, rate: 18 }], 0, false);
    expect(totals).toMatchObject({ taxable: 10000, tax: 1800, igst: 1800, cgst: 0, sgst: 0 });
  });
});

describe("isIntraSupply", () => {
  it("is case/whitespace-insensitive and treats a blank buyer state as intra", () => {
    expect(isIntraSupply(" tamil nadu ", "Tamil Nadu")).toBe(true);
    expect(isIntraSupply("", "Tamil Nadu")).toBe(true);
    expect(isIntraSupply("Kerala", "Tamil Nadu")).toBe(false);
  });
});

describe("billTax", () => {
  const item = (price: number, qty: number, gstRate: number | null, discount = 0): BillItem =>
    ({ name: "x", price, qty, gstRate, discount }) as BillItem;

  it("aggregates tax per rate and splits CGST/SGST evenly", () => {
    const t = billTax([item(1180, 1, 18), item(1050, 2, 5)], true);
    expect(t.byRate[18]).toEqual({ taxable: 1000, tax: 180 });
    expect(t.byRate[5]).toEqual({ taxable: 2000, tax: 100 });
    expect(t.gst).toBe(280);
    expect(t.cgst).toBe(140);
    expect(t.cgst + t.sgst).toBe(t.gst);
  });
  it("applies per-line discount before extracting tax", () => {
    const t = billTax([item(1180, 2, 18, 1180)], true);
    expect(t.byRate[18]).toEqual({ taxable: 1000, tax: 180 });
  });
  it("floors a line at zero when discount exceeds the line", () => {
    expect(billTax([item(100, 1, 18, 500)], true).gst).toBe(0);
  });
  it("ignores non-GST lines and is untaxed when GST is disabled", () => {
    expect(billTax([item(500, 1, null), item(500, 1, 0)], true)).toMatchObject({ taxable: 0, gst: 0, byRate: {} });
    expect(billTax([item(1180, 1, 18)], false).gst).toBe(0);
  });

  describe("H1 — coupon / manual discount come off the taxable base", () => {
    it("audit example: ₹1,000 @18% with a 10% coupon", () => {
      // Charged ₹900. Old behaviour taxed the undiscounted ₹1,000 (152.54 tax).
      const t = billTax([item(100000, 1, 18)], true, 10000);
      expect(t.taxable).toBe(76271);
      expect(t.gst).toBe(13729);
      expect(t.taxable + t.gst).toBe(90000); // == the amount charged
    });
    it("spreads the discount across mixed-rate lines", () => {
      const t = billTax([item(11800, 1, 18), item(10500, 1, 5)], true, 2230);
      const net = 11800 + 10500 - 2230;
      expect(t.taxable + t.gst).toBe(net);
    });
    it("a discount covering the whole bill leaves no tax", () => {
      expect(billTax([item(5000, 1, 18)], true, 5000).gst).toBe(0);
    });
    it("is unchanged when there is no bill-level discount", () => {
      expect(billTax([item(1180, 1, 18)], true, 0)).toEqual(billTax([item(1180, 1, 18)], true));
    });
  });
});

describe("extractGst", () => {
  it("agrees with lineTax", () => {
    expect(extractGst(1180, 18)).toEqual({ gst: 180, net: 1000 });
  });
});

/* ───────────────────────────  priceOrder  ─────────────────────────── */

const catalog = vi.hoisted(() => [
  {
    id: "p1", name: "Flute", brand: "Acme", hsn: "9205", price: 10000, gstRate: 18, isGstApplicable: true,
    variants: [
      { attr: "A", finish: "x", price: 11800, weight: 0, stockByBranch: { "Branch 1": 5, "Branch 2": 0 } },
      { attr: "B", finish: "y", price: 15000, weight: 0, stock: 5, disabled: true },
    ],
  },
  { id: "p2", name: "Tabla", brand: "", hsn: "", price: 5000, gstRate: 5, isGstApplicable: true, variants: [] },
  { id: "p3", name: "Book", brand: "", hsn: "", price: 3000, gstRate: null, isGstApplicable: false, variants: [] },
]);
const zones = vi.hoisted(() => [
  { id: "tn", name: "TN", states: ["Tamil Nadu"], charge: 0, eta: "", uptoGm250: 4000, uptoGm500: 6000, perAddl500: 0, above5kgPerKg: 0, above10kgPerKg: 0 },
  { id: "rest", name: "Rest", states: [], charge: 9000, eta: "", uptoGm250: 0, uptoGm500: 0, perAddl500: 0, above5kgPerKg: 0, above10kgPerKg: 0 },
]);
const coupons = vi.hoisted(
  () =>
    ({
      SAVE10: { code: "SAVE10", discountPct: 10, minOrder: 0, expiry: "No expiry", usageLimit: 0, remaining: 0 },
      BIG: { code: "BIG", discountPct: 50, minOrder: 1000000, expiry: "No expiry", usageLimit: 0, remaining: 0 },
      OLD: { code: "OLD", discountPct: 10, minOrder: 0, expiry: "01/01/2020", usageLimit: 0, remaining: 0 },
      GONE: { code: "GONE", discountPct: 10, minOrder: 0, expiry: "No expiry", usageLimit: 5, remaining: 0 },
    }) as Record<string, unknown>,
);
vi.mock("@/lib/db/queries/products", () => ({ getPricingCatalog: async () => catalog }));
vi.mock("@/lib/db/queries/settings", () => ({
  getZones: async () => zones,
  getGstSettings: async () => ({ homeState: "Tamil Nadu", standardRate: 18 }),
}));
vi.mock("@/lib/db/queries/pos", () => ({ getCoupon: async (c: string) => coupons[c.trim().toUpperCase()] }));

describe("priceOrder (GST-inclusive)", () => {
  let priceOrder: typeof import("@/lib/checkout/pricing").priceOrder;
  beforeEach(async () => {
    ({ priceOrder } = await import("@/lib/checkout/pricing"));
  });

  it("rejects an empty cart, unknown products and bad delivery with 400", async () => {
    await expect(priceOrder([], "standard")).rejects.toMatchObject({ status: 400 });
    await expect(priceOrder([{ productId: "p2", quantity: 0 }], "standard")).rejects.toMatchObject({ status: 400 });
    await expect(priceOrder([{ productId: "nope", quantity: 1 }], "standard")).rejects.toMatchObject({ status: 400 });
    await expect(priceOrder([{ productId: "p2", quantity: 1 }], "teleport" as never)).rejects.toMatchObject({ status: 400 });
  });

  it("tax is contained in the price: total = subtotal − discount + shipping (C3)", async () => {
    const o = await priceOrder([{ productId: "p2", quantity: 2 }], "standard", "Tamil Nadu");
    expect(o.subtotal).toBe(10000);
    expect(o.shipping).toBe(6000);
    expect(o.total).toBe(16000); // NOT 10000 + 500 + 6000
    expect(o.gst).toBe(476); // 10000 − round(10000/1.05)
    expect(o.taxable + o.gst).toBe(10000);
  });
  it("the flute costs the same online as at the counter", async () => {
    const o = await priceOrder([{ productId: "p1", quantity: 1 }], "white-glove");
    expect(o.total).toBe(11800);
    expect(o.gst).toBe(lineTax(11800, 18).tax);
  });

  it("splits CGST+SGST in-state and IGST out of state", async () => {
    const inState = await priceOrder([{ productId: "p1", quantity: 1 }], "white-glove", "Tamil Nadu");
    expect(inState.intra).toBe(true);
    expect(inState.cgst + inState.sgst).toBe(inState.gst);
    expect(inState.igst).toBe(0);
    const out = await priceOrder([{ productId: "p1", quantity: 1 }], "white-glove", "Kerala");
    expect(out.intra).toBe(false);
    expect(out.igst).toBe(out.gst);
    expect(out.total).toBe(inState.total);
  });

  it("charges no GST on exempt products (H9)", async () => {
    const o = await priceOrder([{ productId: "p3", quantity: 1 }], "white-glove");
    expect(o.gst).toBe(0);
    expect(o.total).toBe(3000);
  });

  describe("variants (H10) and quantity (H11)", () => {
    it("uses the first enabled variant when none is named", async () => {
      const o = await priceOrder([{ productId: "p1", quantity: 1 }], "white-glove");
      expect(o.items[0]).toMatchObject({ price: 11800, variantKey: "A|x" });
      expect(o.issues).toEqual([]);
    });
    it("flags a stale variant key instead of silently charging another variant", async () => {
      const o = await priceOrder([{ productId: "p1", variantKey: "Gone|z", quantity: 1 }], "white-glove");
      expect(o.issues.map((i) => i.kind)).toContain("variant");
    });
    it("flags a disabled variant", async () => {
      const o = await priceOrder([{ productId: "p1", variantKey: "B|y", quantity: 1 }], "white-glove");
      expect(o.issues.map((i) => i.kind)).toContain("variant");
    });
    it("floors fractional quantity and merges duplicate lines", async () => {
      const o = await priceOrder([{ productId: "p2", quantity: 2.9 }, { productId: "p2", quantity: 1 }], "white-glove");
      expect(o.items).toHaveLength(1);
      expect(o.items[0].quantity).toBe(3);
    });
  });

  describe("stock (H2)", () => {
    it("flags a cart that exceeds stock at the chosen branch", async () => {
      const o = await priceOrder([{ productId: "p1", quantity: 6 }], "white-glove", "", { branch: "Branch 1" });
      expect(o.issues).toEqual([expect.objectContaining({ kind: "stock" })]);
    });
    it("stock is per branch", async () => {
      const b1 = await priceOrder([{ productId: "p1", quantity: 5 }], "white-glove", "", { branch: "Branch 1" });
      const b2 = await priceOrder([{ productId: "p1", quantity: 1 }], "white-glove", "", { branch: "Branch 2" });
      expect(b1.issues).toEqual([]);
      expect(b2.issues.map((i) => i.kind)).toContain("stock");
    });
  });

  describe("coupons (H8)", () => {
    it("takes the discount off BEFORE tax", async () => {
      const o = await priceOrder([{ productId: "p1", quantity: 1 }], "white-glove", "", { couponCode: "save10" });
      expect(o.couponCode).toBe("SAVE10");
      expect(o.discount).toBe(1180);
      expect(o.total).toBe(10620);
      expect(o.taxable + o.gst).toBe(10620); // tax is on what is paid, not on ₹118
      expect(o.gst).toBe(lineTax(10620, 18).tax);
    });
    it.each([
      ["NOPE", /isn't valid/],
      ["BIG", /Add .* more/],
      ["OLD", /expired/],
      ["GONE", /fully redeemed/],
    ])("reports %s without discounting", async (code, msg) => {
      const o = await priceOrder([{ productId: "p1", quantity: 1 }], "white-glove", "", { couponCode: code });
      expect(o.discount).toBe(0);
      expect(o.couponCode).toBeNull();
      expect(o.issues).toEqual([expect.objectContaining({ kind: "coupon", message: expect.stringMatching(msg) })]);
    });
  });

  describe("shipping (H3)", () => {
    const one = [{ productId: "p2", quantity: 1 }];
    it("express is flat 50000, white-glove is free, and there is no free-shipping threshold", async () => {
      expect((await priceOrder(one, "express")).shipping).toBe(50000);
      expect((await priceOrder(one, "white-glove")).shipping).toBe(0);
      const big = await priceOrder([{ productId: "p2", quantity: 200 }], "standard", "Tamil Nadu"); // ₹10,000 cart
      expect(big.subtotal).toBeGreaterThan(500000);
      expect(big.shipping).toBe(6000);
    });
    it("standard falls back to the catch-all zone's legacy charge; matches states case-insensitively", async () => {
      expect((await priceOrder(one, "standard", "Kerala")).shipping).toBe(9000);
      expect((await priceOrder(one, "standard", "tamil nadu")).shipping).toBe(6000);
    });
    it("returns every method's price so the UI never computes shipping", async () => {
      const o = await priceOrder(one, "white-glove", "Tamil Nadu");
      expect(o.shippingOptions).toEqual({ standard: 6000, "white-glove": 0, express: 50000 });
    });
  });
});
