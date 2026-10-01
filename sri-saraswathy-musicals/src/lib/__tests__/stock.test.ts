import { describe, it, expect } from "vitest";
import { applyStockDeltas, StockShortfallError, variantStockAt, variantStock, isBranch, type Variant } from "@/lib/stock";

const v = (b1: number, b2: number): Variant => ({ attr: "A", finish: "", price: 1, weight: 0, stockByBranch: { "Branch 1": b1, "Branch 2": b2 } });

describe("applyStockDeltas (H6)", () => {
  it("takes stock out of the named branch only, without mutating the input", () => {
    const input = [v(5, 3)];
    const out = applyStockDeltas(input, [{ variantIndex: 0, branch: "Branch 1", delta: -2 }]);
    expect(variantStockAt(out[0], "Branch 1")).toBe(3);
    expect(variantStockAt(out[0], "Branch 2")).toBe(3);
    expect(variantStockAt(input[0], "Branch 1")).toBe(5);
  });
  it("throws on an oversell instead of flooring to zero", () => {
    expect(() => applyStockDeltas([v(2, 0)], [{ variantIndex: 0, branch: "Branch 1", delta: -5 }], { label: "Flute" }))
      .toThrow(StockShortfallError);
    expect(() => applyStockDeltas([v(2, 0)], [{ variantIndex: 0, branch: "Branch 1", delta: -5 }], { label: "Flute" }))
      .toThrow(/Flute — only 2 in stock at Branch 1, 5 needed/);
  });
  it("clamps at zero only when explicitly allowed (goods already paid for)", () => {
    const out = applyStockDeltas([v(2, 0)], [{ variantIndex: 0, branch: "Branch 1", delta: -5 }], { allowShort: true });
    expect(variantStockAt(out[0], "Branch 1")).toBe(0);
  });
  it("nets a transfer, so it is judged on the final result", () => {
    const out = applyStockDeltas([v(3, 0)], [
      { variantIndex: 0, branch: "Branch 1", delta: -3 },
      { variantIndex: 0, branch: "Branch 2", delta: 3 },
    ]);
    expect(variantStock(out[0])).toBe(3);
    expect(variantStockAt(out[0], "Branch 2")).toBe(3);
  });
  it("migrates a legacy flat `stock` field into Branch 1", () => {
    const legacy: Variant = { attr: "A", finish: "", price: 1, weight: 0, stock: 4 };
    const out = applyStockDeltas([legacy], [{ variantIndex: 0, branch: "Branch 1", delta: -1 }]);
    expect(variantStockAt(out[0], "Branch 1")).toBe(3);
    expect(out[0].stock).toBeUndefined();
  });
  it("rejects unknown branches and non-integer quantities (a typo can't mint a ghost bucket)", () => {
    expect(() => applyStockDeltas([v(1, 1)], [{ variantIndex: 0, branch: "Branch 3" as never, delta: 1 }])).toThrow(/Unknown branch/);
    expect(() => applyStockDeltas([v(1, 1)], [{ variantIndex: 0, branch: "Branch 1", delta: 1.5 }])).toThrow(/whole number/);
  });
  it("rejects an unknown variant index", () => {
    expect(() => applyStockDeltas([v(1, 1)], [{ variantIndex: 3, branch: "Branch 1", delta: 1 }])).toThrow(/Unknown variant/);
  });
});

describe("isBranch", () => {
  it("accepts only the known branch keys", () => {
    expect(isBranch("Branch 1")).toBe(true);
    expect(isBranch("Branch 9")).toBe(false);
    expect(isBranch(undefined)).toBe(false);
  });
});
