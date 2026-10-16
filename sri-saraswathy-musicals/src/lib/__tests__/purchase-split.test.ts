import { describe, expect, it } from "vitest";
import { allocTotal, followTotal, moveAll, putRest, splitEvenly, splitStatus, takeFrom, zeroAlloc } from "@/lib/purchaseSplit";

const a = (v: number, p: number, n: number) => ({ "Branch 1": v, "Branch 2": p, "Branch 3": n });

describe("typing branch quantities on a purchase line", () => {
  it("reports ok, under and over against the total on the vendor's bill — without changing any box", () => {
    expect(splitStatus(a(5, 5, 1), 11)).toMatchObject({ state: "ok", sum: 11 });
    expect(splitStatus(a(5, 5, 0), 11)).toMatchObject({ state: "under", diff: 1, sum: 10 });
    expect(splitStatus(a(6, 5, 2), 11)).toMatchObject({ state: "over", diff: 2, sum: 13 });
  });

  it("needs nothing typed as a total: the boxes just add up", () => {
    expect(splitStatus(a(3, 0, 2), null)).toMatchObject({ state: "ok", sum: 5 });
    expect(splitStatus(a(0, 0, 0), null).state).toBe("empty");
    expect(splitStatus(a(0, 0, 0), 4)).toMatchObject({ state: "under", diff: 4 });
  });

  it("a typed total goes to the one branch holding the stock, but never rearranges a split", () => {
    expect(followTotal(a(1, 0, 0), 10, "Branch 1")).toEqual(a(10, 0, 0));
    expect(followTotal(a(0, 4, 0), 7, "Branch 1")).toEqual(a(0, 7, 0));
    expect(followTotal(zeroAlloc(), 3, "Branch 2")).toEqual(a(0, 3, 0));
    const split = a(5, 5, 1);
    expect(followTotal(split, 11, "Branch 1")).toBe(split); // untouched
  });

  it("quick actions: all to one branch, even split, put the rest / take the extra", () => {
    expect(moveAll(10, "Branch 3")).toEqual(a(0, 0, 10));
    expect(splitEvenly(11)).toEqual(a(4, 4, 3));
    expect(allocTotal(splitEvenly(11))).toBe(11);
    expect(putRest(a(5, 5, 0), "Branch 3", 1)).toEqual(a(5, 5, 1));
    expect(takeFrom(a(6, 5, 2), "Branch 1", 2)).toEqual(a(4, 5, 2));
    expect(takeFrom(a(1, 0, 0), "Branch 1", 9)).toEqual(a(0, 0, 0));
  });
});
