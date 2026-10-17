/**
 * The Razorpay webhook must record a paid order the customer's browser never reported, reject forged calls, and
 * never double-record when the browser's `verify` and the webhook both arrive.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { products, orders, pendingCheckouts, users } from "@/lib/db/schema";
import { insertVariants, selectProduct } from "@/lib/db/queries/variants";
import { variantStockAt, type Variant } from "@/lib/stock";
import { savePendingCheckout, getPendingCheckout, finalizePaidOrder } from "@/lib/checkout/finalize";
import type { CheckoutDraft } from "@/lib/checkout/draft";
import { POST } from "@/app/api/razorpay/webhook/route";

const SECRET = "whsec_test";
const variant: Variant = { attr: "Std", finish: "", price: 100000, weight: 0, stockByBranch: { "Branch 1": 10 } };

const draft = (rpOrder: string): CheckoutDraft => ({
  items: [{ productId: "wh-p", variantKey: "Std|", name: "Thing", price: 100000, quantity: 2, gstRate: 18, hsn: "9207", variantLabel: "Std" }],
  subtotal: 200000, discount: 0, couponCode: null, taxable: 169492, gst: 30508, cgst: 15254, sgst: 15254, igst: 0, intra: true,
  shipping: 0, shippingOptions: { standard: 0, "white-glove": 0, express: 0 }, total: 200000,
  userId: "wh-user", customerName: "Tester", email: "", phone: "9876543210", address: "Chennai", shipState: "Tamil Nadu", branch: "Branch 1",
  razorpayOrderId: rpOrder,
} as unknown as CheckoutDraft);

const call = (body: object, sign = true) => {
  const raw = JSON.stringify(body);
  const sig = sign ? crypto.createHmac("sha256", SECRET).update(raw).digest("hex") : "deadbeef";
  return POST(new NextRequest("http://localhost/api/razorpay/webhook", { method: "POST", body: raw, headers: { "x-razorpay-signature": sig } }));
};
const captured = (orderId: string, paymentId: string) => ({ event: "payment.captured", payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });
const orderCount = async () => (await db.select().from(orders)).length;
const stock = async () => variantStockAt((await selectProduct("wh-p"))!.variants[0], "Branch 1");

beforeAll(async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  await db.insert(users).values({ id: "wh-user", name: "Tester", email: "t@example.com", role: "customer" });
  await db.insert(products).values({ id: "wh-p", slug: "wh-p", name: "Webhook product", category: "string" });
  await insertVariants("wh-p", [variant]);
}, 60_000);

describe("razorpay webhook", () => {
  it("rejects a call with a wrong signature and records nothing", async () => {
    await savePendingCheckout(draft("order_bad"));
    const res = await call(captured("order_bad", "pay_bad"), false);
    expect(res.status).toBe(400);
    expect(await orderCount()).toBe(0);
    expect(await stock()).toBe(10);
  });

  it("records the order when the browser never came back, takes stock once, and clears the pending checkout", async () => {
    await savePendingCheckout(draft("order_1"));
    const res = await call(captured("order_1", "pay_1"));
    expect(res.status).toBe(200);
    expect(await orderCount()).toBe(1);
    expect(await stock()).toBe(8);
    const [o] = await db.select().from(orders);
    expect(o.paymentId).toBe("pay_1");
    expect(o.total).toBe(200000);
    expect(await getPendingCheckout("order_1")).toBeUndefined();
  });

  it("is safe when Razorpay sends the same event again", async () => {
    await savePendingCheckout(draft("order_1")); // as if the pending row were still there
    const res = await call(captured("order_1", "pay_1"));
    expect(res.status).toBe(200);
    expect(await orderCount()).toBe(1);
    expect(await stock()).toBe(8);
  });

  it("does not double-record when the browser's verify and the webhook race", async () => {
    await savePendingCheckout(draft("order_2"));
    const d = (await getPendingCheckout("order_2"))!;
    const [a, b] = await Promise.all([finalizePaidOrder(d, "pay_2"), finalizePaidOrder(d, "pay_2")]);
    expect(a.id).toBe(b.id);
    expect(await orderCount()).toBe(2);
    expect(await stock()).toBe(6);
  });

  it("ignores events it does not handle and payments with no saved checkout", async () => {
    expect((await call({ event: "payment.failed", payload: {} })).status).toBe(200);
    const res = await call(captured("order_unknown", "pay_unknown"));
    expect(res.status).toBe(200);
    expect(await orderCount()).toBe(2);
    expect((await db.select().from(pendingCheckouts)).length).toBe(1); // order_bad, never paid
  });
});
