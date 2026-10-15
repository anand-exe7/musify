/**
 * Purchases: GST on each line, the paid amount split across branches by the person
 * (like stock) instead of spread automatically, and editing a saved purchase.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@/lib/db/schema");
  const root = path.resolve(import.meta.dirname, "../../../drizzle");
  const pg = new PGlite();
  const journal = JSON.parse(fs.readFileSync(path.join(root, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    for (const stmt of fs.readFileSync(path.join(root, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
  return { db: drizzle(pg, { schema }), ...schema };
});

import { db } from "@/lib/db";
import { products, vendors } from "@/lib/db/schema";
import { insertVariants } from "@/lib/db/queries/variants";
import {
  createPurchase,
  createVendorPayment,
  createVendorPaymentSplit,
  getPurchase,
  getPurchases,
  shareByBranch,
  updatePurchase,
  vendorOutstandings,
  vendorStatement,
  PurchaseValidationError,
  type PurchaseInput,
} from "@/lib/db/queries/purchases";
import { computePurchaseTax, checkPurchaseTax } from "@/lib/gst/purchaseTax";
import type { Variant } from "@/lib/stock";

const variant: Variant = { attr: "Std", finish: "", price: 100000, weight: 0, stockByBranch: {} };

beforeAll(async () => {
  await db.select().from(vendors); // wait for the mocked db + migrations
  await db.insert(vendors).values({ id: "v1", name: "Vendor One", createdAt: new Date().toISOString() });
  await db.insert(products).values({ id: "p1", slug: "p1", name: "Tabla", category: "percussion" });
  await insertVariants("p1", [variant]);
}, 60_000);

let n = 0;
/** A 10 × ₹1,000 purchase: 6 into Vadapalani, 4 into Porur, 18% GST. */
function purchase(over: Partial<PurchaseInput> = {}): PurchaseInput {
  n += 1;
  const tax = computePurchaseTax([{ quantity: 10, unitCost: 100000, gst: 18 }], false);
  return {
    batchId: `batch-${n}`,
    vendorId: "v1",
    subtotal: 1_000_000,
    ...tax,
    totalAmount: 1_000_000 + tax.tax,
    lines: [{
      productId: "p1", variantIndex: 0, unitCost: 100000, quantity: 10, gst: 18,
      allocations: [{ branch: "Branch 1", quantity: 6 }, { branch: "Branch 2", quantity: 4 }],
    }],
    ...over,
  };
}
const outstanding = async (branch: string) => (await vendorOutstandings()).find((r) => r.vendorId === "v1" && r.branch === branch);

describe("purchase GST maths", () => {
  it("adds tax on top of the cost and splits it CGST/SGST", () => {
    expect(computePurchaseTax([{ quantity: 10, unitCost: 100000, gst: 18 }], false)).toEqual({ cgst: 90000, sgst: 90000, igst: 0, tax: 180000 });
  });
  it("puts everything in IGST for an inter-state purchase", () => {
    expect(computePurchaseTax([{ quantity: 2, unitCost: 50000, gst: 12 }], true)).toEqual({ cgst: 0, sgst: 0, igst: 12000, tax: 12000 });
  });
  it("handles mixed rates and a missing rate", () => {
    const t = computePurchaseTax([{ quantity: 1, unitCost: 100000, gst: 18 }, { quantity: 1, unitCost: 100000, gst: 5 }, { quantity: 3, unitCost: 100000 }], false);
    expect(t.tax).toBe(23000);
    expect(t.cgst + t.sgst).toBe(23000);
  });
});

describe("paid-now amount is split across branches by the person", () => {
  const paidOf = async (branch: string) => (await outstanding(branch))?.paid ?? 0;

  it("charges the whole amount to one branch when only that branch is picked", async () => {
    const before = [await paidOf("Branch 1"), await paidOf("Branch 2")];
    const p = await createPurchase(purchase({ amountPaid: 200000, paidAllocations: [{ branch: "Branch 2", amount: 200000 }] }), "u1", null);
    expect(p.paidAllocations).toEqual({ "Branch 2": 200000 });
    expect((await paidOf("Branch 1")) - before[0]).toBe(0);
    expect((await paidOf("Branch 2")) - before[1]).toBe(200000);
  });

  it("uses exactly the shares entered, not the 6:4 stock split", async () => {
    const before = [await paidOf("Branch 1"), await paidOf("Branch 2")];
    const p = await createPurchase(
      purchase({ amountPaid: 100000, paidAllocations: [{ branch: "Branch 1", amount: 10000 }, { branch: "Branch 2", amount: 90000 }] }),
      "u1", null,
    );
    expect(p.paidAllocations).toEqual({ "Branch 1": 10000, "Branch 2": 90000 });
    expect((await paidOf("Branch 1")) - before[0]).toBe(10000);
    expect((await paidOf("Branch 2")) - before[1]).toBe(90000);
  });

  it("asks for a split when stock goes to several branches and none was given", async () => {
    await expect(createPurchase(purchase({ amountPaid: 100000 }), "u1", null)).rejects.toThrow(/Split the amount paid/);
  });

  it("rejects shares that don't add up to the amount paid", async () => {
    await expect(
      createPurchase(purchase({ amountPaid: 100000, paidAllocations: [{ branch: "Branch 1", amount: 30000 }, { branch: "Branch 2", amount: 30000 }] }), "u1", null),
    ).rejects.toThrow(/don't add up/);
  });

  it("defaults to the only receiving branch", async () => {
    const p = await createPurchase(
      purchase({ amountPaid: 100000, lines: [{ productId: "p1", variantIndex: 0, unitCost: 100000, quantity: 10, gst: 18, allocations: [{ branch: "Branch 3", quantity: 10 }] }] }),
      "u1", null,
    );
    expect(p.paidAllocations).toEqual({ "Branch 3": 100000 });
  });

  it("refuses a branch that isn't receiving stock, a duplicate, or an unknown one", async () => {
    await expect(createPurchase(purchase({ amountPaid: 100000, paidAllocations: [{ branch: "Branch 3", amount: 100000 }] }), "u1", null)).rejects.toThrow(/isn't receiving/);
    await expect(createPurchase(purchase({ amountPaid: 100000, paidAllocations: [{ branch: "Nowhere", amount: 100000 }] }), "u1", null)).rejects.toThrow(/Unknown branch/);
    await expect(
      createPurchase(purchase({ amountPaid: 100000, paidAllocations: [{ branch: "Branch 1", amount: 50000 }, { branch: "Branch 1", amount: 50000 }] }), "u1", null),
    ).rejects.toThrow(/twice/);
  });

  it("keeps a staff user to their own branch", async () => {
    await expect(
      createPurchase(purchase({ amountPaid: 100000, paidAllocations: [{ branch: "Branch 2", amount: 100000 }] }), "u1", ["Branch 1"]),
    ).rejects.toThrow();
  });

  it("records no split when nothing was paid", async () => {
    const p = await createPurchase(purchase({ amountPaid: 0, paidAllocations: [{ branch: "Branch 2", amount: 0 }] }), "u1", null);
    expect(p.paidAllocations).toBeUndefined();
  });

  it("shows each branch's payment on the statement, and a Porur user sees only theirs", async () => {
    const p = await createPurchase(
      purchase({ amountPaid: 300000, paidAllocations: [{ branch: "Branch 1", amount: 100000 }, { branch: "Branch 2", amount: 200000 }] }),
      "u1", null,
    );
    const mine = (await vendorStatement("v1")).filter((e) => e.id.startsWith(`${p.id}:initial`));
    expect(mine.map((e) => [e.branch, e.amount]).sort()).toEqual([["Branch 1", 100000], ["Branch 2", 200000]]);
    const porur = (await vendorStatement("v1", ["Branch 2"])).filter((e) => e.id.startsWith(`${p.id}:initial`));
    expect(porur.map((e) => e.amount)).toEqual([200000]);
  });
});

describe("part-payments against a saved bill", () => {
  it("a single-branch payment goes to that branch", async () => {
    const p = await createPurchase(purchase(), "u1", null);
    const before = (await outstanding("Branch 2"))?.paid ?? 0;
    await createVendorPayment({ vendorId: "v1", purchaseId: p.id, branch: "Branch 2", amount: 50000, mode: "CASH" }, "u1");
    expect(((await outstanding("Branch 2"))?.paid ?? 0) - before).toBe(50000);
  });

  it("can be split across branches, each paying its own share", async () => {
    const p = await createPurchase(purchase(), "u1", null);
    const b1 = (await outstanding("Branch 1"))?.paid ?? 0;
    const b2 = (await outstanding("Branch 2"))?.paid ?? 0;
    const rows = await createVendorPaymentSplit(
      { vendorId: "v1", purchaseId: p.id, mode: "UPI", allocations: [{ branch: "Branch 1", amount: 30000 }, { branch: "Branch 2", amount: 70000 }] },
      "u1", null,
    );
    expect(rows).toHaveLength(2);
    expect(((await outstanding("Branch 1"))?.paid ?? 0) - b1).toBe(30000);
    expect(((await outstanding("Branch 2"))?.paid ?? 0) - b2).toBe(70000);
    expect((await getPurchase(p.id))?.paymentsTotal).toBe(100000);
  });

  it("refuses a split that overpays the bill and writes nothing", async () => {
    const p = await createPurchase(purchase(), "u1", null);
    const total = (await getPurchase(p.id))!.totalAmount;
    await expect(
      createVendorPaymentSplit(
        { vendorId: "v1", purchaseId: p.id, mode: "CASH", allocations: [{ branch: "Branch 1", amount: total }, { branch: "Branch 2", amount: 1 }] },
        "u1", null,
      ),
    ).rejects.toThrow(/exceeds/);
    expect((await getPurchase(p.id))?.paymentsTotal).toBe(0);
  });

  it("refuses a branch paying more than it owes on the bill, even when the total fits", async () => {
    const p = await createPurchase(purchase(), "u1", null);
    const owed = (await getPurchases()).find((x) => x.id === p.id)!.branchOwed;
    const [a, b] = Object.keys(owed);
    await expect(
      createVendorPaymentSplit(
        { vendorId: "v1", purchaseId: p.id, mode: "CASH", allocations: [{ branch: a, amount: owed[a] + 1 }] },
        "u1", null,
      ),
    ).rejects.toThrow(/only owes/);
    expect((await getPurchase(p.id))?.paymentsTotal).toBe(0);
    // Paying exactly what each owes is fine.
    await createVendorPaymentSplit(
      { vendorId: "v1", purchaseId: p.id, mode: "CASH", allocations: [{ branch: a, amount: owed[a] }, { branch: b, amount: owed[b] }] },
      "u1", null,
    );
    expect((await getPurchase(p.id))?.paymentsTotal).toBe(owed[a] + owed[b]);
  });

  it("refuses a branch that didn't receive stock, and staff outside their branches", async () => {
    const p = await createPurchase(purchase(), "u1", null);
    await expect(
      createVendorPaymentSplit({ vendorId: "v1", purchaseId: p.id, mode: "CASH", allocations: [{ branch: "Branch 3", amount: 100 }] }, "u1", null),
    ).rejects.toThrow(/no stock in/);
    expect((await getPurchase(p.id))?.paymentsTotal).toBe(0);
    await expect(
      createVendorPaymentSplit({ vendorId: "v1", purchaseId: p.id, mode: "CASH", allocations: [{ branch: "Branch 2", amount: 100 }] }, "u1", ["Branch 1"]),
    ).rejects.toThrow();
  });
});

describe("a branch can't pay more than its part of the bill", () => {
  // purchase(): 6 into Vadapalani, 4 into Porur → total ₹11,800 → shares ₹7,080 / ₹4,720.
  it("splits the total by the goods each branch took", () => {
    expect(shareByBranch(1_180_000, [
      { branch: "Branch 1", quantity: 6, unitCost: 100000 }, { branch: "Branch 2", quantity: 4, unitCost: 100000 },
    ])).toEqual({ "Branch 1": 708000, "Branch 2": 472000 });
    // free goods split by units; a branch with nothing gets nothing, not the rounding
    expect(shareByBranch(100, [{ branch: "Branch 1", quantity: 1, unitCost: 0 }, { branch: "Branch 2", quantity: 2, unitCost: 0 }])).toEqual({ "Branch 1": 33, "Branch 2": 67 });
  });

  it("refuses a purchase where a branch pays above its share, but accepts exactly its share", async () => {
    await expect(createPurchase(purchase({ amountPaid: 500000, paidAllocations: [{ branch: "Branch 2", amount: 500000 }] }), "u1", null)).rejects.toThrow(/only owes/);
    const ok = await createPurchase(purchase({ amountPaid: 472000, paidAllocations: [{ branch: "Branch 2", amount: 472000 }] }), "u1", null);
    expect(ok.amountPaid).toBe(472000);
  });

  it("counts later payments too when an edit raises what was paid at purchase", async () => {
    const p = await createPurchase(purchase(), "u1", null);
    await createVendorPayment({ vendorId: "v1", purchaseId: p.id, branch: "Branch 1", amount: 700000, mode: "CASH" }, "u1");
    // Vadapalani has paid ₹7,000 of its ₹7,080; ₹200 more at purchase would be ₹7,200.
    await expect(updatePurchase(p.id, { amountPaid: 20000, paidAllocations: [{ branch: "Branch 1", amount: 20000 }] })).rejects.toThrow(/only owes/);
    await updatePurchase(p.id, { amountPaid: 8000, paidAllocations: [{ branch: "Branch 1", amount: 8000 }] });
    expect((await getPurchases()).find((x) => x.id === p.id)!.branchOwed["Branch 1"]).toBe(0);
  });

  it("refuses a cost cut that would leave a branch over-paid", async () => {
    const p = await createPurchase(purchase({ amountPaid: 700000, paidAllocations: [{ branch: "Branch 1", amount: 700000 }] }), "u1", null);
    // Lines are per branch; cut Vadapalani's line cost so its share drops under ₹7,000.
    const line = p.lines.find((l) => l.branch === "Branch 1")!;
    await expect(updatePurchase(p.id, { lines: [{ id: line.id, unitCost: 50000 }], cgst: 63000, sgst: 63000 })).rejects.toThrow(/only owes|can't exceed/);
  });
});

describe("the GST typed on a purchase has to make sense", () => {
  const lines = [{ quantity: 10, unitCost: 100000, gst: 18 }]; // GST ₹1,800
  it("accepts the calculated figure, a few rupees of rounding, and inter-state IGST", () => {
    expect(checkPurchaseTax(lines, { cgst: 90000, sgst: 90000, igst: 0 })).toBeNull();
    expect(checkPurchaseTax(lines, { cgst: 90500, sgst: 90500, igst: 0 })).toBeNull(); // ₹10 over, split evenly
    expect(checkPurchaseTax(lines, { cgst: 0, sgst: 0, igst: 180000 })).toBeNull();
  });
  it("refuses a GST figure far from the items' rates", () => {
    expect(checkPurchaseTax(lines, { cgst: 5000000, sgst: 5000000, igst: 0 })).toMatch(/should come to about ₹1,800\.00/);
    expect(checkPurchaseTax(lines, { cgst: 0, sgst: 0, igst: 0 })).toMatch(/should come to/);
  });
  it("refuses CGST/SGST together with IGST, and unequal CGST and SGST", () => {
    expect(checkPurchaseTax(lines, { cgst: 90000, sgst: 90000, igst: 50000 })).toMatch(/not both/);
    expect(checkPurchaseTax(lines, { cgst: 150000, sgst: 30000, igst: 0 })).toMatch(/must be equal/);
    expect(checkPurchaseTax(lines, { cgst: 90001, sgst: 90000, igst: 0 })).toBeNull(); // an odd paisa is fine
  });
  it("is enforced when a purchase is saved and when it is edited", async () => {
    await expect(createPurchase(purchase({ cgst: 5000000, sgst: 5000000, tax: 10000000, totalAmount: 1000000 + 10000000 }), "u1", null)).rejects.toThrow(/should come to/);
    await expect(createPurchase(purchase({ igst: 50000, tax: 230000, totalAmount: 1230000 }), "u1", null)).rejects.toThrow(/not both/);
    const p = await createPurchase(purchase(), "u1", null);
    await expect(updatePurchase(p.id, { cgst: 5000000, sgst: 5000000 })).rejects.toThrow(/should come to/);
    // changing a cost without the matching GST is refused too
    await expect(updatePurchase(p.id, { lines: [{ id: p.lines[0].id, unitCost: 10 }] })).rejects.toThrow(/should come to/);
  });
});

describe("line GST is stored", () => {
  it("keeps the rate on each saved line", async () => {
    const p = await createPurchase(purchase(), "u1", null);
    expect(p.lines.map((l) => l.gst)).toEqual([18, 18]);
  });

  it("rejects a nonsense rate", async () => {
    await expect(createPurchase(purchase({ lines: [{ productId: "p1", variantIndex: 0, unitCost: 100000, quantity: 10, gst: 150, allocations: [{ branch: "Branch 1", quantity: 10 }] }] }), "u1", null)).rejects.toThrow(/GST/);
  });
});

describe("editing a saved purchase", () => {
  it("changes a line's cost and GST % and re-derives the totals", async () => {
    const p = await createPurchase(purchase({ amountPaid: 100000, paidAllocations: [{ branch: "Branch 1", amount: 100000 }] }), "u1", null);
    const tax = computePurchaseTax(p.lines.map((l) => ({ quantity: l.quantity, unitCost: 90000, gst: 12 })), false);
    const u = await updatePurchase(p.id, { lines: p.lines.map((l) => ({ id: l.id, unitCost: 90000, gst: 12 })), cgst: tax.cgst, sgst: tax.sgst, igst: tax.igst });
    expect(u?.subtotal).toBe(900000);
    expect(u?.totalAmount).toBe(900000 + tax.tax);
    const after = await getPurchase(p.id);
    expect(after?.lines.every((l) => l.unitCost === 90000 && l.gst === 12)).toBe(true);
  });

  it("refuses a total that would leave the bill overpaid", async () => {
    const p = await createPurchase(purchase({ amountPaid: 1_000_000, paidAllocations: [{ branch: "Branch 1", amount: 700000 }, { branch: "Branch 2", amount: 300000 }] }), "u1", null);
    await expect(updatePurchase(p.id, { lines: p.lines.map((l) => ({ id: l.id, unitCost: 10000 })), cgst: 0, sgst: 0 })).rejects.toThrow(PurchaseValidationError);
    expect((await getPurchase(p.id))?.lines[0].unitCost).toBe(100000); // nothing was written
  });

  it("won't edit a line from another purchase", async () => {
    const a = await createPurchase(purchase(), "u1", null);
    const b = await createPurchase(purchase(), "u1", null);
    await expect(updatePurchase(a.id, { lines: [{ id: b.lines[0].id, unitCost: 1 }] })).rejects.toThrow(/isn't part/);
  });

  it("re-splits the paid-now amount across receiving branches", async () => {
    const p = await createPurchase(purchase({ amountPaid: 100000, paidAllocations: [{ branch: "Branch 1", amount: 100000 }] }), "u1", null);
    const u = await updatePurchase(p.id, { paidAllocations: [{ branch: "Branch 1", amount: 40000 }, { branch: "Branch 2", amount: 60000 }] });
    expect(u?.paidAllocations).toEqual({ "Branch 1": 40000, "Branch 2": 60000 });
    await expect(updatePurchase(p.id, { paidAllocations: [{ branch: "Branch 3", amount: 100000 }] })).rejects.toThrow(/isn't receiving/);
    await expect(updatePurchase(p.id, { paidAllocations: [{ branch: "Branch 1", amount: 1 }] })).rejects.toThrow(/don't add up/);
  });

  it("needs a new split when the paid amount changes on a multi-branch bill", async () => {
    const p = await createPurchase(purchase({ amountPaid: 100000, paidAllocations: [{ branch: "Branch 1", amount: 60000 }, { branch: "Branch 2", amount: 40000 }] }), "u1", null);
    await expect(updatePurchase(p.id, { amountPaid: 200000 })).rejects.toThrow(/Split the new amount/);
    const u = await updatePurchase(p.id, { amountPaid: 200000, paidAllocations: [{ branch: "Branch 1", amount: 120000 }, { branch: "Branch 2", amount: 80000 }] });
    expect(u?.amountPaid).toBe(200000);
  });

  it("clears the split when the amount paid goes to zero", async () => {
    const p = await createPurchase(purchase({ amountPaid: 100000, paidAllocations: [{ branch: "Branch 1", amount: 100000 }] }), "u1", null);
    const u = await updatePurchase(p.id, { amountPaid: 0 });
    expect(u?.paidAllocations).toBeUndefined();
  });

  it("leaves stock quantities alone (only cost and GST change)", async () => {
    const p = await createPurchase(purchase(), "u1", null);
    await updatePurchase(p.id, { lines: p.lines.map((l) => ({ id: l.id, unitCost: 1 })), cgst: 1, sgst: 1 });
    const after = await getPurchase(p.id);
    expect(after?.lines.map((l) => l.quantity).sort()).toEqual([4, 6]);
  });
});

describe("prices that include GST", () => {
  it("takes the tax out of the price and gets back to the typed total", async () => {
    const { exclusiveCost, inclusiveCost, computeInclusiveTax } = await import("@/lib/gst/purchaseTax");
    expect(exclusiveCost(118000, 18)).toBe(100000);
    expect(inclusiveCost(100000, 18)).toBe(118000);
    expect(exclusiveCost(5000, 0)).toBe(5000);
    // 10 × ₹1,180 incl. 18% → goods ₹10,000 + GST ₹1,800 = ₹11,800
    expect(computeInclusiveTax([{ quantity: 10, unitCost: 118000, gst: 18 }], false)).toEqual({ cgst: 90000, sgst: 90000, igst: 0, tax: 180000 });
    expect(computeInclusiveTax([{ quantity: 10, unitCost: 118000, gst: 18 }], true)).toEqual({ cgst: 0, sgst: 0, igst: 180000, tax: 180000 });
  });

  it("keeps goods + tax equal to the typed total even when the cost doesn't divide evenly", async () => {
    const { exclusiveCost, computeInclusiveTax } = await import("@/lib/gst/purchaseTax");
    const lines = [{ quantity: 7, unitCost: 100000, gst: 18 }, { quantity: 3, unitCost: 99999, gst: 5 }];
    const typedTotal = lines.reduce((n, l) => n + l.quantity * l.unitCost, 0);
    const goods = lines.reduce((n, l) => n + l.quantity * exclusiveCost(l.unitCost, l.gst), 0);
    const t = computeInclusiveTax(lines, false);
    expect(goods + t.tax).toBe(typedTotal);
    expect(t.cgst + t.sgst).toBe(t.tax);
  });
});
