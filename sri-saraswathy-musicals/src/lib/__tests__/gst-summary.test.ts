import { describe, it, expect } from "vitest";
import { rateWiseSummary, invoiceRateOf, toCsv, neutraliseFormula } from "@/lib/gst/summary";
import { inPeriod } from "@/lib/store/pos";
import type { Invoice } from "@/types";

/** A minimal invoice row: money in paise, tax split the way an intra-state sale carries it. */
const inv = (over: Partial<Invoice> = {}): Invoice =>
  ({
    id: over.id ?? "i1",
    number: over.number ?? "SSM/2026-27/0001",
    date: over.date ?? "2026-11-19",
    branch: "vadapalani",
    customer: "Walk-in",
    items: [{ name: "Tabla", hsn: "9206", qty: 1, rate: 100000, gst: 18, amount: 100000 }],
    subtotal: 100000,
    cgst: 9000,
    sgst: 9000,
    igst: 0,
    total: 118000,
    status: "paid",
    ...over,
  }) as Invoice;

describe("invoiceRateOf", () => {
  it("takes the slab off the taxed line", () => {
    expect(invoiceRateOf(inv())).toBe(18);
  });
  it("falls back to the tax / taxable ratio when no line carries a rate", () => {
    expect(invoiceRateOf(inv({ items: [], cgst: 2500, sgst: 2500 }))).toBe(5);
  });
  it("reads an untaxed bill of supply as 0%", () => {
    expect(invoiceRateOf(inv({ cgst: 0, sgst: 0, igst: 0 }))).toBe(0);
  });
});

describe("rateWiseSummary", () => {
  it("buckets by slab and totals across them", () => {
    const { buckets, totals } = rateWiseSummary([
      inv({ id: "a" }),
      inv({ id: "b" }),
      inv({ id: "c", items: [{ name: "Book", hsn: "4901", qty: 1, rate: 50000, gst: 5, amount: 50000 }], subtotal: 50000, cgst: 1250, sgst: 1250, total: 52500 }),
    ]);
    expect(buckets.map((b) => b.rate)).toEqual([5, 18]);
    expect(buckets[1].count).toBe(2);
    expect(buckets[1].taxable).toBe(200000);
    expect(buckets[1].tax).toBe(36000);
    expect(totals.count).toBe(3);
    expect(totals.taxable).toBe(250000);
    expect(totals.tax).toBe(38500);
    expect(totals.cgst + totals.sgst + totals.igst).toBe(totals.tax);
  });

  it("never counts a cancelled bill — it carries no output tax", () => {
    const { totals } = rateWiseSummary([inv({ id: "a" }), inv({ id: "b", status: "cancelled" })]);
    expect(totals.count).toBe(1);
    expect(totals.tax).toBe(18000);
  });

  it("keeps an inter-state sale in IGST, not CGST/SGST", () => {
    const { totals } = rateWiseSummary([inv({ cgst: 0, sgst: 0, igst: 18000 })]);
    expect(totals.igst).toBe(18000);
    expect(totals.cgst + totals.sgst).toBe(0);
  });
});

describe("the collections period filter", () => {
  const today = new Date("2026-11-19T10:00:00+05:30");
  it("keeps a date inside a custom window, both ends included", () => {
    expect(inPeriod("2026-11-01", "custom", today, { from: "2026-11-01", to: "2026-11-30" })).toBe(true);
    expect(inPeriod("2026-11-30", "custom", today, { from: "2026-11-01", to: "2026-11-30" })).toBe(true);
    expect(inPeriod("2026-10-31", "custom", today, { from: "2026-11-01", to: "2026-11-30" })).toBe(false);
    expect(inPeriod("2026-12-01", "custom", today, { from: "2026-11-01", to: "2026-11-30" })).toBe(false);
  });
  it("treats a half-open window as open at that end", () => {
    expect(inPeriod("2020-01-01", "custom", today, { to: "2026-11-30" })).toBe(true);
    expect(inPeriod("2030-01-01", "custom", today, { from: "2026-11-01" })).toBe(true);
  });
  it("lets everything through until a date is picked", () => {
    expect(inPeriod("2001-01-01", "custom", today, {})).toBe(true);
  });
});

describe("CSV safety", () => {
  it("defuses a formula typed into a customer name", () => {
    expect(neutraliseFormula("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
    expect(neutraliseFormula("-12.50")).toBe("-12.50");
  });
  it("quotes commas and keeps rows on CRLF", () => {
    expect(toCsv([["a,b", 1], ["c", 2]])).toBe('"a,b",1\r\nc,2');
  });
});
