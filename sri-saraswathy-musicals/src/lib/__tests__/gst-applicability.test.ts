import { describe, it, expect } from "vitest";
import { resolveGstColumns } from "@/lib/gst/applicability";

describe("resolveGstColumns (H12)", () => {
  it("explicit isGstApplicable:false wins over a numeric rate", () => {
    expect(resolveGstColumns({ gstRate: 18, isGstApplicable: false })).toEqual({ gstRate: null, isGstApplicable: false });
  });
  it("a null rate with no flag means exempt", () => {
    expect(resolveGstColumns({ gstRate: null })).toEqual({ gstRate: null, isGstApplicable: false });
  });
  it("a missing rate defaults to the 18% slab", () => {
    expect(resolveGstColumns({})).toEqual({ gstRate: 18, isGstApplicable: true });
  });
  it("keeps an explicit rate, including 0%", () => {
    expect(resolveGstColumns({ gstRate: 5 })).toEqual({ gstRate: 5, isGstApplicable: true });
    expect(resolveGstColumns({ gstRate: 0, isGstApplicable: true })).toEqual({ gstRate: 0, isGstApplicable: true });
  });
  it("flag true with a null rate falls back to the default slab (never taxable-at-null)", () => {
    expect(resolveGstColumns({ gstRate: null, isGstApplicable: true })).toEqual({ gstRate: 18, isGstApplicable: true });
  });
});
