/**
 * The Inventory screen reads the catalogue one page at a time: filters, sorting, paging, per-branch totals,
 * variants loaded per product, and the stock-alert list — all against an in-memory Postgres built from the migrations.
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
import { insertVariants } from "@/lib/db/queries/variants";
import { getInventoryPage, getInventoryIds, getInventoryVariants, getStockAlerts } from "@/lib/db/queries/inventoryPage";
import type { Variant } from "@/lib/stock";

const v = (attr: string, price: number, b1: number, b2 = 0, extra: Partial<Variant> = {}): Variant => ({
  attr, finish: "", price, weight: 0, stockByBranch: { "Branch 1": b1, "Branch 2": b2 }, ...extra,
});

beforeAll(async () => {
  await db.insert(products).values([
    { id: "ip-a", slug: "ip-a", name: "Alpha guitar", brand: "Yamaha", category: "String", department: "Guitars", price: 500000, lowStockAt: 4 },
    { id: "ip-b", slug: "ip-b", name: "Beta drum", category: "Percussion", department: "Drums", price: 900000, lowStockAt: 4 },
    { id: "ip-c", slug: "ip-c", name: "Gamma flute", category: "Wind", department: "Flutes", price: 100000, lowStockAt: 2 },
    { id: "ip-d", slug: "ip-d", name: "Delta empty", category: "String", department: "Guitars", price: 300000, lowStockAt: 4, active: false },
  ]);
  await insertVariants("ip-a", [v("Red", 500000, 5, 3), v("Blue", 520000, 0, 0), v("Off", 1, 50, 50, { disabled: true })]); // total 8, one variant out
  await insertVariants("ip-b", [v("Std", 900000, 2, 1)]);                                                                 // total 3 → low
  await insertVariants("ip-c", [v("Std", 100000, 10, 10)]);                                                              // total 20 → in
  // ip-d has no variants → out
}, 60_000);

describe("inventory page", () => {
  it("returns light rows with per-branch totals and a status, disabled variants excluded", async () => {
    const page = await getInventoryPage({ sort: "name" });
    expect(page.total).toBe(4);
    const a = page.items.find((r) => r.id === "ip-a")!;
    expect(a.total).toBe(8);
    expect(a.stockByBranch["Branch 1"]).toBe(5);
    expect(a.stockByBranch["Branch 2"]).toBe(3);
    expect(a.variantCount).toBe(3);
    expect(a.state).toBe("in");
    expect(page.items.find((r) => r.id === "ip-b")!.state).toBe("low");
    expect(page.items.find((r) => r.id === "ip-d")).toMatchObject({ total: 0, state: "out", variantCount: 0 });
    expect(page.categories).toEqual(["Percussion", "String", "Wind"]);
    expect(page.items.every((r) => !("variants" in r))).toBe(true);
  });

  it("filters by status, category, department and search", async () => {
    expect((await getInventoryPage({ status: "low" })).items.map((r) => r.id)).toEqual(["ip-b"]);
    expect((await getInventoryPage({ status: "out" })).items.map((r) => r.id)).toEqual(["ip-d"]);
    expect((await getInventoryPage({ category: "String" })).total).toBe(2);
    expect((await getInventoryPage({ department: "Flutes" })).items.map((r) => r.id)).toEqual(["ip-c"]);
    expect((await getInventoryPage({ q: "yamaha" })).items.map((r) => r.id)).toEqual(["ip-a"]);
    expect((await getInventoryPage({ q: "GAMMA" })).items.map((r) => r.id)).toEqual(["ip-c"]);
    expect((await getInventoryPage({ q: "100%" })).total).toBe(0); // % is literal, not a wildcard
  });

  it("sorts and pages", async () => {
    expect((await getInventoryPage({ sort: "price" })).items.map((r) => r.id)).toEqual(["ip-b", "ip-a", "ip-d", "ip-c"]);
    expect((await getInventoryPage({ sort: "stock" })).items.map((r) => r.id)).toEqual(["ip-c", "ip-a", "ip-b", "ip-d"]);
    const p1 = await getInventoryPage({ sort: "name", pageSize: 3, page: 1 });
    const p2 = await getInventoryPage({ sort: "name", pageSize: 3, page: 2 });
    expect([p1.items.length, p2.items.length, p1.pages]).toEqual([3, 1, 2]);
    expect(p2.items[0].id).toBe("ip-c"); // Alpha, Beta, Delta | Gamma
    expect((await getInventoryPage({ sort: "name", pageSize: 3, page: 99 })).page).toBe(2); // clamped
  });

  it("lists the ids of every match (for exports)", async () => {
    expect((await getInventoryIds({ category: "String" })).sort()).toEqual(["ip-a", "ip-d"]);
  });

  it("loads one product's variants with stock per branch, in order", async () => {
    const vs = (await getInventoryVariants("ip-a"))!;
    expect(vs.map((x) => x.attr)).toEqual(["Red", "Blue", "Off"]);
    expect(vs[0]).toMatchObject({ total: 8, stockByBranch: { "Branch 1": 5, "Branch 2": 3 } });
    expect(vs[2].disabled).toBe(true);
    expect(await getInventoryVariants("nope")).toBeUndefined();
  });

  it("alerts on enabled variants that are out or at/below the reorder level", async () => {
    const alerts = await getStockAlerts();
    const key = (a: { productId: string; variant: string }) => `${a.productId}:${a.variant}`;
    const found = new Map(alerts.map((a) => [key(a), a]));
    expect(found.get("ip-a:Blue · ")).toMatchObject({ state: "out", stock: 0 });
    expect(found.get("ip-b:Std · ")).toMatchObject({ state: "low", stock: 3 });
    expect(found.has("ip-a:Red · ")).toBe(false);   // 8 on hand, above the level
    expect(found.has("ip-a:Off · ")).toBe(false);   // disabled variants never alert
    expect(found.has("ip-c:Std · ")).toBe(false);
  });
});
