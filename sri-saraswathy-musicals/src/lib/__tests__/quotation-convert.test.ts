/**
 * Quotation → real sale: stock comes off the quotation's branch, the payment lines are kept on bill and invoice,
 * a quotation converts once only, and a short or unlinked line refuses cleanly. Plus the pure split rules.
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
import { products, quotations } from "@/lib/db/schema";
import { insertVariants, selectProduct } from "@/lib/db/queries/variants";
import { createQuotation, getQuotation, updateQuotation, deleteQuotation } from "@/lib/db/queries/quotations";
import { convertQuotation } from "@/lib/db/queries/quotationConvert";
import { getInvoiceByRefId, updateInvoice } from "@/lib/db/queries/invoices";
import { deleteBill } from "@/lib/db/queries/pos";
import * as ledger from "@/lib/billing/ledger";
import { variantStockAt } from "@/lib/stock";
import { cleanPayments, resolvePayBox, freshPayBox, paymentLabel, statusFor } from "@/lib/paymentSplit";

const line = (over = {}) => ({ name: "Tabla set", hsn: "9206", qty: 2, rate: 118000, gst: 18, productId: "cv-p", variantKey: "Std|", ...over });
const stock = async () => variantStockAt((await selectProduct("cv-p"))!.variants[0], "Branch 1");
const quote = (over = {}) => createQuotation({ customer: "Ravi", customerPhone: "9876543210", branch: "Branch 1", items: [line()], ...over });

beforeAll(async () => {
  await db.insert(products).values({ id: "cv-p", slug: "cv-p", name: "Convert product", category: "string" });
  await insertVariants("cv-p", [{ attr: "Std", finish: "", price: 118000, weight: 0, stockByBranch: { "Branch 1": 20, "Branch 2": 5 } }]);
}, 60_000);

describe("payment split rules", () => {
  it("keeps one line per method and refuses more than is due", () => {
    const ok = cleanPayments([{ method: "CASH", amount: 100 }, { method: "UPI", amount: 50 }, { method: "CASH", amount: 20 }], 200);
    expect(ok).toEqual({ ok: true, lines: [{ method: "CASH", amount: 120 }, { method: "UPI", amount: 50 }] });
    expect(cleanPayments([{ method: "CARD", amount: 201 }], 200).ok).toBe(false);
    expect(cleanPayments([{ method: "GPAY", amount: 5 }], 200).ok).toBe(false);
    expect(cleanPayments([{ method: "CASH", amount: -1 }], 200).ok).toBe(false);
  });

  it("labels and statuses follow the lines", () => {
    expect(paymentLabel([])).toBe("");
    expect(paymentLabel([{ method: "UPI", amount: 5 }])).toBe("upi");
    expect(paymentLabel([{ method: "CASH", amount: 1 }, { method: "CARD", amount: 1 }])).toBe("split");
    expect(statusFor(100, [{ method: "CASH", amount: 100 }])).toBe("paid");
    expect(statusFor(100, [{ method: "CASH", amount: 60 }])).toBe("pending");
  });

  it("a blank single method means paid in full; cash change comes off the cash line; card can't overpay", () => {
    expect(resolvePayBox({ ...freshPayBox(), mode: "UPI" }, 500)).toMatchObject({ ok: true, lines: [{ method: "UPI", amount: 500 }], balance: 0 });
    const cash = resolvePayBox({ mode: "CASH", amounts: { CASH: 1000, CARD: null, UPI: null } }, 640);
    expect(cash).toMatchObject({ ok: true, lines: [{ method: "CASH", amount: 640 }], change: 360 });
    expect(resolvePayBox({ mode: "CARD", amounts: { CASH: null, CARD: 700, UPI: null } }, 640).ok).toBe(false);
    const split = resolvePayBox({ mode: "SPLIT", amounts: { CASH: 300, CARD: null, UPI: 200 } }, 640);
    expect(split).toMatchObject({ ok: true, balance: 140 });
  });
});

describe("converting a quotation", () => {
  it("takes stock at the quotation's branch, records a split payment on bill and invoice, and links back", async () => {
    const q = await quote();
    const r = await convertQuotation(q.id, [{ method: "CASH", amount: 100000 }, { method: "UPI", amount: q.total - 100000 }]);
    expect(r?.quotation.status).toBe("invoiced");
    expect(await stock()).toBe(18);
    const inv = await getInvoiceByRefId(r!.billId);
    expect(inv?.total).toBe(q.total);
    expect(inv?.status).toBe("paid");
    expect(inv?.paymentMode).toBe("split");
    expect(inv?.payments).toEqual([{ method: "CASH", amount: 100000 }, { method: "UPI", amount: q.total - 100000 }]);
    expect(inv?.cgst).toBe(q.cgst);
    expect((await getQuotation(q.id))?.invoiceId).toBe(r!.billId);
  });

  it("converts once only, and an invoiced quotation can't be edited or deleted", async () => {
    const q = await quote({ items: [line({ qty: 1 })] });
    await convertQuotation(q.id, [{ method: "CARD", amount: q.total }]);
    const before = await stock();
    await expect(convertQuotation(q.id, [])).rejects.toMatchObject({ status: 409 });
    expect(await stock()).toBe(before);
    await expect(updateQuotation(q.id, { notes: "x" })).rejects.toMatchObject({ status: 409 });
    await expect(deleteQuotation(q.id)).rejects.toMatchObject({ status: 409 });
  });

  it("a line discount and MRP are saved, reduce the line, and carry onto the invoice", async () => {
    const q = await quote({ items: [line({ qty: 2, rate: 118000, mrp: 150000, discount: 36000 })], discount: 10000 });
    expect(q.items[0]).toMatchObject({ mrp: 150000, discount: 36000, amount: 2 * 118000 - 36000 });
    expect(q.total).toBe(2 * 118000 - 36000 - 10000);
    await expect(quote({ items: [line({ qty: 1, discount: 999999 })] })).rejects.toMatchObject({ status: 400 });
    const r = await convertQuotation(q.id, [{ method: "CASH", amount: q.total }]);
    const inv = (await getInvoiceByRefId(r!.billId))!;
    expect(inv.total).toBe(q.total);
    expect(inv.items[0]).toMatchObject({ rate: 118000, mrp: 150000, discount: 36000 });
  });

  it("if the tax invoice can't be written, the sale is undone: stock back, quotation reopened, nothing left half-done", async () => {
    const q = await quote({ items: [line({ qty: 2 })] });
    const before = await stock();
    const spy = vi.spyOn(ledger, "recordBillInvoice").mockResolvedValueOnce(undefined); // "fails" without writing an invoice
    await expect(convertQuotation(q.id, [{ method: "CASH", amount: q.total }])).rejects.toMatchObject({ status: 500 });
    spy.mockRestore();
    expect(await stock()).toBe(before);
    const after = (await getQuotation(q.id))!;
    expect(after.status).toBe("open");
    expect(after.invoiceId).toBeFalsy();
    // and pressing Convert again now just works
    const again = await convertQuotation(q.id, [{ method: "CASH", amount: q.total }]);
    expect(again?.quotation.status).toBe("invoiced");
    expect(await getInvoiceByRefId(again!.billId)).toBeTruthy();
    expect(await stock()).toBe(before - 2);
  });

  it("two people converting at once make one sale", async () => {
    const q = await quote({ items: [line({ qty: 1 })] });
    const before = await stock();
    const results = await Promise.allSettled([convertQuotation(q.id, []), convertQuotation(q.id, [])]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await stock()).toBe(before - 1);
  });

  it("part payment leaves the invoice pending; paying the rest later clears it", async () => {
    const q = await quote({ items: [line({ qty: 1 })] });
    const r = await convertQuotation(q.id, [{ method: "CASH", amount: 50000 }]);
    const inv = (await getInvoiceByRefId(r!.billId))!;
    expect(inv.status).toBe("pending");
    const after = await updateInvoice(inv.id, { payments: [{ method: "CASH", amount: 50000 }, { method: "UPI", amount: q.total - 50000 }] });
    expect(after?.status).toBe("paid");
    expect(after?.paymentMode).toBe("split");
    await expect(updateInvoice(inv.id, { payments: [{ method: "CASH", amount: q.total + 1 }] })).rejects.toMatchObject({ status: 400 });
  });

  it("refuses when stock is short and leaves the quotation open", async () => {
    const q = await quote({ items: [line({ qty: 99 })] });
    const before = await stock();
    await expect(convertQuotation(q.id, [])).rejects.toMatchObject({ status: 409 });
    expect((await getQuotation(q.id))?.status).toBe("open");
    expect(await stock()).toBe(before);
  });

  it("refuses payments above the total, and quotations with an unlinked line", async () => {
    const q = await quote({ items: [line({ qty: 1 })] });
    await expect(convertQuotation(q.id, [{ method: "CASH", amount: q.total + 1 }])).rejects.toMatchObject({ status: 400 });
    expect((await getQuotation(q.id))?.status).toBe("open");
    // An older quotation typed before products were linked.
    await db.insert(quotations).values({
      id: "QUO-old", number: "QT-OLD", date: "2026-01-01", validUntil: "2026-02-01", customer: "Old", branch: "Branch 1",
      items: [{ name: "Loose item", hsn: "-", qty: 1, rate: 1000, gst: 0, amount: 1000 }], total: 1000,
    });
    await expect(convertQuotation("QUO-old", [])).rejects.toMatchObject({ status: 400 });
  });

  it("new quotations must pick a product for every line", async () => {
    await expect(createQuotation({ customer: "A", branch: "Branch 1", items: [{ name: "Loose", qty: 1, rate: 100, gst: 0 }] })).rejects.toMatchObject({ status: 400 });
    await expect(createQuotation({ customer: "A", branch: "Branch 1", items: [line({ productId: "nope" })] })).rejects.toMatchObject({ status: 400 });
  });

  it("deleting the resulting bill puts the stock back and cancels the invoice", async () => {
    const q = await quote({ items: [line({ qty: 1 })] });
    const before = await stock();
    const r = await convertQuotation(q.id, [{ method: "UPI", amount: q.total }]);
    expect(await stock()).toBe(before - 1);
    await deleteBill(r!.billId);
    expect(await stock()).toBe(before);
    expect((await getInvoiceByRefId(r!.billId))?.status).toBe("cancelled");
  });
});
