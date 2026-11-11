/**
 * Products sold during a service: they go on the same invoice as the service charge,
 * come out of the branch's stock, and an advance on an unfinished repair counts as revenue.
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
import { insertVariants, stockAt } from "@/lib/db/queries/variants";
import { applyPartsStock, cleanParts } from "@/lib/db/queries/repair";
import { serviceInvoiceBreakup, partsTotal } from "@/lib/billing/serviceInvoice";
import { ticketPartPaymentBills, ticketIdOfSaleRow, isServiceRevenue, serviceEarned, serviceEarnedAt } from "@/lib/client/sales";
import { grossTotal, balanceDue, type RepairTicket } from "@/lib/store/repair";

beforeAll(async () => {
  await db.select().from(products);
  await db.insert(products).values({ id: "pp", slug: "pp", name: "Strings set", category: "string" });
  await insertVariants("pp", [{ attr: "Std", finish: "", price: 50000, weight: 0, stockByBranch: { "Branch 1": 5, "Branch 2": 2 } }]);
}, 60_000);

const ticket = (over: Partial<RepairTicket> = {}): RepairTicket => ({
  id: "REP-1", createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-01T10:00:00.000Z", customerName: "A", phone: "1",
  productName: "Veena", category: "Strings", problem: "", status: "received", priority: "normal", branch: "Branch 1", deadline: "2026-10-10T00:00:00.000Z",
  estimate: 118000, finalCost: 0, advance: 0, gstRate: 18, events: [], ...over,
});

describe("service invoice with products", () => {
  it("adds each product as its own line and keeps subtotal + tax = total", () => {
    const parts = [{ id: "a", name: "Strings set", qty: 2, price: 59000, gst: 18 }];
    const b = serviceInvoiceBreakup("Veena", 118000, 18, parts);
    expect(b.items.map((i) => i.name)).toEqual(["Repair & service — Veena", "Strings set"]);
    expect(b.total).toBe(118000 + 118000);
    expect(b.subtotal + b.cgst + b.sgst).toBe(b.total);
    expect(b.cgst + b.sgst).toBe(36000); // 18% of ₹2,000 + 18% of ₹1,000 → ₹360
  });

  it("handles a mix of rates, a non-GST product, and a parts-only invoice", () => {
    const b = serviceInvoiceBreakup("Veena", 0, 18, [
      { id: "a", name: "A", qty: 1, price: 11200, gst: 12 },
      { id: "b", name: "B", qty: 3, price: 1000, gst: 0 },
    ]);
    expect(b.items).toHaveLength(2);
    expect(b.total).toBe(14200);
    expect(b.cgst + b.sgst).toBe(1200);
    expect(partsTotal([{ id: "a", name: "A", qty: 2, price: 500, gst: 0 }])).toBe(1000);
  });

  it("includes the products in the ticket total and the balance due", () => {
    const t = ticket({ advance: 100000, parts: [{ id: "a", name: "Strings set", qty: 1, price: 50000, gst: 18 }] });
    expect(grossTotal(t)).toBe(118000 + 50000);
    expect(balanceDue(t)).toBe(68000);
  });
});

describe("parts leave the branch's stock", () => {
  it("takes stock for added products, returns it when they're removed, and refuses a shortfall", async () => {
    const part = { id: "a", productId: "pp", variantIndex: 0, name: "Strings set", qty: 2, price: 50000, gst: 18 };
    const undo = await applyPartsStock("Branch 1", [], [part]);
    expect(await stockAt("pp", 0, "Branch 1")).toBe(3);
    await applyPartsStock("Branch 1", [part], [{ ...part, qty: 1 }]); // one goes back
    expect(await stockAt("pp", 0, "Branch 1")).toBe(4);
    await applyPartsStock("Branch 1", [{ ...part, qty: 1 }], []); // the rest go back
    expect(await stockAt("pp", 0, "Branch 1")).toBe(5);
    await expect(applyPartsStock("Branch 2", [], [{ ...part, qty: 9 }])).rejects.toThrow(/in stock/);
    expect(await stockAt("pp", 0, "Branch 2")).toBe(2);
    await undo(); // undoing the first take puts it back
    expect(await stockAt("pp", 0, "Branch 1")).toBe(7);
  });

  it("leaves free-text items out of stock handling and validates the list", () => {
    expect(cleanParts([{ name: " Cable ", qty: 1, price: 100, gst: 18 }])[0]).toMatchObject({ name: "Cable", qty: 1 });
    expect(() => cleanParts([{ name: "", qty: 1, price: 1, gst: 0 }])).toThrow(/needs a name/);
    expect(() => cleanParts([{ name: "x", qty: 0, price: 1, gst: 0 }])).toThrow(/quantity/);
    expect(() => cleanParts([{ name: "x", qty: 1, price: -1, gst: 0 }])).toThrow(/price/);
    expect(() => cleanParts([{ name: "x", qty: 1, price: 1, gst: 500 }])).toThrow(/GST/);
  });
});

describe("part payments count as revenue", () => {
  it("counts a part payment on an unfinished repair on the day it was taken", () => {
    const [b] = ticketPartPaymentBills(ticket({ advance: 50000 }));
    expect(b).toMatchObject({ id: "REP-1-P1", total: 50000, source: "service", payment: "CASH · part payment", createdAt: "2026-10-01T10:00:00.000Z" });
  });

  it("gives each payment its own row with its own mode and date", () => {
    const rows = ticketPartPaymentBills(ticket({
      advance: 80000,
      payments: [
        { id: "a", at: "2026-10-01T10:00:00.000Z", amount: 50000, mode: "CASH", receiptNo: "REP-1/R1" },
        { id: "b", at: "2026-10-05T12:00:00.000Z", amount: 30000, mode: "UPI", receiptNo: "REP-1/R2" },
      ],
    }));
    expect(rows.map((r) => [r.id, r.total, r.payment, r.createdAt])).toEqual([
      ["REP-1-P1", 50000, "CASH · part payment", "2026-10-01T10:00:00.000Z"],
      ["REP-1-P2", 30000, "UPI · part payment", "2026-10-05T12:00:00.000Z"],
    ]);
    expect(ticketIdOfSaleRow("REP-1-P2")).toBe("REP-1");
  });

  it("stops once the repair is billable (the full charge replaces it), and ignores cancelled or unpaid tickets", () => {
    expect(isServiceRevenue(ticket({ status: "ready", advance: 50000 }))).toBe(true);
    expect(ticketPartPaymentBills(ticket({ status: "ready", advance: 50000 }))).toEqual([]);
    expect(ticketPartPaymentBills(ticket({ status: "cancelled", advance: 50000 }))).toEqual([]);
    expect(ticketPartPaymentBills(ticket({ advance: 0 }))).toEqual([]);
  });
});

describe("repair tax invoice only on full payment (REP-02)", () => {
  it("issues no tax invoice while part-paid, then one recording every payment mode once fully paid", async () => {
    const { recordServiceInvoice } = await import("@/lib/billing/ledger");
    const { getInvoiceByRefId } = await import("@/lib/db/queries/invoices");
    const cash = { id: "c", at: "2026-11-03T10:00:00.000Z", amount: 100000, mode: "CASH", receiptNo: "REP-PAY/R1" };
    const upi = { id: "u", at: "2026-11-08T10:00:00.000Z", amount: 18000, mode: "UPI", receiptNo: "REP-PAY/R2" };

    // Completed, ₹1,180 charge, ₹1,000 paid in cash: a receipt only.
    const part = ticket({ id: "REP-PAY", status: "completed", finalCost: 118000, advance: 100000, payments: [cash] });
    await recordServiceInvoice(part);
    expect(await getInvoiceByRefId("REP-PAY")).toBeUndefined();

    // The balance comes in by GPay: now the tax invoice is minted, paid, and says how it was paid.
    await recordServiceInvoice({ ...part, advance: 118000, payments: [cash, upi] });
    const inv = await getInvoiceByRefId("REP-PAY");
    expect(inv).toMatchObject({ status: "paid", total: 118000, paymentMode: "Cash + GPay / UPI", source: "service" });

    // Cancelled afterwards: the invoice stays on record but is marked Cancelled (out of every total).
    await recordServiceInvoice({ ...part, status: "cancelled", advance: 118000, payments: [cash, upi] });
    expect((await getInvoiceByRefId("REP-PAY"))?.status).toBe("cancelled");
  });
});
