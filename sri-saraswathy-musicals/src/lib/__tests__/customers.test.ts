/**
 * Customers: filed by mobile number when an invoice is made, found again from any spelling of the number,
 * listed with their totals, and limited to a branch user's own branch.
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
import { branches, customers } from "@/lib/db/schema";
import { createInvoice, updateInvoice, cancelInvoice } from "@/lib/db/queries/invoices";
import { getCustomerDetail, getCustomersPage, lookupCustomer, upsertCustomer } from "@/lib/db/queries/customers";
import { formatPhone, normalizePhone } from "@/lib/customers/phone";
import type { Invoice } from "@/types";

let n = 0;
const inv = (over: Partial<Invoice>): Invoice => {
  n += 1;
  return {
    id: `cu-${n}`, number: `SSM/2026-27/${7000 + n}`, date: `2026-10-${String(10 + (n % 15)).padStart(2, "0")}T10:00:00.000Z`,
    customer: "Customer", branch: "Branch 1", items: [], subtotal: 0, cgst: 0, sgst: 0, igst: 0, total: 100_00, paymentMode: "cash", status: "paid",
    customerPhone: null, ...over,
  };
};

beforeAll(async () => {
  await db.select().from(branches); // wait for the mocked db + migrations
}, 60_000);

describe("normalizePhone", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["98765 43210", "9876543210"],
    ["+91-98765-43210", "9876543210"],
    ["09876543210", "9876543210"],
    ["919876543210", "9876543210"],
  ])("reads %s", (raw, want) => expect(normalizePhone(raw)).toBe(want));
  it.each(["", "12345", "1234567890", "98765", "abcdefghij", null, undefined])("rejects %s", (raw) => expect(normalizePhone(raw as string)).toBeNull());
  it("formats for reading", () => expect(formatPhone("9876543210")).toBe("98765 43210"));
});

describe("filing customers from invoices", () => {
  it("makes a customer from an invoice with a valid mobile, and links the invoice", async () => {
    const i = await createInvoice(inv({ customer: "Ravi Kumar", customerPhone: "98765 11111", customerGstin: "33ABCDE1234F1Z5", branch: "Branch 1" }));
    const c = await lookupCustomer("9876511111");
    expect(c).toMatchObject({ name: "Ravi Kumar", phone: "9876511111", gstin: "33ABCDE1234F1Z5", bills: 1 });
    expect((i as Invoice & { customerId?: string }).customerId).toBe(c!.id);
  });

  it("recognises the same person from any spelling of the number, and counts both bills", async () => {
    await createInvoice(inv({ customer: "Ravi K", customerPhone: "+91 98765-11111", branch: "Branch 2" }));
    const c = await lookupCustomer("09876511111");
    expect(c?.bills).toBe(2);
    expect(c?.name).toBe("Ravi K"); // the latest bill's name
    expect(c?.gstin).toBe("33ABCDE1234F1Z5"); // a bill without a GSTIN does not wipe it
    expect((await db.select().from(customers)).filter((x) => x.phone === "9876511111")).toHaveLength(1);
  });

  it("does not file walk-ins or numbers that are not mobiles, and never fails the invoice", async () => {
    const before = (await db.select().from(customers)).length;
    const a = await createInvoice(inv({ customer: "Walk-in", customerPhone: "" }));
    const b = await createInvoice(inv({ customer: "Someone", customerPhone: "12345" }));
    expect(a.number).toBeTruthy();
    expect(b.number).toBeTruthy();
    expect((await db.select().from(customers)).length).toBe(before);
  });

  it("a blank or Walk-in name never wipes a real one", async () => {
    await upsertCustomer({ phone: "9000000001", name: "Meena" });
    await upsertCustomer({ phone: "9000000001", name: "Walk-in" });
    await upsertCustomer({ phone: "9000000001", name: "" });
    expect((await lookupCustomer("9000000001"))?.name).toBe("Meena");
  });

  it("lookup says nothing for an unknown number", async () => {
    expect(await lookupCustomer("9111111111")).toBeNull();
    expect(await lookupCustomer("123")).toBeNull();
  });

  it("an edited number moves the invoice to that customer", async () => {
    const i = await createInvoice(inv({ customer: "Anu", customerPhone: "9222222222" }));
    await updateInvoice(i.id, { customerPhone: "9333333333", customer: "Anu S" });
    expect((await lookupCustomer("9222222222"))?.bills).toBe(0);
    expect(await lookupCustomer("9333333333")).toMatchObject({ name: "Anu S", bills: 1 });
  });

  it("cancelled invoices stay on the record but stop counting", async () => {
    const i = await createInvoice(inv({ customer: "Gita", customerPhone: "9444444444" }));
    await createInvoice(inv({ customer: "Gita", customerPhone: "9444444444" }));
    await cancelInvoice(i.id);
    expect((await lookupCustomer("9444444444"))?.bills).toBe(1);
    const d = await getCustomerDetail((await lookupCustomer("9444444444"))!.id, null);
    expect(d?.invoices).toHaveLength(2);
    expect(d?.invoices.map((x) => x.status).sort()).toEqual(["cancelled", "paid"]);
  });
});

describe("customer list", () => {
  it("pages, searches by name or any part of the number, and totals only what counts", async () => {
    const all = await getCustomersPage({ scope: null, pageSize: 1000 });
    expect(all.total).toBe(all.items.length);
    const ravi = all.items.find((c) => c.phone === "9876511111")!;
    expect(ravi).toMatchObject({ bills: 2, total: 200_00 });

    expect((await getCustomersPage({ q: "ravi", scope: null })).items.map((c) => c.phone)).toContain("9876511111");
    expect((await getCustomersPage({ q: "98765 111", scope: null })).items.map((c) => c.phone)).toContain("9876511111");
    expect((await getCustomersPage({ q: "zzzz-nobody", scope: null })).total).toBe(0);
    // Digits inside a name search are not matched against phone numbers ("R2D2" must not find every number with a 2).
    expect((await getCustomersPage({ q: "R2D2", scope: null })).total).toBe(0);

    const p1 = await getCustomersPage({ scope: null, pageSize: 2, page: 1 });
    const p2 = await getCustomersPage({ scope: null, pageSize: 2, page: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.items.map((c) => c.id)).not.toEqual(p2.items.map((c) => c.id));
    expect(p1.pages).toBe(Math.ceil(all.total / 2));
  });

  it("a branch user sees only customers their branch billed, with that branch's numbers", async () => {
    await createInvoice(inv({ customer: "Only Porur", customerPhone: "9555555555", branch: "Branch 2", total: 500_00 }));
    const b1 = await getCustomersPage({ scope: ["Branch 1"], pageSize: 1000 });
    expect(b1.items.map((c) => c.phone)).not.toContain("9555555555");
    const ravi1 = b1.items.find((c) => c.phone === "9876511111")!;
    expect(ravi1).toMatchObject({ bills: 1, total: 100_00 }); // Ravi's other bill was at Branch 2

    const b2 = await getCustomersPage({ scope: ["Branch 2"], pageSize: 1000 });
    expect(b2.items.map((c) => c.phone)).toContain("9555555555");
    expect(b2.total).toBe(b2.items.length);
  });

  it("customer detail is limited the same way, and unknown ids are not found", async () => {
    const id = (await lookupCustomer("9876511111"))!.id;
    expect((await getCustomerDetail(id, null))?.invoices).toHaveLength(2);
    expect((await getCustomerDetail(id, ["Branch 1"]))?.invoices).toHaveLength(1);
    expect(await getCustomerDetail(id, ["Branch 3"])).toBeUndefined();
    expect(await getCustomerDetail("nope", null)).toBeUndefined();
  });
});
