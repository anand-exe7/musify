/**
 * The DB must be rebuildable from `drizzle/` alone (`npm run db:migrate` on a
 * fresh database). Applies every migration to an in-memory Postgres and checks
 * the result against the latest snapshot — which is what `schema.ts` produces.
 * Catches the failure mode where a table/column was only ever `db:push`ed.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(import.meta.dirname, "../../../drizzle");

interface SnapColumn { name: string; notNull?: boolean; default?: unknown }
interface SnapTable { name: string; columns: Record<string, SnapColumn>; checkConstraints?: Record<string, unknown> }

const journal = JSON.parse(fs.readFileSync(path.join(root, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
const lastTag = journal.entries.at(-1)!.tag;
const snapshot = JSON.parse(
  fs.readFileSync(path.join(root, `meta/${lastTag.split("_")[0]}_snapshot.json`), "utf8"),
) as { tables: Record<string, SnapTable> };

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const { tag } of journal.entries) {
    const sql = fs.readFileSync(path.join(root, `${tag}.sql`), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      if (stmt.trim()) await db.exec(stmt);
    }
  }
}, 60_000);

describe("drizzle migrations", () => {
  it("build every table and column the schema declares, with matching nullability/defaults", async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null }>(
      `select table_name, column_name, is_nullable, column_default from information_schema.columns where table_schema='public'`,
    );
    const have = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r]));
    const problems: string[] = [];
    for (const t of Object.values(snapshot.tables)) {
      for (const c of Object.values(t.columns)) {
        const h = have.get(`${t.name}.${c.name}`);
        if (!h) { problems.push(`${t.name}.${c.name} missing`); continue; }
        if ((h.is_nullable === "YES") === !!c.notNull) problems.push(`${t.name}.${c.name} nullability differs`);
        if ((h.column_default != null) !== (c.default !== undefined)) problems.push(`${t.name}.${c.name} default differs`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("create every CHECK constraint the schema declares", async () => {
    const { rows } = await db.query<{ conname: string }>(`select conname from pg_constraint where contype='c'`);
    const have = new Set(rows.map((r) => r.conname));
    const want = Object.values(snapshot.tables).flatMap((t) => Object.keys(t.checkConstraints ?? {}));
    expect(want.length).toBeGreaterThan(0);
    expect(want.filter((n) => !have.has(n))).toEqual([]);
  });

  it("reject values outside the literal unions", async () => {
    await expect(db.exec(`insert into orders(id,date,status) values('o1','d','bogus')`)).rejects.toThrow(/orders_status_check/);
    await expect(
      db.exec(`insert into stock_transfers(id,product_id,from_branch,to_branch,transferred_at) values('t','p','Branch 9','Branch 2','x')`),
    ).rejects.toThrow(/from_branch_check/);
  });

  it("enforce foreign keys on new rows (H5)", async () => {
    await db.exec(`insert into vendors(id,name) values('v1','V')`);
    await db.exec(`insert into products(id,slug,name,category) values('pfk','sfk','n','c')`);
    await expect(
      db.exec(`insert into stock_transfers(id,product_id,from_branch,to_branch,transferred_at) values('tx','missing','Branch 1','Branch 2','x')`),
    ).rejects.toThrow(/foreign key/i);
    await db.exec(`insert into stock_transfers(id,product_id,from_branch,to_branch,transferred_at) values('tx2','pfk','Branch 1','Branch 2','x')`);
    // a product with history can't be deleted (RESTRICT)…
    await expect(db.exec(`delete from products where id='pfk'`)).rejects.toThrow(/foreign key/i);
    // …and an order outlives its customer (SET NULL).
    await db.exec(`insert into users(id,name,email,phone,role,active,is_admin,last_login) values('uu','n','e','','customer',true,false,'')`);
    await db.exec(`insert into orders(id,date,status,user_id) values('ofk','d','processing','uu')`);
    await db.exec(`delete from users where id='uu'`);
    const { rows } = await db.query<{ user_id: string | null }>(`select user_id from orders where id='ofk'`);
    expect(rows[0].user_id).toBeNull();
  });

  it("allow a non-GST product (NULL gst_rate)", async () => {
    await db.exec(`insert into products(id,slug,name,category,gst_rate,is_gst_applicable) values('p1','s','n','c',null,false)`);
  });
});
