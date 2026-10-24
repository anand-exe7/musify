import { describe, expect, it } from "vitest";
import type { Expense } from "@/lib/store/expenses";
import { buildExpenseReport, expenseReportRows, monthLabel } from "@/lib/reports/expenses";

let n = 0;
const exp = (over: Partial<Expense>): Expense => ({
  id: `e${++n}`, title: "Item", category: "Rent", amount: 100_00, paymentMode: "CASH", notes: null,
  expenseDate: "2026-10-05", createdAt: "2026-10-05T10:00:00.000Z", branch: "Branch 1", ...over,
});

const list = [
  exp({ title: "Shop rent", category: "Rent", amount: 20_000_00, expenseDate: "2026-09-01", paymentMode: "BANK" }),
  exp({ title: "Power", category: "Electricity", amount: 3_000_00, expenseDate: "2026-10-03", branch: "Branch 2" }),
  exp({ title: "Auto", category: "Transport", amount: 500_00, expenseDate: "2026-10-05", paymentMode: "UPI" }),
  exp({ title: "Rent Porur", category: "Rent", amount: 10_000_00, expenseDate: "2026-10-01", branch: "Branch 2", paymentMode: "BANK" }),
];

describe("buildExpenseReport", () => {
  const r = buildExpenseReport(list);

  it("totals, counts and averages", () => {
    expect(r.total).toBe(33_500_00);
    expect(r.count).toBe(4);
    expect(r.average).toBe(8_375_00);
    expect(r.largest?.title).toBe("Shop rent");
  });

  it("groups by category, biggest first, with shares that add up", () => {
    expect(r.byCategory.map((s) => [s.key, s.amount, s.count])).toEqual([
      ["Rent", 30_000_00, 2], ["Electricity", 3_000_00, 1], ["Transport", 500_00, 1],
    ]);
    expect(r.byCategory[0].share).toBeCloseTo(89.6, 1);
    expect(r.byCategory.reduce((n, s) => n + s.share, 0)).toBeCloseTo(100, 0);
  });

  it("groups by payment mode and branch, and by month oldest first", () => {
    expect(r.byPayment.map((s) => [s.key, s.amount])).toEqual([["BANK", 30_000_00], ["CASH", 3_000_00], ["UPI", 500_00]]);
    expect(r.byBranch.map((s) => [s.key, s.label, s.amount])).toEqual([
      ["Branch 1", "Vadapalani", 20_500_00], ["Branch 2", "Porur", 13_000_00],
    ]);
    expect(r.byMonth.map((s) => [s.label, s.amount])).toEqual([["Sep 2026", 20_000_00], ["Oct 2026", 13_500_00]]);
  });

  it("lists every entry, newest first", () => {
    expect(r.rows.map((e) => e.title)).toEqual(["Auto", "Power", "Rent Porur", "Shop rent"]);
  });

  it("copes with nothing", () => {
    const e = buildExpenseReport([]);
    expect(e).toMatchObject({ total: 0, count: 0, average: 0, largest: null, byCategory: [], rows: [] });
  });
});

describe("expenseReportRows", () => {
  const meta = { period: "Month", branch: "All branches", generated: "now" };

  it("puts the request, summary, each breakdown and every entry in the sheet", () => {
    const rows = expenseReportRows(buildExpenseReport(list), meta);
    const flat = rows.map((r) => r.join("|"));
    expect(flat).toContain("Period|Month");
    expect(flat).toContain("Total expenses|33500.00");
    expect(flat).toContain("By category");
    expect(flat).toContain("Rent|2|30000.00|89.6");
    expect(flat).toContain("2026-10-05|Vadapalani|Transport|Auto|UPI||500.00");
    expect(flat.some((l) => l.startsWith("Net profit"))).toBe(false);
  });

  it("adds sales and net profit only when given a revenue", () => {
    const flat = expenseReportRows(buildExpenseReport(list), meta, 50_000_00).map((r) => r.join("|"));
    expect(flat).toContain("Revenue|50000.00");
    expect(flat).toContain("Net profit|16500.00");
  });
});

describe("monthLabel", () => {
  it("reads like a month", () => expect(monthLabel("2026-01-15")).toBe("Jan 2026"));
});
