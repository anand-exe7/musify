/**
 * Deleting a vendor bill: the stock it brought in is taken back out, a bill whose stock was already sold is
 * refused untouched, later payments stay on the vendor's account, and opening balances still go.
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
import { insertVariants, selectProduct } from "@/lib/db/queries/variants";
import { bumpStock } from "@/lib/db/queries/variants";
import {
  createOpeningBalance, createPurchase, createVendorPayment, deletePurchase, getPurchase, getVendorPayments,
  PurchaseValidationError, type PurchaseInput,
} from "@/lib/db/queries/purchases";
import { variantStockAt, type Variant } from "@/lib/stock";

const variant: Variant = { attr: "Std", finish: "", price: 100000, weight: 0, stockByBranch: { "Branch 1": 5 } };
const at = async (b: "Branch 1" | "Branch 2") => variantStockAt((await selectProduct("pd-p"))!.variants[0], b);

let n = 0;
const bill = (): PurchaseInput => {
  n += 1;
  return {
    batchId: `pd-batch-${n}`, vendorId: "pd-v", subtotal: 1_000_000, tax: 0, cgst: 0, sgst: 0, igst: 0, totalAmount: 1_000_000,
    lines: [{ productId: "pd-p", variantIndex: 0, unitCost: 100000, quantity: 10, gst: 0, allocations: [{ branch: "Branch 1", quantity: 6 }, { branch: "Branch 2", quantity: 4 }] }],
  };
};

beforeAll(async () => {
  await db.select().from(vendors);
  await db.insert(vendors).values({ id: "pd-v", name: "Delete Vendor", createdAt: new Date().toISOString() });
  await db.insert(products).values({ id: "pd-p", slug: "pd-p", name: "Delete product", category: "string" });
  await insertVariants("pd-p", [variant]);
}, 60_000);

describe("deleting a vendor bill", () => {
  it("takes its stock back out and removes the bill", async () => {
    const b1 = await at("Branch 1"), b2 = await at("Branch 2");
    const p = await createPurchase(bill(), "tester", null);
    expect(await at("Branch 1")).toBe(b1 + 6);
    expect(await at("Branch 2")).toBe(b2 + 4);
    expect(await deletePurchase(p.id, "reverse")).toBe(true);
    expect(await getPurchase(p.id)).toBeUndefined();
    expect(await at("Branch 1")).toBe(b1);
    expect(await at("Branch 2")).toBe(b2);
  });

  it("\"keep\" removes only the bill and leaves the stock exactly where it is", async () => {
    const p = await createPurchase(bill(), "tester", null);
    const b1 = await at("Branch 1"), b2 = await at("Branch 2");
    expect(await deletePurchase(p.id)).toBe(true); // keep is the default
    expect(await getPurchase(p.id)).toBeUndefined();
    expect(await at("Branch 1")).toBe(b1);
    expect(await at("Branch 2")).toBe(b2);
  });

  it("\"keep\" works even when the stock has since been sold, where \"reverse\" is refused", async () => {
    const p = await createPurchase(bill(), "tester", null);
    await bumpStock("pd-p", 0, "Branch 1", -(await at("Branch 1")), true);
    await expect(deletePurchase(p.id, "reverse")).rejects.toBeInstanceOf(PurchaseValidationError);
    expect(await deletePurchase(p.id, "keep")).toBe(true);
    expect(await getPurchase(p.id)).toBeUndefined();
  });

  it("is refused, changing nothing, when the stock has already been sold", async () => {
    const p = await createPurchase(bill(), "tester", null);
    const b2 = await at("Branch 2");
    await bumpStock("pd-p", 0, "Branch 1", -(await at("Branch 1")), true); // sell everything at Branch 1
    await expect(deletePurchase(p.id, "reverse")).rejects.toBeInstanceOf(PurchaseValidationError);
    expect(await getPurchase(p.id)).toBeTruthy();
    expect(await at("Branch 2")).toBe(b2); // the part that could be taken back was put back
  });

  it("keeps a later payment on the vendor's account as an unassigned payment", async () => {
    const p = await createPurchase(bill(), "tester", null);
    await createVendorPayment({ vendorId: "pd-v", purchaseId: p.id, branch: "Branch 1", amount: 50000, mode: "CASH", paidAt: "2026-10-20" }, "tester");
    expect(await deletePurchase(p.id, "reverse")).toBe(true);
    const left = (await getVendorPayments("pd-v")).filter((x) => x.amount === 50000);
    expect(left).toHaveLength(1);
    expect(left[0].purchaseId).toBeNull();
  });

  it("still removes an opening balance, and says no to an unknown bill", async () => {
    const ob = await createOpeningBalance({ vendorId: "pd-v", branch: "Branch 3", amount: 250000 }, "tester");
    expect(await deletePurchase(ob.id)).toBe(true);
    expect(await deletePurchase("nope")).toBe(false);
  });
});
