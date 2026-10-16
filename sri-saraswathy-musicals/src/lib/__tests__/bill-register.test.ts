/** The vendor-bill register: one line per bill, each with what every branch has to pay. */
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
import { createPurchase, createVendorPayment, createOpeningBalance, vendorOutstandings, type PurchaseInput } from "@/lib/db/queries/purchases";
import { getBillsPage, getBillDetail } from "@/lib/db/queries/purchaseBills";
import { getVendorRollup, getPurchaseAnalytics } from "@/lib/db/queries/purchaseViews";
import { computePurchaseTax } from "@/lib/gst/purchaseTax";
import { branchBills, shareFromAggregates, billStatus } from "@/lib/billShares";

beforeAll(async () => {
  await db.select().from(vendors);
  await db.insert(vendors).values([
    { id: "va", name: "Alpha Traders", createdAt: new Date().toISOString() },
    { id: "vb", name: "Beta Workshop", createdAt: new Date().toISOString() },
  ]);
  await db.insert(products).values({ id: "p1", slug: "p1", name: "Mridangam Wood", category: "percussion" });
  await insertVariants("p1", [{ attr: "18 Inch", finish: "", price: 100000, weight: 0, stockByBranch: {} }]);
}, 60_000);

let n = 0;
/** A bill of units at ₹1,500 + 18% GST, split across branches as given. */
function bill(vendorId: string, split: Record<string, number>, over: Partial<PurchaseInput> = {}): PurchaseInput {
  n += 1;
  const qty = Object.values(split).reduce((a, b) => a + b, 0);
  const tax = computePurchaseTax([{ quantity: qty, unitCost: 150000, gst: 18 }], false);
  return {
    batchId: `rb-${n}`, vendorId, subtotal: qty * 150000, ...tax, totalAmount: qty * 150000 + tax.tax,
    lines: [{ productId: "p1", variantIndex: 0, unitCost: 150000, quantity: qty, gst: 18, allocations: Object.entries(split).map(([branch, quantity]) => ({ branch, quantity })) }],
    purchaseDate: "2026-10-15",
    ...over,
  };
}

describe("the share rule", () => {
  it("splits by goods, gives a branch with nothing zero, and always adds up", () => {
    const s = shareFromAggregates(1_947_000, { "Branch 1": { goods: 750000, qty: 5 }, "Branch 2": { goods: 750000, qty: 5 }, "Branch 3": { goods: 150000, qty: 1 } });
    expect(s).toEqual({ "Branch 1": 885000, "Branch 2": 885000, "Branch 3": 177000 });
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(1_947_000);
    // free goods are split by units, always in the shop's fixed branch order
    expect(shareFromAggregates(100, { "Branch 2": { goods: 0, qty: 1 }, "Branch 1": { goods: 0, qty: 2 } })).toEqual({ "Branch 1": 67, "Branch 2": 33 });
  });

  it("works out each branch's line, flags an overpaid branch, and names the status", () => {
    const rows = branchBills({ total: 100, amountPaid: 80, paidAllocations: { "Branch 1": 30, "Branch 2": 50 } }, { "Branch 1": { goods: 60, qty: 3 }, "Branch 2": { goods: 40, qty: 2 } }, {});
    expect(rows.find((r) => r.branch === "Branch 1")).toMatchObject({ bill: 60, paid: 30, left: 30, over: 0 });
    expect(rows.find((r) => r.branch === "Branch 2")).toMatchObject({ bill: 40, paid: 50, left: 0, over: 10 });
    expect(billStatus(100, 0)).toBe("unpaid");
    expect(billStatus(100, 40)).toBe("part");
    expect(billStatus(100, 100)).toBe("paid");
  });
});

describe("the bill register", () => {
  it("shows one line per bill with what each branch has to pay (5 / 5 / 1 gives 8,850 / 8,850 / 1,770 rupees)", async () => {
    const p = await createPurchase(bill("va", { "Branch 1": 5, "Branch 2": 5, "Branch 3": 1 }, {
      invoiceNo: "INV-1",
      amountPaid: 977_000, paidAllocations: [{ branch: "Branch 1", amount: 300000 }, { branch: "Branch 2", amount: 500000 }, { branch: "Branch 3", amount: 177000 }],
    }), "u1", null);
    const page = await getBillsPage({ vendorId: "va" }, null);
    expect(page.total).toBe(1);
    const row = page.rows[0];
    expect(row).toMatchObject({ id: p.id, vendorName: "Alpha Traders", invoiceNo: "INV-1", total: 1_947_000, paid: 977_000, left: 970_000, status: "part", totalQty: 11 });
    expect(row.items).toEqual(["Mridangam Wood (18 Inch) ×11"]);
    const byBranch = Object.fromEntries(row.branches.map((b) => [b.branch, b]));
    expect(byBranch["Branch 1"]).toMatchObject({ qty: 5, bill: 885000, paid: 300000, left: 585000 });
    expect(byBranch["Branch 2"]).toMatchObject({ qty: 5, bill: 885000, paid: 500000, left: 385000 });
    expect(byBranch["Branch 3"]).toMatchObject({ qty: 1, bill: 177000, paid: 177000, left: 0, over: 0 });
    expect(row.overpaid).toBe(false);
  });

  it("counts later payments against the right branch and moves the bill to paid", async () => {
    const p = await createPurchase(bill("vb", { "Branch 1": 2, "Branch 2": 2 }), "u1", null); // 4 x 1,500 + GST = 7,080
    await createVendorPayment({ vendorId: "vb", purchaseId: p.id, branch: "Branch 1", amount: 354000, mode: "CASH" }, "u1");
    let row = (await getBillsPage({ vendorId: "vb" }, null)).rows[0];
    expect(row).toMatchObject({ paid: 354000, left: 354000, status: "part" });
    await createVendorPayment({ vendorId: "vb", purchaseId: p.id, branch: "Branch 2", amount: 354000, mode: "UPI" }, "u1");
    row = (await getBillsPage({ vendorId: "vb" }, null)).rows[0];
    expect(row).toMatchObject({ left: 0, status: "paid" });
  });

  it("filters by status, search (vendor, invoice, product) and date, and pages the result", async () => {
    await createOpeningBalance({ vendorId: "va", branch: "Branch 2", amount: 50000 }, "u1");
    expect((await getBillsPage({ status: "open" }, null)).rows.every((r) => r.status !== "paid")).toBe(true);
    expect((await getBillsPage({ status: "paid" }, null)).rows.map((r) => r.vendorName)).toEqual(["Beta Workshop"]);
    expect((await getBillsPage({ q: "alpha" }, null)).total).toBe(2); // the bill + the opening balance
    expect((await getBillsPage({ q: "inv-1" }, null)).total).toBe(1);
    expect((await getBillsPage({ q: "mridangam" }, null)).total).toBe(2);
    expect((await getBillsPage({ q: "%" }, null)).total).toBe(0);
    expect((await getBillsPage({ from: "2026-10-16" }, null)).total).toBe(1); // only the opening balance, saved today
    const all = await getBillsPage({ pageSize: 2, page: 1, sort: "oldest" }, null);
    expect(all).toMatchObject({ total: 3, pages: 2, pageSize: 2 });
    expect(all.rows).toHaveLength(2);
    expect((await getBillsPage({ pageSize: 2, page: 9 }, null)).page).toBe(2);
  });

  it("shows only one branch's part when filtered, and only a staff member's own branches", async () => {
    const porur = await getBillsPage({ branch: "Branch 2", vendorId: "va" }, null);
    const inv = porur.rows.find((r) => r.invoiceNo === "INV-1")!;
    expect(inv).toMatchObject({ total: 885000, paid: 500000, left: 385000 });
    expect(inv.branches.map((b) => b.branch)).toEqual(["Branch 2"]);
    const staff = await getBillsPage({}, ["Branch 3"]);
    expect(staff.rows.map((r) => r.invoiceNo)).toEqual(["INV-1"]);
    expect(staff.rows[0].branches.map((b) => b.branch)).toEqual(["Branch 3"]);
    expect(staff.rows[0].total).toBe(177000);
    expect((await getBillsPage({ branch: "Branch 1" }, ["Branch 3"])).total).toBe(0); // asking for a branch you can't see
  });

  it("adds up to the vendor outstandings, branch by branch", async () => {
    const reg = (await getBillsPage({ pageSize: 1000 }, null)).summary.branches;
    const out = await vendorOutstandings();
    for (const b of ["Branch 1", "Branch 2", "Branch 3"]) {
      const rows = out.filter((r) => r.branch === b);
      expect(reg[b]?.bought ?? 0, `${b} bought`).toBe(rows.reduce((x, r) => x + r.purchased, 0));
      expect(reg[b]?.paid ?? 0, `${b} paid`).toBe(rows.reduce((x, r) => x + r.paid, 0));
      expect(reg[b]?.left ?? 0, `${b} has to pay`).toBe(rows.reduce((x, r) => x + r.outstanding, 0));
    }
  });

  it("opens one bill with its items, branch lines and payment history", async () => {
    const id = (await getBillsPage({ q: "inv-1" }, null)).rows[0].id;
    const d = await getBillDetail(id, null);
    expect(d?.purchase.lines).toHaveLength(3);
    expect(d?.branches).toHaveLength(3);
    const vb = (await getBillsPage({ vendorId: "vb" }, null)).rows[0].id;
    const pays = (await getBillDetail(vb, null))!.payments;
    expect(pays.map((x) => [x.branch, x.amount])).toEqual([["Branch 1", 354000], ["Branch 2", 354000]]);
    expect((await getBillDetail(vb, ["Branch 2"]))!.payments.map((x) => x.branch)).toEqual(["Branch 2"]);
    expect(await getBillDetail("nope", null)).toBeUndefined();
  });
});

describe("by vendor", () => {
  it("gives one row per vendor, biggest balance first, matching the outstandings branch by branch", async () => {
    const r = await getVendorRollup({}, null);
    expect(r.rows.map((x) => x.vendorName)).toEqual(["Alpha Traders", "Beta Workshop"]);
    const alpha = r.rows[0];
    expect(alpha).toMatchObject({ bills: 2, bought: 1_997_000, paid: 977_000, left: 1_020_000 });
    const porur = alpha.branches.find((b) => b.branch === "Branch 2")!;
    expect(porur).toMatchObject({ bought: 935_000, paid: 500_000, left: 435_000 }); // its share of the bill + the old balance
    expect(r.rows[1]).toMatchObject({ left: 0 });
    const out = await vendorOutstandings();
    for (const row of r.rows) for (const b of row.branches) {
      const o = out.find((x) => x.vendorId === row.vendorId && x.branch === b.branch)!;
      expect([b.bought, b.paid, b.left]).toEqual([o.purchased, o.paid, o.outstanding]);
    }
  });

  it("searches by name, hides settled vendors on request, and shows only a staff member's branches", async () => {
    expect((await getVendorRollup({ q: "beta" }, null)).rows.map((x) => x.vendorName)).toEqual(["Beta Workshop"]);
    expect((await getVendorRollup({ openOnly: true }, null)).rows.map((x) => x.vendorName)).toEqual(["Alpha Traders"]);
    const staff = await getVendorRollup({}, ["Branch 3"]);
    expect(staff.rows.map((x) => x.vendorName)).toEqual(["Alpha Traders"]);
    expect(staff.rows[0].branches.map((b) => b.branch)).toEqual(["Branch 3"]);
    expect(staff.rows[0].left).toBe(0);
  });

  it("counts payments that name no bill, and the vendor's balance already includes them", async () => {
    await createVendorPayment({ vendorId: "va", branch: "Branch 1", amount: 10000, mode: "CASH" }, "u1");
    const alpha = (await getVendorRollup({}, null)).rows.find((x) => x.vendorId === "va")!;
    expect(alpha.unapplied).toEqual({ count: 1, amount: 10000 });
    expect(alpha).toMatchObject({ paid: 987_000, left: 1_010_000 });
    expect((await getVendorRollup({}, ["Branch 3"])).rows[0].unapplied.count).toBe(0);
  });
});

describe("purchase analytics", () => {
  it("splits bought, paid and still-to-pay by branch, with opening balances kept apart from purchases", async () => {
    const a = await getPurchaseAnalytics({}, null);
    expect(a.totals).toMatchObject({ bills: 2, qty: 15, bought: 2_655_000, opening: 50_000, paid: 1_685_000, left: 1_020_000 });
    expect(a.totals.goods + a.totals.gst).toBe(a.totals.bought);
    expect(a.branches["Branch 2"]).toMatchObject({ bills: 2, qty: 7, bought: 1_239_000, opening: 50_000, paid: 854_000, left: 435_000 });
    expect(Object.keys(a.branches)).toEqual(["Branch 1", "Branch 2", "Branch 3"]);
    expect(Object.values(a.branches).reduce((n, b) => n + b.left, 0)).toBe(a.totals.left); // the branches add up to the whole
    expect(a.months).toHaveLength(1);
    expect(a.months[0]).toMatchObject({ month: "2026-10", total: 2_655_000 });
    expect(a.unapplied).toEqual({ count: 1, amount: 10000 });
  });

  it("applies the branch, vendor and date filters to every figure", async () => {
    const porur = await getPurchaseAnalytics({ branch: "Branch 2" }, null);
    expect(Object.keys(porur.branches)).toEqual(["Branch 2"]);
    expect(porur.totals).toMatchObject({ bought: 1_239_000, paid: 854_000, left: 435_000 });
    expect(porur.vendors.map((v) => v.vendorName)).toEqual(["Alpha Traders", "Beta Workshop"]);
    const beta = await getPurchaseAnalytics({ vendorId: "vb" }, null);
    expect(beta.totals).toMatchObject({ bills: 1, bought: 708_000, left: 0, opening: 0 });
    expect((await getPurchaseAnalytics({ from: "2026-11-01" }, null)).totals).toMatchObject({ bills: 0, bought: 0 });
    expect((await getPurchaseAnalytics({}, ["Branch 3"])).totals).toMatchObject({ bought: 177_000, paid: 177_000, left: 0 });
  });
});
