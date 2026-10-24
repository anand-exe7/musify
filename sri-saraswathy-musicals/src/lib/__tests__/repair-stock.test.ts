/**
 * Products used in a repair leave the branch's stock when the repair is marked Ready (not before), go back if it is
 * moved back, cancelled, deleted or its list or branch changes, are never taken or returned twice, and a shortfall at
 * Ready refuses the change without moving anything.
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
import { products } from "@/lib/db/schema";
import { insertVariants, selectProduct } from "@/lib/db/queries/variants";
import { createTicket, getTicket, partsDue, releaseTicketStock, syncPartsStock, updateTicket } from "@/lib/db/queries/repair";
import { HttpError } from "@/lib/api/errors";
import { variantStockAt, type Variant } from "@/lib/stock";
import type { RepairTicket } from "@/lib/store/repair";
import type { ServicePart } from "@/lib/billing/serviceInvoice";

const variant: Variant = { attr: "Std", finish: "", price: 5000, weight: 0, stockByBranch: { "Branch 1": 10, "Branch 2": 10 } };
// Every test gets its own product (10 in each branch), so one test's stock never affects the next.
let pid = "";
let seq = 0;
const at = async (b: "Branch 1" | "Branch 2") => variantStockAt((await selectProduct(pid))!.variants[0], b);
const part = (qty: number, over: Partial<ServicePart> = {}): ServicePart => ({ id: `part-${qty}`, productId: pid, variantIndex: 0, name: "Guitar string", qty, price: 5000, gst: 18, ...over });

beforeAll(async () => {
  await db.select().from(products);
}, 60_000);

beforeEach(async () => {
  pid = `rs-p-${++seq}`;
  await db.insert(products).values({ id: pid, slug: pid, name: "Guitar string", category: "string" });
  await insertVariants(pid, [variant]);
});

/** Run what the PATCH route runs for a change: sync stock, then keep `taken` on the ticket. */
async function change(t: RepairTicket, patch: Partial<RepairTicket>): Promise<RepairTicket> {
  const sync = await syncPartsStock(t, { branch: patch.branch ?? t.branch, status: patch.status ?? t.status, parts: patch.parts ?? t.parts });
  try {
    return (await updateTicket(t.id, { ...patch, stockTaken: sync.taken }))!;
  } catch (e) {
    await sync.undo();
    throw e;
  }
}

let n = 0;
const ticket = async (over: Partial<RepairTicket> = {}): Promise<RepairTicket> => {
  n += 1;
  const now = new Date().toISOString();
  return createTicket({
    id: `REP-RS-${n}`, createdAt: now, updatedAt: now, customerName: "Ravi", phone: "9876500000", productName: "Guitar", category: "Strings",
    problem: "Strings worn", status: "received", priority: "normal", branch: "Branch 1", deadline: now, estimate: 0, finalCost: 0, advance: 0,
    gstRate: 18, events: [], parts: [], stockTaken: [], ...over,
  } as RepairTicket);
};

describe("partsDue", () => {
  it("only once the repair is Ready or Completed", () => {
    const p = [part(2)];
    expect(partsDue("received", p)).toEqual([]);
    expect(partsDue("in-progress", p)).toEqual([]);
    expect(partsDue("cancelled", p)).toEqual([]);
    expect(partsDue("ready", p)).toEqual(p);
    expect(partsDue("completed", p)).toEqual(p);
    expect(partsDue("ready", undefined)).toEqual([]);
  });
});

describe("stock for products used in a repair", () => {
  it("takes nothing while the repair is open, however the list changes", async () => {
    const before = await at("Branch 1");
    let t = await ticket();
    t = await change(t, { parts: [part(3)] });
    t = await change(t, { status: "in-progress" });
    t = await change(t, { parts: [part(5)] });
    expect(await at("Branch 1")).toBe(before);
    expect(t.stockTaken).toEqual([]);
  });

  it("takes the products once, when it is marked Ready, and records what was taken", async () => {
    const before = await at("Branch 1");
    let t = await ticket({ status: "in-progress", parts: [part(3)] });
    t = await change(t, { status: "ready" });
    expect(await at("Branch 1")).toBe(before - 3);
    expect(t.stockTaken).toHaveLength(1);
    // Saving again, or moving on to Completed, takes nothing more.
    t = await change(t, { status: "completed" });
    t = await change(t, { parts: t.parts });
    expect(await at("Branch 1")).toBe(before - 3);
  });

  it("follows edits to the list after it is Ready", async () => {
    const before = await at("Branch 1");
    let t = await ticket({ status: "ready", parts: [part(2)] });
    t = await change(t, { parts: [part(2)], status: "ready" }); // nothing taken yet on a hand-made ready ticket: takes 2
    expect(await at("Branch 1")).toBe(before - 2);
    t = await change(t, { parts: [part(5)] });
    expect(await at("Branch 1")).toBe(before - 5);
    t = await change(t, { parts: [part(1)] });
    expect(await at("Branch 1")).toBe(before - 1);
    t = await change(t, { parts: [] });
    expect(await at("Branch 1")).toBe(before);
    expect(t.stockTaken).toEqual([]);
  });

  it("puts the products back if the repair is moved back, and takes them again at Ready", async () => {
    const before = await at("Branch 1");
    let t = await ticket({ status: "in-progress", parts: [part(4)] });
    t = await change(t, { status: "ready" });
    expect(await at("Branch 1")).toBe(before - 4);
    t = await change(t, { status: "in-progress" });
    expect(await at("Branch 1")).toBe(before);
    t = await change(t, { status: "ready" });
    expect(await at("Branch 1")).toBe(before - 4);
  });

  it("cancelling returns the products, and bringing it back takes them again", async () => {
    const before = await at("Branch 1");
    let t = await ticket({ status: "in-progress", parts: [part(2)] });
    t = await change(t, { status: "ready" });
    t = await change(t, { status: "cancelled" });
    expect(await at("Branch 1")).toBe(before);
    t = await change(t, { status: "ready" });
    expect(await at("Branch 1")).toBe(before - 2);
  });

  it("refuses Ready when the branch is short, and changes nothing", async () => {
    const before = await at("Branch 1");
    const t = await ticket({ status: "in-progress", parts: [part(before + 1)] });
    await expect(change(t, { status: "ready" })).rejects.toBeInstanceOf(HttpError);
    await expect(change(t, { status: "ready" })).rejects.toThrow(/only \d+ in stock/);
    expect(await at("Branch 1")).toBe(before);
    expect((await getTicket(t.id))?.status).toBe("in-progress");
  });

  it("moves the stock when a Ready ticket is moved to another branch", async () => {
    const b1 = await at("Branch 1"), b2 = await at("Branch 2");
    let t = await ticket({ status: "in-progress", parts: [part(3)] });
    t = await change(t, { status: "ready" });
    expect([await at("Branch 1"), await at("Branch 2")]).toEqual([b1 - 3, b2]);
    t = await change(t, { branch: "Branch 2" });
    expect([await at("Branch 1"), await at("Branch 2")]).toEqual([b1, b2 - 3]);
  });

  it("leaves hand-typed items and products that are not from inventory out of stock", async () => {
    const before = await at("Branch 1");
    let t = await ticket({ status: "in-progress", parts: [{ id: "free-1", name: "Cleaning", qty: 2, price: 100, gst: 18 }] });
    t = await change(t, { status: "ready" });
    expect(await at("Branch 1")).toBe(before);
  });

  it("a product used but not charged (price 0) still comes off stock", async () => {
    const before = await at("Branch 1");
    let t = await ticket({ status: "in-progress", parts: [part(1, { price: 0 })] });
    t = await change(t, { status: "ready" });
    expect(await at("Branch 1")).toBe(before - 1);
  });

  it("deleting a ticket returns whatever it still holds", async () => {
    const before = await at("Branch 1");
    let t = await ticket({ status: "in-progress", parts: [part(2)] });
    t = await change(t, { status: "ready" });
    expect(await at("Branch 1")).toBe(before - 2);
    await releaseTicketStock(t);
    expect(await at("Branch 1")).toBe(before);
    // An open ticket holds nothing, so there is nothing to return.
    const open = await ticket({ status: "received", parts: [part(2)] });
    await releaseTicketStock(open);
    expect(await at("Branch 1")).toBe(before);
  });

  it("brings an older ticket right: stock taken under the old rule comes back until it is Ready", async () => {
    const before = await at("Branch 1");
    // An old ticket: its parts had already left stock when saved (the migration recorded that as taken).
    const t = await ticket({ status: "in-progress", parts: [part(2)], stockTaken: [part(2)] });
    expect(await at("Branch 1")).toBe(before); // (set up by hand: the units were never really taken in this test)
    const sync = await syncPartsStock(t, { branch: t.branch, status: "in-progress", parts: t.parts });
    expect(sync.taken).toEqual([]);
    expect(await at("Branch 1")).toBe(before + 2);
    await sync.undo();
    expect(await at("Branch 1")).toBe(before);
  });
});
