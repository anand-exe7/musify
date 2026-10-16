/** Paging: the page-number window, slicing a list, and one page of the shop from the database. */
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
import { getStorefrontPage, getStorefrontProductsByIds } from "@/lib/db/queries/products";
import { pageWindow, slicePage } from "@/lib/paginate";

describe("page numbers", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("collapses the middle of a long list around the current page", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, "…", 19, 20]);
    expect(pageWindow(10, 20)).toEqual([1, 2, "…", 9, 10, 11, "…", 19, 20]);
    expect(pageWindow(20, 20)).toEqual([1, 2, "…", 19, 20]);
    expect(pageWindow(3, 20)).toEqual([1, 2, 3, 4, "…", 19, 20]);
  });
});

describe("slicing a list", () => {
  const list = Array.from({ length: 53 }, (_, i) => i + 1);
  it("returns the right items and the 1-based range", () => {
    const s = slicePage(list, 2, 25);
    expect(s.items[0]).toBe(26);
    expect(s).toMatchObject({ page: 2, pages: 3, total: 53, from: 26, to: 50 });
    expect(slicePage(list, 3, 25)).toMatchObject({ from: 51, to: 53 });
  });
  it("clamps a page that is out of range, and copes with an empty list", () => {
    expect(slicePage(list, 99, 25).page).toBe(3);
    expect(slicePage(list, 0, 25).page).toBe(1);
    expect(slicePage([], 4, 25)).toMatchObject({ items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });
});

beforeAll(async () => {
  await db.select().from(products);
  // 30 active products: 20 strings (ids s01–s20, price 1000×n), 10 percussion; every 5th is western; s05 and s10 are featured.
  const rows = Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    const id = n <= 20 ? `s${String(n).padStart(2, "0")}` : `d${String(n - 20).padStart(2, "0")}`;
    return {
      id, slug: id, name: `Item ${id}`, category: n <= 20 ? "string" : "percussion",
      origin: n % 5 === 0 ? "western" : "indian", price: n * 100000, rating: (n % 5) + 1, featured: id === "s05" || id === "s10",
    };
  });
  await db.insert(products).values(rows);
  await db.insert(products).values({ id: "hidden", slug: "hidden", name: "Hidden", category: "string", price: 1, active: false });
  await insertVariants("s01", [{ attr: "Std", finish: "", price: 100000, weight: 0, stockByBranch: { "Branch 1": 3 } }]);
}, 60_000);

describe("one page of the shop", () => {
  it("returns a page of items with the total and page count, hiding inactive products", async () => {
    const r = await getStorefrontPage({ page: 1, pageSize: 12 });
    expect(r).toMatchObject({ total: 30, page: 1, pageSize: 12, pages: 3 });
    expect(r.items).toHaveLength(12);
    expect(r.items.some((p) => p.id === "hidden")).toBe(false);
    expect((await getStorefrontPage({ page: 3, pageSize: 12 })).items).toHaveLength(6);
  });

  it("never repeats or skips a product across pages", async () => {
    const seen: string[] = [];
    for (const page of [1, 2, 3]) seen.push(...(await getStorefrontPage({ page, pageSize: 12, sort: "price-asc" })).items.map((p) => p.id));
    expect(new Set(seen).size).toBe(30);
  });

  it("filters by category, origin and highest price before counting", async () => {
    expect((await getStorefrontPage({ category: "percussion" })).total).toBe(10);
    expect((await getStorefrontPage({ origin: "western" })).total).toBe(6);
    expect((await getStorefrontPage({ maxPrice: 500000 })).total).toBe(5);
    expect((await getStorefrontPage({ category: "string", origin: "western", maxPrice: 1_000_000 })).total).toBe(2); // s05, s10
    expect((await getStorefrontPage({ category: "all", origin: "all" })).total).toBe(30);
  });

  it("sorts in the database: price, name, and featured first", async () => {
    const cheap = await getStorefrontPage({ sort: "price-asc", pageSize: 3 });
    expect(cheap.items.map((p) => p.id)).toEqual(["s01", "s02", "s03"]);
    const dear = await getStorefrontPage({ sort: "price-desc", pageSize: 2 });
    expect(dear.items[0].price).toBe(30 * 100000);
    const feat = await getStorefrontPage({ sort: "featured", pageSize: 3 });
    expect(feat.items.slice(0, 2).map((p) => p.id).sort()).toEqual(["s05", "s10"]);
  });

  it("clamps a page past the end, bounds the page size, and attaches variants and stock", async () => {
    expect((await getStorefrontPage({ page: 99, pageSize: 12 })).page).toBe(3);
    expect((await getStorefrontPage({ pageSize: 100000 })).pageSize).toBe(60);
    expect((await getStorefrontPage({ page: -4, pageSize: 0 }))).toMatchObject({ page: 1, pageSize: 12 });
    const s01 = (await getStorefrontPage({ sort: "price-asc", pageSize: 1 })).items[0];
    expect(s01.stock).toBe(3);
  });

  it("returns an empty page, not an error, when nothing matches", async () => {
    expect(await getStorefrontPage({ category: "nope" })).toMatchObject({ items: [], total: 0, page: 1, pages: 1 });
  });
});

describe("search and lookups for the storefront", () => {
  it("searches name, brand and tagline, case-insensitively, and counts the matches", async () => {
    expect((await getStorefrontPage({ q: "item s0" })).total).toBe(9); // s01–s09
    expect((await getStorefrontPage({ q: "ITEM D" })).total).toBe(10);
    expect((await getStorefrontPage({ q: "item", category: "percussion" })).total).toBe(10);
    expect((await getStorefrontPage({ q: "  " })).total).toBe(30); // blank = no search
  });

  it("treats % and _ as plain characters, not wildcards", async () => {
    expect((await getStorefrontPage({ q: "%" })).total).toBe(0);
    expect((await getStorefrontPage({ q: "s_1" })).total).toBe(0);
  });

  it("returns just the asked-for active products by id", async () => {
    const r = await getStorefrontProductsByIds(["s01", "d03", "hidden", "nope", "s01"]);
    expect(r.map((p) => p.id).sort()).toEqual(["d03", "s01"]);
    expect(await getStorefrontProductsByIds([])).toEqual([]);
  });
});
