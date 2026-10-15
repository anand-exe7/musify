/**
 * Quotations: GST-inclusive maths, per-branch numbering (QT-2026-P0001), the
 * 30-day validity window, and server-side validation (totals are never trusted
 * from the client).
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
import { branches } from "@/lib/db/schema";
import { createQuotation, getQuotation, updateQuotation, deleteQuotation } from "@/lib/db/queries/quotations";
import { addDays, computeQuote, QUOTE_VALID_DAYS } from "@/lib/quotation";

const line = (over = {}) => ({ name: "Tabla set", hsn: "9206", qty: 1, rate: 118000, gst: 18, ...over });

beforeAll(async () => {
  await db.select().from(branches); // wait for the mocked db + migrations
}, 60_000);

describe("quotation maths", () => {
  it("extracts GST from GST-inclusive prices", () => {
    const { amounts, totals } = computeQuote([{ qty: 1, rate: 118000, gst: 18 }]);
    expect(amounts).toEqual([118000]);
    expect(totals).toEqual({ subtotal: 100000, cgst: 9000, sgst: 9000, igst: 0, total: 118000 });
  });

  it("applies a discount before tax and keeps the parts adding up", () => {
    const { totals } = computeQuote([{ qty: 2, rate: 59000, gst: 18 }, { qty: 1, rate: 50000, gst: 0 }], 18000);
    expect(totals.total).toBe(118000 + 50000 - 18000);
    expect(totals.subtotal + totals.cgst + totals.sgst).toBe(totals.total);
  });

  it("is valid for 30 days from the issue date", () => {
    expect(addDays("2026-10-01T12:00:00.000Z", QUOTE_VALID_DAYS).slice(0, 10)).toBe("2026-10-31");
  });
});

describe("quotation records", () => {
  it("numbers per branch and year, with a random share id", async () => {
    const a = await createQuotation({ customer: "A", branch: "Branch 2", items: [line()], date: "2026-10-01T10:00:00.000Z" });
    const b = await createQuotation({ customer: "B", branch: "Branch 2", items: [line()], date: "2026-10-02T10:00:00.000Z" });
    const c = await createQuotation({ customer: "C", branch: "Branch 1", items: [line()], date: "2026-10-02T10:00:00.000Z" });
    expect([a.number, b.number]).toEqual(["QT-2026-P0001", "QT-2026-P0002"]);
    expect(c.number).toBe("QT-2026-V0001");
    expect(a.id).toMatch(/^QUO-\d{4}-[A-Z0-9]{5}$/);
    expect(a.id).not.toContain(a.number);
  });

  it("defaults validity to 30 days after the issue date", async () => {
    const q = await createQuotation({ customer: "A", branch: "Branch 1", items: [line()], date: "2026-10-01T12:00:00.000Z" });
    expect(q.validUntil.slice(0, 10)).toBe("2026-10-31");
    expect(q.status).toBe("open");
  });

  it("recomputes totals on the server and ignores any the client sends", async () => {
    const q = await createQuotation({
      customer: "A", branch: "Branch 1", items: [line({ qty: 2, amount: 1, rate: 118000 })],
      ...({ total: 1, subtotal: 1, cgst: 1, sgst: 1 } as object),
    });
    expect(q.total).toBe(236000);
    expect(q.subtotal).toBe(200000);
    expect(q.items[0].amount).toBe(236000);
  });

  it("changes the GST on a line and recomputes", async () => {
    const q = await createQuotation({ customer: "A", branch: "Branch 1", items: [line()] });
    const u = await updateQuotation(q.id, { items: [line({ gst: 12 })] });
    expect(u?.total).toBe(118000);
    // 118000 incl. 12% → taxable 105357, tax 12643, split 6322 + 6321
    expect(u?.subtotal).toBe(105357);
    expect((u?.cgst ?? 0) + (u?.sgst ?? 0)).toBe(12643);
    expect(u?.number).toBe(q.number);
  });

  it("rejects bad input", async () => {
    await expect(createQuotation({ customer: " ", branch: "Branch 1", items: [line()] })).rejects.toThrow(/customer/i);
    await expect(createQuotation({ customer: "A", branch: "Nowhere", items: [line()] })).rejects.toThrow(/branch/i);
    await expect(createQuotation({ customer: "A", branch: "Branch 1", items: [] })).rejects.toThrow(/at least one/i);
    await expect(createQuotation({ customer: "A", branch: "Branch 1", items: [line({ qty: 0 })] })).rejects.toThrow(/quantity/i);
    await expect(createQuotation({ customer: "A", branch: "Branch 1", items: [line({ rate: -5 })] })).rejects.toThrow(/rate/i);
    await expect(createQuotation({ customer: "A", branch: "Branch 1", items: [line({ gst: 150 })] })).rejects.toThrow(/GST/);
  });

  it("deletes", async () => {
    const q = await createQuotation({ customer: "A", branch: "Branch 1", items: [line()] });
    expect(await deleteQuotation(q.id)).toBe(true);
    expect(await getQuotation(q.id)).toBeUndefined();
  });
});
