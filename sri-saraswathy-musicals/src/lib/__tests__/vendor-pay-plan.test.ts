import { describe, expect, it } from "vitest";
import { planVendorPayment, splitByWeights, type PlanBill } from "@/lib/vendorPayPlan";

const bills: PlanBill[] = [
  { id: "old", balance: 400000, weights: { "Branch 1": 300000, "Branch 2": 100000 } },
  { id: "new", balance: 750000, weights: { "Branch 2": 500000 } },
];

describe("pay the vendor in one go", () => {
  it("fills the oldest bill first, then the next", () => {
    const p = planVendorPayment(bills, 500000, "each");
    expect(p.perBill).toEqual({ old: 400000, new: 100000 });
    expect(p.leftover).toBe(0);
  });

  it("charges each branch its share of a bill, and the rows add up", () => {
    const p = planVendorPayment(bills, 400000, "each");
    expect(p.rows).toEqual([
      { purchaseId: "old", branch: "Branch 1", amount: 300000 },
      { purchaseId: "old", branch: "Branch 2", amount: 100000 },
    ]);
    const odd = planVendorPayment([{ id: "x", balance: 1000, weights: { a: 1, b: 1, c: 1 } }], 1000, "each");
    expect(odd.rows.reduce((n, r) => n + r.amount, 0)).toBe(1000);
  });

  it("can put it all on one branch, skipping bills that branch didn't receive", () => {
    const only1 = planVendorPayment(bills, 400000, "Branch 1");
    expect(only1.rows).toEqual([{ purchaseId: "old", branch: "Branch 1", amount: 400000 }]);
    expect(only1.skipped).toEqual(["new"]);
    const only2 = planVendorPayment(bills, 1150000, "Branch 2");
    expect(only2.perBill).toEqual({ old: 400000, new: 750000 });
  });

  it("reports what no bill can take", () => {
    expect(planVendorPayment(bills, 2000000, "each").leftover).toBe(850000);
    expect(planVendorPayment(bills, 0, "each").rows).toEqual([]);
  });

  it("splits by weight with a fair remainder, and equally when weights are 0", () => {
    expect(splitByWeights(100, { a: 1, b: 3 })).toEqual({ a: 25, b: 75 });
    expect(splitByWeights(10, { a: 0, b: 0 })).toEqual({ a: 5, b: 5 });
  });

  it("charges only the branch that still owes (the one that already paid isn't charged again)", () => {
    // Vadapalani took 6,000 and paid it all at purchase; Porur took 3,000 and owes it.
    const b: PlanBill[] = [{ id: "mixed", balance: 300000, weights: { "Branch 1": 0, "Branch 2": 300000 } }];
    const p = planVendorPayment(b, 300000, "each");
    expect(p.rows).toEqual([{ purchaseId: "mixed", branch: "Branch 2", amount: 300000 }]);
    // and a part payment still comes from Porur alone
    expect(planVendorPayment(b, 100000, "each").rows).toEqual([{ purchaseId: "mixed", branch: "Branch 2", amount: 100000 }]);
  });

  it("never gives a zero-weight branch the rounding remainder", () => {
    expect(splitByWeights(1001, { a: 1, b: 1, c: 0 })).toEqual({ a: 501, b: 500, c: 0 });
  });
});

