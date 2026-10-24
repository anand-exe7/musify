/**
 * Migration 0035 builds the customers table from invoices that already exist: one customer per valid mobile
 * (however it was typed), the latest real name and GSTIN, and every matching invoice linked to them.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(import.meta.dirname, "../../../drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(root, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
const tags = journal.entries.map((e) => e.tag);
const at = tags.indexOf("0035_customers");

let pg: PGlite;
const run = async (tag: string) => {
  for (const stmt of fs.readFileSync(path.join(root, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) {
    if (stmt.trim()) await pg.exec(stmt);
  }
};

const invoice = (id: string, phone: string | null, customer: string, date: string, gstin: string | null = null) =>
  pg.query(
    `insert into invoices (id, number, reference, date, customer, branch, payment_mode, status, customer_phone, customer_gstin)
     values ($1, $2, '', $3, $4, 'Branch 1', 'cash', 'paid', $5, $6)`,
    [id, `N-${id}`, date, customer, phone, gstin],
  );

beforeAll(async () => {
  pg = new PGlite();
  for (const tag of tags.slice(0, at)) await run(tag);
  // Existing invoices, before the customers table exists.
  await invoice("a1", "98765 43210", "Ravi", "2026-09-01T10:00:00.000Z", "33ABCDE1234F1Z5");
  await invoice("a2", "+91-9876543210", "Ravi Kumar", "2026-10-01T10:00:00.000Z");
  await invoice("a3", "09876543210", "Walk-in", "2026-10-05T10:00:00.000Z");
  await invoice("b1", "9123456780", "Meena", "2026-10-02T10:00:00.000Z");
  await invoice("c1", "12345", "Short Number", "2026-10-03T10:00:00.000Z");
  await invoice("c2", null, "No Number", "2026-10-04T10:00:00.000Z");
  await invoice("c3", "1234567890", "Not A Mobile", "2026-10-04T10:00:00.000Z");
  await run("0035_customers");
}, 60_000);

describe("migration 0035 backfill", () => {
  it("makes one customer per valid mobile number", async () => {
    const { rows } = await pg.query<{ phone: string }>(`select phone from customers order by phone`);
    expect(rows.map((r) => r.phone)).toEqual(["9123456780", "9876543210"]);
  });

  it("takes the latest real name and GSTIN, and the first and last dates", async () => {
    const { rows } = await pg.query<{ name: string; gstin: string | null; created_at: string; updated_at: string }>(
      `select name, gstin, created_at, updated_at from customers where phone = '9876543210'`,
    );
    expect(rows[0]).toMatchObject({ name: "Ravi Kumar", gstin: "33ABCDE1234F1Z5", created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-10-05T10:00:00.000Z" });
  });

  it("links every matching invoice, and leaves the others without a customer", async () => {
    const { rows } = await pg.query<{ id: string; linked: boolean }>(`select id, customer_id is not null as linked from invoices order by id`);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.linked]))).toEqual({ a1: true, a2: true, a3: true, b1: true, c1: false, c2: false, c3: false });
    const same = await pg.query<{ n: number }>(`select count(distinct customer_id)::int as n from invoices where id in ('a1','a2','a3')`);
    expect(same.rows[0].n).toBe(1);
  });

  it("does not allow two customers on one number", async () => {
    await expect(pg.query(`insert into customers (id, phone, created_at, updated_at) values ('x', '9876543210', 'a', 'a')`)).rejects.toThrow();
  });
});
