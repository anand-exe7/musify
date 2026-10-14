import { describe, expect, it } from "vitest";
import { allocList, fitPaymentAlloc, normalizeAlloc, sumAlloc } from "@/lib/paymentAlloc";

const B = ["Branch 1", "Branch 2", "Branch 3"];

describe("payment split across branches", () => {
  it("gives the rest to the other branch when one is edited (like the stock split)", () => {
    const next = fitPaymentAlloc({ "Branch 1": 100000, "Branch 2": 0 }, 100000, "Branch 1", ["Branch 1", "Branch 2"]);
    expect(next).toEqual({ "Branch 1": 100000, "Branch 2": 0 });
    // The person types ₹300 for Porur: Vadapalani takes the remaining ₹700.
    expect(fitPaymentAlloc({ "Branch 1": 100000, "Branch 2": 30000 }, 100000, "Branch 1", ["Branch 1", "Branch 2"])).toEqual({ "Branch 1": 70000, "Branch 2": 30000 });
  });

  it("always adds up to the total, whatever is typed", () => {
    for (const typed of [0, 1, 55555, 100000, 250000]) {
      const v = Math.min(typed, 100000);
      const next = fitPaymentAlloc({ "Branch 1": 100000, "Branch 2": v }, 100000, "Branch 1", B.slice(0, 2));
      expect(sumAlloc(next)).toBe(100000);
      expect(Object.values(next).every((n) => n >= 0)).toBe(true);
    }
  });

  it("trims other branches back when they exceed the total", () => {
    const next = fitPaymentAlloc({ "Branch 1": 0, "Branch 2": 80000, "Branch 3": 80000 }, 100000, "Branch 1", B);
    expect(sumAlloc(next)).toBe(100000);
    expect(next["Branch 1"]).toBe(0);
  });

  it("re-fits when the amount paid changes, and keeps a split that already adds up", () => {
    expect(normalizeAlloc({ "Branch 1": 60000, "Branch 2": 40000 }, 100000, B.slice(0, 2))).toEqual({ "Branch 1": 60000, "Branch 2": 40000 });
    expect(sumAlloc(normalizeAlloc({ "Branch 1": 60000, "Branch 2": 40000 }, 150000, B.slice(0, 2)))).toBe(150000);
    expect(normalizeAlloc({}, 70000, ["Branch 2"])).toEqual({ "Branch 2": 70000 });
    expect(normalizeAlloc({ "Branch 1": 5 }, 100, [])).toEqual({});
  });

  it("lists only the branches that pay something", () => {
    expect(allocList({ "Branch 1": 0, "Branch 2": 5000 })).toEqual([{ branch: "Branch 2", amount: 5000 }]);
  });
});
