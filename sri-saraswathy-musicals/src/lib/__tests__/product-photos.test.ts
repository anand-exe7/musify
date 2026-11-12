/**
 * The product editor is sent image URLs instead of the photos themselves (a product with photographed variants
 * was shipping a quarter of a megabyte of base64 and took ten seconds to open). This checks the other half of
 * that bargain: when the form sends those URLs back, the stored photos must be kept exactly as they were, while
 * a real change still saves. Also covers the branch filter on the inventory list (INV-04).
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

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, productVariants } from "@/lib/db/schema";
import { insertVariants } from "@/lib/db/queries/variants";
import { getInventoryProduct, updateInventoryProduct } from "@/lib/db/queries/pos";
import { getInventoryPage } from "@/lib/db/queries/inventoryPage";
import type { Variant } from "@/lib/stock";

const dataUrl = (tag: string) => `data:image/webp;base64,${Buffer.from(`photo-${tag}`).toString("base64")}`;
const GALLERY = [dataUrl("gallery-0"), dataUrl("gallery-1")];
const VAR_PHOTO = dataUrl("variant-red");

const v = (attr: string, b1: number, b2: number, extra: Partial<Variant> = {}): Variant => ({
  attr, finish: "", price: 1000, weight: 0, stockByBranch: { "Branch 1": b1, "Branch 2": b2 }, ...extra,
});

const stored = async () => {
  const [p] = await db.select({ photo: products.photo, photos: products.photos }).from(products).where(eq(products.id, "pp-1"));
  const vs = await db.select({ attr: productVariants.attr, photo: productVariants.photo }).from(productVariants).where(eq(productVariants.productId, "pp-1")).orderBy(productVariants.position);
  return { p, vs };
};

beforeAll(async () => {
  await db.insert(products).values([
    { id: "pp-1", slug: "pp-1", name: "Photo veena", category: "String", department: "Indian", price: 1000, photo: GALLERY[0], photos: GALLERY },
    { id: "pp-2", slug: "pp-2", name: "Branch tester", category: "String", department: "Indian", price: 1000, lowStockAt: 4 },
  ]);
  await insertVariants("pp-1", [v("Red", 2, 1, { photo: VAR_PHOTO }), v("Blue", 0, 0)]);
  await insertVariants("pp-2", [v("Std", 10, 2)]);
}, 60_000);

describe("product editor photos", () => {
  it("sends image URLs to the editor, not the photos themselves", async () => {
    const p = (await getInventoryProduct("pp-1"))!;
    expect(p.photos).toEqual([
      expect.stringContaining("/api/pos/inventory/pp-1/gallery/0?v="),
      expect.stringContaining("/api/pos/inventory/pp-1/gallery/1?v="),
    ]);
    expect(p.photo).toContain("/api/pos/inventory/pp-1/gallery/0?v=");
    expect(p.variants[0].photo).toContain("/api/inventory/variants/");
    expect(p.variants[1].photo ?? null).toBeNull();
    // Nothing in the payload is a data URL any more.
    expect(JSON.stringify(p)).not.toContain("data:image");
  });

  it("keeps every stored photo when the form saves without touching them", async () => {
    const before = await stored();
    const p = (await getInventoryProduct("pp-1"))!;
    await updateInventoryProduct("pp-1", { ...p, name: "Photo veena renamed" }, []);
    const after = await stored();
    expect(after.p.photo).toBe(before.p.photo);
    expect(after.p.photos).toEqual(GALLERY);
    expect(after.vs.map((x) => x.photo)).toEqual(before.vs.map((x) => x.photo));
    expect((await db.select({ name: products.name }).from(products).where(eq(products.id, "pp-1")))[0].name).toBe("Photo veena renamed");
  });

  it("still saves a genuinely new photo, and a removed one", async () => {
    const fresh = dataUrl("variant-new");
    const p = (await getInventoryProduct("pp-1"))!;
    await updateInventoryProduct("pp-1", {
      ...p,
      photos: [p.photos![1]], // first gallery slot dropped, second kept
      variants: p.variants.map((x, i) => (i === 0 ? { ...x, photo: fresh } : x)),
    }, []);
    const after = await stored();
    expect(after.vs[0].photo).toBe(fresh);
    expect(after.p.photos).toEqual([GALLERY[1]]);
    expect(after.p.photo).toBe(GALLERY[1]);
  });

  it("a new variant that carries a reference is stored without a photo", async () => {
    const p = (await getInventoryProduct("pp-1"))!;
    await updateInventoryProduct("pp-1", {
      ...p,
      variants: [...p.variants, { attr: "Green", finish: "", price: 1000, weight: 0, photo: "/api/inventory/variants/made-up/photo?v=x", stockByBranch: {} } as Variant],
    }, []);
    const after = await stored();
    expect(after.vs.find((x) => x.attr === "Green")!.photo).toBeNull();
  });
});

describe("inventory list branch filter (INV-04)", () => {
  it("counts low / out stock for one branch when a branch is chosen", async () => {
    const all = await getInventoryPage({ sort: "name" });
    expect(all.items.find((r) => r.id === "pp-2")!.total).toBe(12);
    expect(all.items.find((r) => r.id === "pp-2")!.state).toBe("in");

    const porur = await getInventoryPage({ sort: "name", branch: "Branch 2" });
    const row = porur.items.find((r) => r.id === "pp-2")!;
    expect(row.total).toBe(2);        // Branch 2 only
    expect(row.state).toBe("low");    // 2 <= lowStockAt 4
    expect(row.stockByBranch["Branch 1"]).toBe(10); // every branch still reported for the table

    const lowAtPorur = await getInventoryPage({ sort: "name", branch: "Branch 2", status: "low" });
    expect(lowAtPorur.items.map((r) => r.id)).toContain("pp-2");
    const lowOverall = await getInventoryPage({ sort: "name", status: "low" });
    expect(lowOverall.items.map((r) => r.id)).not.toContain("pp-2");
  });
});
