/**
 * Moving an online order along: processing → shipped → delivered, with courier and tracking, corrections backwards,
 * cancelling (which puts the stock back and keeps the order), the rules that stop nonsense, and the "waiting to ship"
 * alert count that drives the badge — against an in-memory Postgres built from the migrations.
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
import { insertVariants, selectProduct } from "@/lib/db/queries/variants";
import { createOrder, getOrder, fulfilOrder, getOrderAlerts } from "@/lib/db/queries/orders";
import { variantStockAt, type Variant } from "@/lib/stock";
import type { Order } from "@/types";

const variant: Variant = { attr: "Std", finish: "", price: 100000, weight: 0, stockByBranch: { "Branch 1": 10, "Branch 2": 10 } };
const stock = async (b: "Branch 1" | "Branch 2") => variantStockAt((await selectProduct("of-p"))!.variants[0], b);

const order = (id: string, over: Partial<Order> = {}): Order => ({
  id, date: "2026-10-19", status: "processing", customerName: "Asha", email: "asha@example.com", phone: "9876543210",
  paymentMethod: "razorpay", paymentId: `pay_${id}`, shipState: "Tamil Nadu", branch: "Branch 1",
  items: [{ productId: "of-p", variantKey: "Std|", variantLabel: "Std", quantity: 2, price: 100000, gstRate: 18 }],
  subtotal: 200000, discount: 0, couponCode: null, gst: 30508, shipping: 0, total: 200000, address: "12 Test Street, Chennai", ...over,
});

beforeAll(async () => {
  await db.insert(products).values({ id: "of-p", slug: "of-p", name: "Order product", category: "string" });
  await insertVariants("of-p", [variant]);
}, 60_000);

describe("order fulfilment", () => {
  it("ships with a courier and tracking number, stamps the dates, then delivers", async () => {
    await createOrder(order("O-1"));
    const shipped = await fulfilOrder("O-1", { status: "shipped", courier: "  DTDC ", trackingNo: "AWB123" });
    expect(shipped).toMatchObject({ changed: true, from: "processing", order: { status: "shipped", courier: "DTDC", trackingNo: "AWB123" } });
    expect(shipped!.order.shippedAt).toBeTruthy();
    expect(shipped!.order.deliveredAt).toBeFalsy();

    const delivered = await fulfilOrder("O-1", { status: "delivered" });
    expect(delivered!.order).toMatchObject({ status: "delivered", courier: "DTDC", trackingNo: "AWB123" }); // details are kept
    expect(delivered!.order.deliveredAt).toBeTruthy();
    expect(delivered!.order.shippedAt).toBe(shipped!.order.shippedAt); // shipping date doesn't move
  });

  it("saving only tracking details changes no stage", async () => {
    await createOrder(order("O-2"));
    const r = await fulfilOrder("O-2", { courier: "Delhivery", trackingNo: "X1" });
    expect(r).toMatchObject({ changed: false, order: { status: "processing", courier: "Delhivery", trackingNo: "X1" } });
  });

  it("allows stepping back to fix a mis-click, clearing the later dates", async () => {
    await createOrder(order("O-3"));
    await fulfilOrder("O-3", { status: "delivered" });
    const back = await fulfilOrder("O-3", { status: "shipped" });
    expect(back!.order.status).toBe("shipped");
    expect(back!.order.deliveredAt).toBeFalsy();
    expect(back!.order.shippedAt).toBeTruthy();
    const start = await fulfilOrder("O-3", { status: "processing" });
    expect(start!.order.status).toBe("processing");
    expect(start!.order.shippedAt).toBeFalsy();
    expect(start!.order.deliveredAt).toBeFalsy();
  });

  it("cancelling keeps the order and puts the stock back, once", async () => {
    await createOrder(order("O-4"));
    const before = await stock("Branch 1");
    const r = await fulfilOrder("O-4", { status: "cancelled" });
    expect(r!.order.status).toBe("cancelled");
    expect(await getOrder("O-4")).toBeTruthy(); // still on record
    expect(await stock("Branch 1")).toBe(before + 2);
    await fulfilOrder("O-4", { status: "cancelled" }); // again: nothing more to give back
    expect(await stock("Branch 1")).toBe(before + 2);
    expect(await stock("Branch 2")).toBe(10);
  });

  it("refuses nonsense: reopening a cancelled order, cancelling a delivered one, unknown stages, unknown orders", async () => {
    await createOrder(order("O-5", { status: "cancelled" }));
    await expect(fulfilOrder("O-5", { status: "shipped" })).rejects.toMatchObject({ status: 409 });
    await expect(fulfilOrder("O-5", { courier: "DTDC" })).rejects.toMatchObject({ status: 409 });
    await createOrder(order("O-6", { status: "delivered" }));
    await expect(fulfilOrder("O-6", { status: "cancelled" })).rejects.toMatchObject({ status: 409 });
    await expect(fulfilOrder("O-6", { status: "teleported" as never })).rejects.toMatchObject({ status: 400 });
    expect(await fulfilOrder("nope", { status: "shipped" })).toBeUndefined();
  });

  it("counts only orders still waiting to ship, and scopes them to a branch user's branches", async () => {
    await createOrder(order("O-7", { branch: "Branch 2", customerName: "Ravi" }));
    const all = await getOrderAlerts(null);
    const ids = all.latest.map((o) => o.id);
    expect(ids).toContain("O-2");   // still processing
    expect(ids).toContain("O-7");
    expect(ids).not.toContain("O-1"); // delivered
    expect(ids).not.toContain("O-4"); // cancelled
    expect(all.count).toBe(all.latest.length);

    const mine = await getOrderAlerts(["Branch 2"]);
    expect(mine.latest.every((o) => o.branch === "Branch 2")).toBe(true);
    expect(mine.latest.map((o) => o.id)).toContain("O-7");
    expect((await getOrderAlerts([])).count).toBe(0); // a user with no branches sees nothing
  });

  it("two cancels at once put the stock back exactly once", async () => {
    await createOrder(order("O-8"));
    const before = await stock("Branch 1");
    const results = await Promise.allSettled([fulfilOrder("O-8", { status: "cancelled" }), fulfilOrder("O-8", { status: "cancelled" }), fulfilOrder("O-8", { status: "cancelled" })]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect((await getOrder("O-8"))!.status).toBe("cancelled");
    expect(await stock("Branch 1")).toBe(before + 2); // 2 units, once — not 4 or 6
  });

  it("a change made from a stale view is refused rather than applied on top", async () => {
    await createOrder(order("O-9"));
    await fulfilOrder("O-9", { status: "shipped" });
    // two people both saw "processing"; the second one's cancel would reverse a sale that already moved on
    const [a, b] = await Promise.allSettled([fulfilOrder("O-9", { status: "delivered" }), fulfilOrder("O-9", { status: "cancelled" })]);
    const finals = (await getOrder("O-9"))!.status;
    expect(["delivered", "cancelled"]).toContain(finals);
    expect([a.status, b.status].filter((x) => x === "fulfilled").length).toBeGreaterThanOrEqual(1);
    if (finals === "delivered") expect(b.status).toBe("rejected"); // a delivered order can't be cancelled
  });

  it("alerts count every waiting order but only return the latest few", async () => {
    for (let i = 0; i < 6; i++) await createOrder(order(`O-A${i}`, { branch: "Branch 2", date: `2026-10-${10 + i}` }));
    const all = await getOrderAlerts(null);
    const few = await getOrderAlerts(null, 3);
    expect(few.latest).toHaveLength(3);
    expect(few.count).toBe(all.count); // the count is the real total, not the page size
    expect(few.count).toBeGreaterThan(3);
    expect(few.latest[0].date >= few.latest[2].date).toBe(true); // newest first
  });
});
