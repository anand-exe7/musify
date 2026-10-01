/**
 * End-to-end check of the billing-panel save path (`createBill` + the ledger
 * invoice) against an in-memory Postgres built from the migrations: stock must
 * come off the bill's own branch only, an oversell must be refused, deleting a
 * bill must put stock back, and the invoice must carry phone / delivery / discount.
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
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createBill, deleteBill } from "@/lib/db/queries/pos";
import { recordBillInvoice } from "@/lib/billing/ledger";
import { getInvoiceByRefId } from "@/lib/db/queries/invoices";
import { variantStockAt, type Variant } from "@/lib/stock";
import type { Bill } from "@/lib/store/pos";

const variant: Variant = { attr: "Std", finish: "", price: 100000, weight: 0, stockByBranch: { "Branch 1": 10, "Branch 2": 7 } };
const stock = async (b: "Branch 1" | "Branch 2") => {
  const [p] = await db.select().from(products).where(eq(products.id, "bill-p"));
  return variantStockAt((p.variants as Variant[])[0], b);
};

const bill = (id: string, branch: Bill["branch"], qty: number): Bill => ({
  id, createdAt: new Date().toISOString(), customerName: "Test", phone: "9876543210", source: "offline", branch,
  items: [{ name: "Thing", price: 100000, qty, gstRate: 18, hsn: "9207", mrp: 120000, discount: 10000, instruction: "SN-12345", productId: "bill-p", variantIndex: 0 }],
  subtotal: 100000 * qty, discount: 10000 + 5000, delivery: 20000,
  total: 100000 * qty - 15000 + 20000, gstEnabled: true, taxable: 0, cgst: 0, sgst: 0, gst: 0, status: "completed", payment: "Cash",
});

beforeAll(async () => {
  await db.insert(products).values({ id: "bill-p", slug: "bill-p", name: "Bill product", category: "string", variants: [variant] });
}, 60_000);

describe("billing panel sale", () => {
  it("takes stock from the bill's branch only", async () => {
    await createBill(bill("B-1", "Branch 1", 3));
    expect(await stock("Branch 1")).toBe(7);
    expect(await stock("Branch 2")).toBe(7);
    await createBill(bill("B-2", "Branch 2", 2));
    expect(await stock("Branch 1")).toBe(7);
    expect(await stock("Branch 2")).toBe(5);
  });

  it("refuses an oversell and leaves stock untouched", async () => {
    await expect(createBill(bill("B-3", "Branch 2", 6))).rejects.toThrow(/only 5 in stock/);
    expect(await stock("Branch 2")).toBe(5);
  });

  it("records phone, delivery and the overall discount on the invoice", async () => {
    await recordBillInvoice(bill("B-1", "Branch 1", 3));
    const inv = await getInvoiceByRefId("B-1");
    expect(inv?.customerPhone).toBe("9876543210");
    expect(inv?.delivery).toBe(20000);
    expect(inv?.discount).toBe(5000); // overall = bill discount − per-line discount
    expect(inv?.items[0]).toMatchObject({ mrp: 120000, discount: 10000, instruction: "SN-12345" });
  });

  it("puts stock back when the bill is deleted", async () => {
    await createBill(bill("B-4", "Branch 1", 4));
    expect(await stock("Branch 1")).toBe(3);
    await deleteBill("B-4");
    expect(await stock("Branch 1")).toBe(7);
  });
});
