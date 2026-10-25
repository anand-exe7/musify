/**
 * Branch staff sell from the catalogue only: a typed item is refused, and a catalogue item is always billed at the
 * catalogue price, GST and name whatever the browser sent (the bill's money is restated from the real lines).
 * A full admin keeps typed items and prices.
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
import { products } from "@/lib/db/schema";
import { insertVariants } from "@/lib/db/queries/variants";
import { createSessionToken } from "@/lib/auth/session";
import * as bills from "@/app/api/pos/bills/route";
import * as quotes from "@/app/api/quotations/route";
import * as repair from "@/app/api/repair/route";
import type { Variant } from "@/lib/stock";

const dbUser = (over: Record<string, unknown> = {}) => ({ id: "u1", name: "U", email: "u@x.com", active: true, isAdmin: false, branch: "Branch 1", avatar: null, ...over });
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const asStaff = () => dbUsers.set("u1", dbUser());
const asAdmin = () => dbUsers.set("u1", dbUser({ isAdmin: true }));

// One single-variant product: ₹500 incl. 18% GST.
const PID = "cl-p-1";
const variant: Variant = { attr: "Std", finish: "", price: 50000, weight: 0, stockByBranch: { "Branch 1": 50 } };

let n = 0;
const bill = (items: unknown[], over: Record<string, unknown> = {}) => ({
  id: `cl-b-${++n}`, createdAt: new Date().toISOString(), customerName: "Ravi", phone: "", source: "offline", branch: "Branch 1", items,
  subtotal: 0, discount: 0, delivery: 0, total: 0, gstEnabled: true, status: "completed", payment: "cash", ...over,
});
const catalogueLine = (over: Record<string, unknown> = {}) => ({ name: "Guitar string", price: 50000, qty: 2, gstRate: 18, productId: PID, variantIndex: 0, ...over });

beforeAll(async () => {
  process.env.AUTH_SECRET = "test-secret-for-vitest-only-0123456789";
  await db.insert(products).values({ id: PID, slug: PID, name: "Guitar string", category: "string", price: 50000, mrp: 60000, gstRate: 18, hsn: "9209" });
  await insertVariants(PID, [variant]);
}, 60_000);

beforeEach(async () => {
  dbUsers.clear();
  cookieJar.token = await createSessionToken({ id: "u1", name: "U", email: "u@x.com", isAdmin: false, branch: "Branch 1" });
  asStaff();
});

describe("bills", () => {
  it("refuses a typed item from branch staff", async () => {
    const res = await bills.POST(post("/api/pos/bills", bill([{ name: "Mystery", price: 1000, qty: 1, gstRate: 18 }])));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toMatch(/catalogue/i);
  });

  it("refuses a line whose product no longer exists", async () => {
    expect((await bills.POST(post("/api/pos/bills", bill([catalogueLine({ productId: "gone" })])))).status).toBe(403);
  });

  it("bills a catalogue item at the catalogue price, whatever price and totals were sent", async () => {
    const res = await bills.POST(post("/api/pos/bills", bill([catalogueLine({ price: 100, name: "Edited", gstRate: 0 })], { subtotal: 200, total: 200, payment: "cash" })));
    expect(res.status).toBe(201);
    const saved = (await res.json()) as { items: { name: string; price: number; gstRate: number; hsn: string }[]; subtotal: number; total: number; gst: number };
    expect(saved.items[0]).toMatchObject({ name: "Guitar string", price: 50000, gstRate: 18, hsn: "9209" });
    expect(saved.subtotal).toBe(100000);
    expect(saved.total).toBe(100000);
    expect(saved.gst).toBe(15254); // 18% contained in ₹1,000.00
  });

  it("keeps the discount staff entered, and delivery", async () => {
    const res = await bills.POST(post("/api/pos/bills", bill([catalogueLine({ qty: 1, discount: 5000 })], { discount: 10000, delivery: 2000 })));
    expect(res.status).toBe(201);
    const saved = (await res.json()) as { total: number; discount: number };
    expect(saved.discount).toBe(10000);
    expect(saved.total).toBe(50000 - 10000 + 2000);
  });

  it("lets a full admin type items and set prices", async () => {
    asAdmin();
    const res = await bills.POST(post("/api/pos/bills", bill([{ name: "Mystery", price: 1234, qty: 1, gstRate: 5 }], { subtotal: 1234, total: 1234 })));
    expect(res.status).toBe(201);
    expect(((await res.json()) as { items: { name: string; price: number }[] }).items[0]).toMatchObject({ name: "Mystery", price: 1234 });
  });
});

describe("quotations", () => {
  const quote = (line: Record<string, unknown>) => ({ customer: "Ravi", branch: "Branch 1", items: [{ name: "Guitar string", hsn: "9209", qty: 1, rate: 50000, gst: 18, productId: PID, variantKey: "Std|", ...line }] });

  it("sets the rate, GST and name from the catalogue for staff", async () => {
    const res = await quotes.POST(post("/api/quotations", quote({ rate: 100, gst: 0, name: "Edited" })));
    expect(res.status).toBe(201);
    expect(((await res.json()) as { items: { name: string; rate: number; gst: number }[] }).items[0]).toMatchObject({ name: "Guitar string", rate: 50000, gst: 18 });
  });

  it("still refuses a line that is not linked to a catalogue product", async () => {
    expect((await quotes.POST(post("/api/quotations", quote({ productId: undefined, variantKey: undefined })))).status).toBe(403);
  });

  it("lets a full admin quote a negotiated rate", async () => {
    asAdmin();
    const res = await quotes.POST(post("/api/quotations", quote({ rate: 45000 })));
    expect(((await res.json()) as { items: { rate: number }[] }).items[0].rate).toBe(45000);
  });
});

describe("repair tickets", () => {
  let t = 0;
  const ticket = (parts: unknown[]) => ({
    id: `REP-CL-${++t}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), customerName: "Ravi", phone: "9876500000", productName: "Guitar",
    category: "Strings", problem: "Worn", status: "received", priority: "normal", branch: "Branch 1", deadline: new Date().toISOString(), estimate: 0, finalCost: 0, advance: 0,
    gstRate: 18, events: [], parts,
  });

  it("refuses a typed product from branch staff", async () => {
    const res = await repair.POST(post("/api/repair", ticket([{ id: "x", name: "Cleaning", qty: 1, price: 100, gst: 18 }])));
    expect(res.status).toBe(403);
  });

  it("prices an inventory product from the catalogue", async () => {
    const res = await repair.POST(post("/api/repair", ticket([{ id: "p1", productId: PID, variantIndex: 0, name: "x", qty: 2, price: 1, gst: 0 }])));
    expect(res.status).toBe(201);
    expect(((await res.json()) as { parts: { name: string; price: number; gst: number }[] }).parts[0]).toMatchObject({ name: "Guitar string", price: 50000, gst: 18 });
  });

  it("lets a full admin add other items and set prices", async () => {
    asAdmin();
    const res = await repair.POST(post("/api/repair", ticket([{ id: "x", name: "Cleaning", qty: 1, price: 100, gst: 18 }])));
    expect(res.status).toBe(201);
    expect(((await res.json()) as { parts: { name: string; price: number }[] }).parts[0]).toMatchObject({ name: "Cleaning", price: 100 });
  });
});
