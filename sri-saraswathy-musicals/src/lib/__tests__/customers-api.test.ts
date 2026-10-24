/**
 * The customer endpoints: the billing Lookup answers for any staff member (and refuses a bad number),
 * the list and detail are limited to a branch user's own branch, and signed-out callers are turned away.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const cookieJar = vi.hoisted(() => ({ token: undefined as string | undefined }));
const dbUsers = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "ssm_session" && cookieJar.token ? { value: cookieJar.token } : undefined) }),
}));
vi.mock("@/lib/db/queries/users", () => ({ getUser: async (id: string) => dbUsers.get(id) }));
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
import { branches } from "@/lib/db/schema";
import { createSessionToken } from "@/lib/auth/session";
import { createInvoice } from "@/lib/db/queries/invoices";
import { lookupCustomer } from "@/lib/db/queries/customers";
import * as list from "@/app/api/customers/route";
import * as lookup from "@/app/api/customers/lookup/route";
import * as one from "@/app/api/customers/[id]/route";
import type { Invoice } from "@/types";

const dbUser = (over: Record<string, unknown> = {}) => ({
  id: "u1", name: "U", email: "u@x.com", active: true, isAdmin: false, branch: null, avatar: null, ...over,
});
const get = (url: string) => new NextRequest(`http://localhost${url}`);

let n = 0;
const make = (over: Partial<Invoice>) =>
  createInvoice({
    id: `ca-${++n}`, number: `SSM/2026-27/${8000 + n}`, date: "2026-10-12T10:00:00.000Z", customer: "C", branch: "Branch 1",
    items: [], subtotal: 0, cgst: 0, sgst: 0, igst: 0, total: 250_00, paymentMode: "cash", status: "paid", customerPhone: null, ...over,
  });

let raviId = "";

beforeAll(async () => {
  process.env.AUTH_SECRET = "test-secret-for-vitest-only-0123456789";
  await db.select().from(branches);
  await make({ customer: "Ravi Kumar", customerPhone: "98765 11111", branch: "Branch 1" });
  await make({ customer: "Ravi Kumar", customerPhone: "98765 11111", branch: "Branch 2" });
  await make({ customer: "Only Porur", customerPhone: "9555555555", branch: "Branch 2" });
  raviId = (await lookupCustomer("9876511111"))?.id ?? "";
}, 60_000);

beforeEach(async () => {
  dbUsers.clear();
  cookieJar.token = await createSessionToken({ id: "u1", name: "U", email: "u@x.com", isAdmin: false, branch: "Branch 1" });
  dbUsers.set("u1", dbUser({ branch: "Branch 1" }));
});

describe("GET /api/customers/lookup", () => {
  it("finds a returning customer by any spelling of the number (any staff, any branch)", async () => {
    const res = await lookup.GET(get("/api/customers/lookup?phone=%2B91%2098765-11111"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ customer: { name: "Ravi Kumar", phone: "9876511111", bills: 2 } });
  });

  it("answers null for a number it has never seen", async () => {
    const res = await lookup.GET(get("/api/customers/lookup?phone=9111111111"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ customer: null });
  });

  it("refuses a number that is not a mobile", async () => {
    expect((await lookup.GET(get("/api/customers/lookup?phone=12345"))).status).toBe(400);
    expect((await lookup.GET(get("/api/customers/lookup"))).status).toBe(400);
  });

  it("turns away someone who is not signed in or is only a shopper", async () => {
    dbUsers.set("u1", dbUser()); // a customer account, not staff
    expect((await lookup.GET(get("/api/customers/lookup?phone=9876511111"))).status).toBe(403);
    cookieJar.token = undefined;
    expect((await lookup.GET(get("/api/customers/lookup?phone=9876511111"))).status).toBe(401);
  });
});

describe("GET /api/customers", () => {
  it("a full admin sees every customer, with all their bills counted", async () => {
    dbUsers.set("u1", dbUser({ isAdmin: true }));
    const body = (await (await list.GET(get("/api/customers?pageSize=100"))).json()) as { total: number; items: { phone: string; bills: number }[] };
    expect(body.items.find((c) => c.phone === "9876511111")?.bills).toBe(2);
    expect(body.items.map((c) => c.phone)).toContain("9555555555");
  });

  it("a branch user only sees customers their branch billed, counted on their branch", async () => {
    const body = (await (await list.GET(get("/api/customers?pageSize=100"))).json()) as { items: { phone: string; bills: number }[] };
    expect(body.items.map((c) => c.phone)).not.toContain("9555555555");
    expect(body.items.find((c) => c.phone === "9876511111")?.bills).toBe(1);
  });

  it("searches by name or number", async () => {
    dbUsers.set("u1", dbUser({ isAdmin: true }));
    const byName = (await (await list.GET(get("/api/customers?q=porur"))).json()) as { items: { phone: string }[] };
    expect(byName.items.map((c) => c.phone)).toEqual(["9555555555"]);
    const byDigits = (await (await list.GET(get("/api/customers?q=98765"))).json()) as { items: { phone: string }[] };
    expect(byDigits.items.map((c) => c.phone)).toEqual(["9876511111"]);
  });
});

describe("GET /api/customers/:id", () => {
  const call = (id: string) => one.GET(get(`/api/customers/${id}`), { params: Promise.resolve({ id }) });

  it("gives a customer and their invoices; a branch user gets only their branch's", async () => {
    dbUsers.set("u1", dbUser({ isAdmin: true }));
    expect(((await (await call(raviId)).json()) as { invoices: unknown[] }).invoices).toHaveLength(2);
    dbUsers.set("u1", dbUser({ branch: "Branch 1" }));
    expect(((await (await call(raviId)).json()) as { invoices: unknown[] }).invoices).toHaveLength(1);
  });

  it("does not reveal a customer the branch has never billed, and 404s an unknown id", async () => {
    dbUsers.set("u1", dbUser({ isAdmin: true }));
    const porur = ((await (await lookup.GET(get("/api/customers/lookup?phone=9555555555"))).json()) as { customer: { id: string } }).customer.id;
    dbUsers.set("u1", dbUser({ branch: "Branch 1" }));
    expect((await call(porur)).status).toBe(404);
    expect((await call("nope")).status).toBe(404);
  });
});
