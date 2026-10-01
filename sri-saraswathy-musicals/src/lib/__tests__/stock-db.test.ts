/**
 * The stock/order write paths run against a real (in-memory) Postgres built from
 * the migrations, with the app's `db` swapped for it. These are the places where
 * a unit test on pure maths can't catch the bug: partial failures, retries,
 * concurrent writers and database constraints.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { products, orders, stockTransfers, vendors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { takeStock, adjustProductStock } from "@/lib/db/queries/stockOps";
import { createTransfer, createTransferBatch } from "@/lib/db/queries/stockTransfers";
import { createInwardBatch } from "@/lib/db/queries/stock";
import { updateInventoryProduct } from "@/lib/db/queries/pos";
import { isUniqueViolation } from "@/lib/db/queries/_util";
import { variantStockAt, type Variant } from "@/lib/stock";

const v = (b1: number, b2 = 0, attr = "Std"): Variant => ({ attr, finish: "", price: 100000, weight: 0, stockByBranch: { "Branch 1": b1, "Branch 2": b2 } });

async function seed(id: string, variants: Variant[]) {
  await db.delete(products).where(eq(products.id, id));
  await db.insert(products).values({ id, slug: id, name: `Product ${id}`, category: "string", variants });
}
const stockOf = async (id: string, i: number, b: "Branch 1" | "Branch 2") => {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  return variantStockAt((p.variants as Variant[])[i], b);
};

beforeAll(async () => {
  await db.select().from(products); // force the mocked db (and migrations) to be ready
}, 60_000);

describe("takeStock undo", () => {
  it("puts back exactly what was taken when a paid order oversold", async () => {
    await seed("p-undo", [v(2)]);
    const { undo, shortfalls } = await takeStock([{ productId: "p-undo", variantIndex: 0, quantity: 5 }], "Branch 1", { allowShort: true });
    expect(await stockOf("p-undo", 0, "Branch 1")).toBe(0);
    expect(shortfalls).toHaveLength(1);
    await undo(); // the order failed to save
    expect(await stockOf("p-undo", 0, "Branch 1")).toBe(2); // not 5
  });

  it("restores earlier lines when a later one is refused", async () => {
    await seed("p-a", [v(3)]);
    await seed("p-b", [v(0)]);
    await expect(
      takeStock(
        [
          { productId: "p-a", variantIndex: 0, quantity: 2 },
          { productId: "p-b", variantIndex: 0, quantity: 1 },
        ],
        "Branch 1",
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await stockOf("p-a", 0, "Branch 1")).toBe(3);
  });
});

describe("one order per payment", () => {
  const base = { date: "2026-10-01", status: "processing" };
  it("rejects a second order with the same payment id", async () => {
    await db.insert(orders).values({ ...base, id: "ORD-1", paymentId: "pay_123" });
    const dup = db.insert(orders).values({ ...base, id: "ORD-2", paymentId: "pay_123" });
    await expect(dup).rejects.toSatisfy(isUniqueViolation);
  });
  it("lets any number of cash-on-delivery orders (empty payment id) through", async () => {
    await db.insert(orders).values({ ...base, id: "ORD-3", paymentId: "" });
    await db.insert(orders).values({ ...base, id: "ORD-4", paymentId: "" });
  });
});

describe("batch retries finish the batch", () => {
  beforeEach(async () => {
    await db.delete(stockTransfers);
  });

  it("transfers: a batch that stopped after line 1 is completed on retry, once", async () => {
    await seed("p-t", [v(5, 0, "A"), v(5, 0, "B")]);
    // The first attempt saved line 1 and then failed.
    await createTransfer({ id: "batch1-1", productId: "p-t", variantIndex: 0, quantity: 2, fromBranch: "Branch 1", toBranch: "Branch 2" });
    const lines = [
      { productId: "p-t", variantIndex: 0, quantity: 2 },
      { productId: "p-t", variantIndex: 1, quantity: 3 },
    ];
    const recs = await createTransferBatch(lines, "Branch 1", "Branch 2", "", "u1", "batch1");
    expect(recs.map((r) => r.id).sort()).toEqual(["batch1-1", "batch1-2"]);
    expect(await stockOf("p-t", 0, "Branch 1")).toBe(3); // moved once, not twice
    expect(await stockOf("p-t", 0, "Branch 2")).toBe(2);
    expect(await stockOf("p-t", 1, "Branch 1")).toBe(2);
    expect(await stockOf("p-t", 1, "Branch 2")).toBe(3);

    // And a full resubmission changes nothing.
    await createTransferBatch(lines, "Branch 1", "Branch 2", "", "u1", "batch1");
    expect(await stockOf("p-t", 1, "Branch 1")).toBe(2);
  });

  it("transfers: a batch id can't carry LIKE wildcards or odd characters", async () => {
    await expect(
      createTransferBatch([{ productId: "p-t", variantIndex: 0, quantity: 1 }], "Branch 1", "Branch 2", "", "u1", "%"),
    ).rejects.toThrow(/batch id/i);
  });

  it("inward: resubmitting adds each line's stock once and fills any gap", async () => {
    await seed("p-i", [v(0, 0, "A"), v(0, 0, "B")]);
    await db.insert(vendors).values({ id: "v1", name: "Vendor" }).onConflictDoNothing();
    const lines = [
      { productId: "p-i", variantIndex: 0, unitCost: 100, quantity: 4, allocations: [{ branch: "Branch 1" as const, quantity: 4 }] },
      { productId: "p-i", variantIndex: 1, unitCost: 100, quantity: 6, allocations: [{ branch: "Branch 2" as const, quantity: 6 }] },
    ];
    // Only the first row made it the first time.
    await createInwardBatch("v1", lines.slice(0, 1), "u1", null, "inw1");
    expect(await stockOf("p-i", 0, "Branch 1")).toBe(4);
    const recs = await createInwardBatch("v1", lines, "u1", null, "inw1");
    expect(recs).toHaveLength(2);
    expect(await stockOf("p-i", 0, "Branch 1")).toBe(4); // not 8
    expect(await stockOf("p-i", 1, "Branch 2")).toBe(6);
  });
});

describe("product editor saves", () => {
  it("does not hand sold stock back when the form's copy is stale", async () => {
    await seed("p-e", [v(5)]);
    // The editor opened with Branch 1 = 5; then a web order took 2.
    await adjustProductStock("p-e", [{ variantIndex: 0, branch: "Branch 1", delta: -2 }]);
    // The admin only fixes the price; the form still carries the stale 5.
    await updateInventoryProduct("p-e", { variants: [{ ...v(5), price: 120000 }] as never });
    expect(await stockOf("p-e", 0, "Branch 1")).toBe(3);
    const [p] = await db.select().from(products).where(eq(products.id, "p-e"));
    expect((p.variants as Variant[])[0].price).toBe(120000);
  });

  it("applies a deliberate stock edit as a difference on top of live stock", async () => {
    await seed("p-d", [v(5)]);
    await adjustProductStock("p-d", [{ variantIndex: 0, branch: "Branch 1", delta: -2 }]); // now 3
    // The admin saw 5 and typed 8: that is "+3".
    await updateInventoryProduct("p-d", { variants: [v(8)] as never }, [{ variantIndex: 0, branch: "Branch 1", from: 5, to: 8 }]);
    expect(await stockOf("p-d", 0, "Branch 1")).toBe(6);
  });

  it("leaves the other branch alone", async () => {
    await seed("p-o", [v(5, 7)]);
    await updateInventoryProduct("p-o", {}, [{ variantIndex: 0, branch: "Branch 1", from: 5, to: 1 }]);
    expect(await stockOf("p-o", 0, "Branch 1")).toBe(1);
    expect(await stockOf("p-o", 0, "Branch 2")).toBe(7);
  });

  it("writes added/removed variants as the editor has them", async () => {
    await seed("p-s", [v(5, 0, "A"), v(5, 0, "B")]);
    await updateInventoryProduct("p-s", { variants: [v(9, 0, "A")] as never });
    const [p] = await db.select().from(products).where(eq(products.id, "p-s"));
    expect((p.variants as Variant[]).length).toBe(1);
  });
});
