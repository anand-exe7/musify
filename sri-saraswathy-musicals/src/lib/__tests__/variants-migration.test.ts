/**
 * Migration 0022 moves `products.variants` (JSON) into `product_variants` and
 * `variant_stock`. Run it against data shaped like production's — per-branch
 * buckets, a legacy flat `stock` variant, a disabled variant — and check that
 * every unit, price and position survives.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(import.meta.dirname, "../../../drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(root, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };

async function applyTag(pg: PGlite, tag: string) {
  for (const stmt of fs.readFileSync(path.join(root, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) {
    if (stmt.trim()) await pg.exec(stmt);
  }
}

describe("migration 0022 (variants JSON → tables)", () => {
  it("carries every variant, price and unit of stock across", async () => {
    const pg = new PGlite();
    const idx = journal.entries.findIndex((e) => e.tag.startsWith("0022"));
    expect(idx).toBeGreaterThan(0);
    for (const { tag } of journal.entries.slice(0, idx)) await applyTag(pg, tag);

    const variants = [
      { attr: "Standard", finish: "Natural", price: 125000, weight: 1400, stockByBranch: { "Branch 1": 4, "Branch 2": 3 } },
      { attr: "Deluxe", finish: "Rosewood", price: 150000, weight: 1600, stockByBranch: { "Branch 1": 0, "Branch 2": 9 }, disabled: true },
      { attr: "Legacy", finish: "", price: 99900, weight: 0, stock: 7 },
    ];
    await pg.query(`insert into products (id, slug, name, category, variants) values ('p1','p1','Product','string',$1::jsonb)`, [JSON.stringify(variants)]);
    await pg.query(`insert into products (id, slug, name, category) values ('p2','p2','No variants','string')`);

    await applyTag(pg, journal.entries[idx].tag);

    const vs = await pg.query<{ position: number; attr: string; price: number; disabled: boolean }>(
      `select position, attr, price, disabled from product_variants where product_id = 'p1' order by position`,
    );
    expect(vs.rows.map((r) => [r.position, r.attr, r.price, r.disabled])).toEqual([
      [0, "Standard", 125000, false],
      [1, "Deluxe", 150000, true],
      [2, "Legacy", 99900, false],
    ]);

    const stock = await pg.query<{ position: number; branch: string; qty: number }>(
      `select pv.position, vs.branch, vs.qty from variant_stock vs join product_variants pv on pv.id = vs.variant_id
       where pv.product_id = 'p1' order by pv.position, vs.branch`,
    );
    expect(stock.rows.map((r) => [r.position, r.branch, r.qty])).toEqual([
      [0, "Branch 1", 4], [0, "Branch 2", 3],
      [1, "Branch 1", 0], [1, "Branch 2", 9],
      [2, "Branch 1", 7], // legacy flat stock sat in Branch 1
    ]);

    const none = await pg.query(`select count(*)::int as n from product_variants where product_id = 'p2'`);
    expect((none.rows[0] as { n: number }).n).toBe(0);

    const col = await pg.query(`select 1 from information_schema.columns where table_name='products' and column_name='variants'`);
    expect(col.rows).toHaveLength(0);
  }, 60_000);
});
