/**
 * Vendor opening balances (stored as a bill with no items, owed by one branch),
 * payments that must name a bill, and attaching an older vendor-level payment to bills.
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
import { products, vendorPayments, vendors } from "@/lib/db/schema";
import { insertVariants } from "@/lib/db/queries/variants";
import {
  applyPaymentToBills,
  createOpeningBalance,
  createPurchase,
  createVendorPayment,
  deleteOpeningBalance,
  getPurchase,
  getPurchases,
  branchOwedOn,
  payVendorBills,
  purchaseIdsInBranch,
  purchaseVisibleTo,
  unappliedPayments,
  updatePurchase,
  vendorOutstandings,
  vendorStatement,
} from "@/lib/db/queries/purchases";
import type { Variant } from "@/lib/stock";

const variant: Variant = { attr: "Std", finish: "", price: 100000, weight: 0, stockByBranch: {} };
const NOW = new Date().toISOString();

beforeAll(async () => {
  await db.select().from(vendors);
  await db.insert(vendors).values([
    { id: "va", name: "Vendor A", createdAt: NOW },
    { id: "vb", name: "Vendor B", createdAt: NOW },
  ]);
  await db.insert(products).values({ id: "px", slug: "px", name: "Flute", category: "wind" });
  await insertVariants("px", [variant]);
}, 60_000);

const row = async (vendorId: string, branch: string) => (await vendorOutstandings()).find((r) => r.vendorId === vendorId && r.branch === branch);

describe("opening balance", () => {
  it("counts as owed by its branch, and can be paid like any bill", async () => {
    const ob = await createOpeningBalance({ vendorId: "va", branch: "Branch 2", amount: 500000, asOf: "2026-04-01" }, "u1");
    expect(ob.openingBranch).toBe("Branch 2");
    expect(ob.totalAmount).toBe(500000);
    expect((await row("va", "Branch 2"))?.outstanding).toBe(500000);

    await createVendorPayment({ vendorId: "va", purchaseId: ob.id, branch: "Branch 2", amount: 200000, mode: "CASH" }, "u1");
    expect((await row("va", "Branch 2"))?.outstanding).toBe(300000);
    expect((await getPurchase(ob.id))?.paymentsTotal).toBe(200000);
  });

  it("must be paid from the branch that owes it", async () => {
    const ob = await createOpeningBalance({ vendorId: "vb", branch: "Branch 1", amount: 100000 }, "u1");
    await expect(createVendorPayment({ vendorId: "vb", purchaseId: ob.id, branch: "Branch 2", amount: 1000, mode: "CASH" }, "u1")).rejects.toThrow(/owed by/);
  });

  it("allows one per vendor and branch, and validates the amount", async () => {
    await expect(createOpeningBalance({ vendorId: "va", branch: "Branch 2", amount: 1 }, "u1")).rejects.toThrow(/already has an opening balance/);
    await expect(createOpeningBalance({ vendorId: "va", branch: "Branch 1", amount: 0 }, "u1")).rejects.toThrow(/more than 0/);
    await expect(createOpeningBalance({ vendorId: "va", branch: "Nowhere", amount: 100 }, "u1")).rejects.toThrow(/Unknown branch/);
    await expect(createOpeningBalance({ vendorId: "nope", branch: "Branch 1", amount: 100 }, "u1")).rejects.toThrow(/Unknown vendor/);
  });

  it("can be edited but not below what's paid, and removed only while unpaid", async () => {
    const ob = await createOpeningBalance({ vendorId: "va", branch: "Branch 3", amount: 100000 }, "u1");
    await createVendorPayment({ vendorId: "va", purchaseId: ob.id, branch: "Branch 3", amount: 40000, mode: "UPI" }, "u1");
    await expect(updatePurchase(ob.id, { openingAmount: 30000 })).rejects.toThrow(/already been paid/);
    const u = await updatePurchase(ob.id, { openingAmount: 120000 });
    expect(u?.totalAmount).toBe(120000);
    expect((await row("va", "Branch 3"))?.purchased).toBe(120000);
    await expect(deleteOpeningBalance(ob.id)).rejects.toThrow(/Payments are recorded/);
  });

  it("is removable when nothing is paid, and ignores real purchases", async () => {
    const ob = await createOpeningBalance({ vendorId: "vb", branch: "Branch 3", amount: 5000 }, "u1");
    expect(await deleteOpeningBalance(ob.id)).toBe(true);
    expect(await getPurchase(ob.id)).toBeUndefined();
    const real = await createPurchase({
      batchId: "p5-real", vendorId: "vb", subtotal: 100000, totalAmount: 100000,
      lines: [{ productId: "px", variantIndex: 0, unitCost: 100000, quantity: 1, allocations: [{ branch: "Branch 1", quantity: 1 }] }],
    }, "u1", null);
    await expect(deleteOpeningBalance(real.id)).rejects.toThrow(/Only an opening balance/);
  });

  it("shows on the statement, and only to staff of that branch", async () => {
    const all = await vendorStatement("va", null);
    expect(all.some((e) => e.invoiceNo === "Opening balance" && e.branch === "Branch 2" && e.amount === 500000)).toBe(true);
    const porurOnly = await vendorStatement("va", ["Branch 1"]);
    expect(porurOnly.some((e) => e.invoiceNo === "Opening balance")).toBe(false);
    const own = await vendorStatement("va", ["Branch 2"]);
    expect(own.some((e) => e.invoiceNo === "Opening balance")).toBe(true);
  });

  it("is visible to staff of the owing branch only", async () => {
    const ob = (await vendorStatement("va", null)).find((e) => e.invoiceNo === "Opening balance" && e.branch === "Branch 2")!;
    expect(await purchaseVisibleTo(ob.id, ["Branch 2"])).toBe(true);
    expect(await purchaseVisibleTo(ob.id, ["Branch 1"])).toBe(false);
    expect((await purchaseIdsInBranch(["Branch 2"])).has(ob.id)).toBe(true);
  });
});

describe("applying a vendor-level payment to bills", () => {
  async function bill(batchId: string, total: number) {
    return createPurchase({
      batchId, vendorId: "vb", subtotal: total, totalAmount: total,
      lines: [{ productId: "px", variantIndex: 0, unitCost: total, quantity: 1, allocations: [{ branch: "Branch 2", quantity: 1 }] }],
    }, "u1", null);
  }
  const loose = async (amount: number, branch = "Branch 2") => {
    await db.insert(vendorPayments).values({ id: `PAY-loose-${amount}-${branch}`, vendorId: "vb", purchaseId: null, branch, amount, mode: "CASH", reference: "", paidAt: "2026-05-01", notes: "", createdBy: "u0", createdAt: NOW });
    return `PAY-loose-${amount}-${branch}`;
  };

  it("splits one payment across two bills without moving branch outstandings", async () => {
    const b1 = await bill("ap-1", 750000);
    const b2 = await bill("ap-2", 400000);
    const before = (await row("vb", "Branch 2"))?.outstanding ?? 0;
    const id = await loose(1150000);
    expect((await row("vb", "Branch 2"))?.outstanding).toBe(before - 1150000);

    await applyPaymentToBills(id, [{ purchaseId: b1.id, amount: 750000 }, { purchaseId: b2.id, amount: 400000 }]);
    expect((await getPurchase(b1.id))?.paymentsTotal).toBe(750000);
    expect((await getPurchase(b2.id))?.paymentsTotal).toBe(400000);
    expect((await row("vb", "Branch 2"))?.outstanding).toBe(before - 1150000);
    expect((await unappliedPayments("vb")).some((p) => p.id === id)).toBe(false);
  });

  it("keeps whatever isn't applied as an unassigned payment", async () => {
    const b = await bill("ap-3", 300000);
    const id = await loose(500000, "Branch 2");
    await applyPaymentToBills(id, [{ purchaseId: b.id, amount: 300000 }]);
    const left = (await unappliedPayments("vb")).filter((p) => p.amount === 200000);
    expect(left).toHaveLength(1);
  });

  it("refuses more than the bill owes, more than the payment, or a bill that isn't the vendor's", async () => {
    const b = await bill("ap-4", 100000);
    const id = await loose(900000, "Branch 1");
    await expect(applyPaymentToBills(id, [{ purchaseId: b.id, amount: 200000 }])).rejects.toThrow(/less outstanding/);
    await expect(applyPaymentToBills(id, [{ purchaseId: "missing", amount: 1 }])).rejects.toThrow(/Bill not found/);
    await expect(applyPaymentToBills(id, [])).rejects.toThrow(/at least one bill/);
    await expect(applyPaymentToBills("nope", [{ purchaseId: b.id, amount: 1 }])).rejects.toThrow(/Payment not found/);
  });

  it("won't re-apply a payment that is already against a bill", async () => {
    const b = await bill("ap-5", 100000);
    const p = await createVendorPayment({ vendorId: "vb", purchaseId: b.id, branch: "Branch 2", amount: 1000, mode: "CASH" }, "u1");
    await expect(applyPaymentToBills(p.id, [{ purchaseId: b.id, amount: 1000 }])).rejects.toThrow(/already against a bill/);
  });
});

describe("paying several bills at once", () => {
  async function bill(batchId: string, total: number, branch = "Branch 2") {
    return createPurchase({
      batchId, vendorId: "va", subtotal: total, totalAmount: total,
      lines: [{ productId: "px", variantIndex: 0, unitCost: total, quantity: 1, allocations: [{ branch, quantity: 1 }] }],
    }, "u1", null);
  }

  it("saves one payment per row and each bill's balance drops", async () => {
    const b1 = await bill("pv-1", 400000);
    const b2 = await bill("pv-2", 750000);
    await payVendorBills({ vendorId: "va", rows: [{ purchaseId: b1.id, branch: "Branch 2", amount: 400000 }, { purchaseId: b2.id, branch: "Branch 2", amount: 100000 }], mode: "CASH" }, "u1", null);
    expect((await getPurchase(b1.id))?.paymentsTotal).toBe(400000);
    expect((await getPurchase(b2.id))?.paymentsTotal).toBe(100000);
  });

  it("saves nothing if any bill is overpaid or isn't the vendor's", async () => {
    const b1 = await bill("pv-3", 100000);
    const b2 = await bill("pv-4", 100000);
    await expect(payVendorBills({ vendorId: "va", rows: [{ purchaseId: b1.id, branch: "Branch 2", amount: 50000 }, { purchaseId: b2.id, branch: "Branch 2", amount: 200000 }], mode: "CASH" }, "u1", null)).rejects.toThrow(/less outstanding/);
    expect((await getPurchase(b1.id))?.paymentsTotal).toBe(0);
    await expect(payVendorBills({ vendorId: "vb", rows: [{ purchaseId: b1.id, branch: "Branch 2", amount: 1 }], mode: "CASH" }, "u1", null)).rejects.toThrow(/isn't this vendor's/);
  });

  it("withdraws earlier rows if a later one fails, and respects branch access", async () => {
    const b1 = await bill("pv-5", 100000, "Branch 1");
    await expect(payVendorBills({ vendorId: "va", rows: [{ purchaseId: b1.id, branch: "Branch 1", amount: 10000 }, { purchaseId: b1.id, branch: "Branch 2", amount: 10000 }], mode: "CASH" }, "u1", null)).rejects.toThrow(/no stock/);
    expect((await getPurchase(b1.id))?.paymentsTotal).toBe(0);
    await expect(payVendorBills({ vendorId: "va", rows: [{ purchaseId: b1.id, branch: "Branch 1", amount: 10000 }], mode: "CASH" }, "u1", ["Branch 2"])).rejects.toThrow(/You can only/);
  });
});

describe("what each branch still owes on a bill", () => {
  it("is each branch's share minus what it paid at purchase and since", async () => {
    // 6,000 into Vadapalani, 3,000 into Porur (no GST); Vadapalani pays its 6,000 up front.
    const p = await createPurchase({
      batchId: "bo-1", vendorId: "vb", subtotal: 900000, totalAmount: 900000, amountPaid: 600000,
      paidAllocations: [{ branch: "Branch 1", amount: 600000 }],
      lines: [{ productId: "px", variantIndex: 0, unitCost: 100000, quantity: 9, allocations: [{ branch: "Branch 1", quantity: 6 }, { branch: "Branch 2", quantity: 3 }] }],
    }, "u1", null);
    const owed = async () => (await getPurchases()).find((x) => x.id === p.id)!.branchOwed;
    expect(await owed()).toEqual({ "Branch 1": 0, "Branch 2": 300000 });
    await createVendorPayment({ vendorId: "vb", purchaseId: p.id, branch: "Branch 2", amount: 100000, mode: "CASH" }, "u1");
    expect(await owed()).toEqual({ "Branch 1": 0, "Branch 2": 200000 });
  });

  it("falls back to the by-goods split for older bills, and never goes below 0", () => {
    const lines = [{ branch: "Branch 1", quantity: 6, unitCost: 100000 }, { branch: "Branch 2", quantity: 3, unitCost: 100000 }];
    expect(branchOwedOn({ totalAmount: 900000, amountPaid: 300000 }, lines, {})).toEqual({ "Branch 1": 400000, "Branch 2": 200000 });
    expect(branchOwedOn({ totalAmount: 900000, amountPaid: 0 }, lines, { "Branch 2": 999999 })["Branch 2"]).toBe(0);
  });
});

