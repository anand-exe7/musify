// Pure stock/branch helpers — safe to import from both server and client code.
// Kept out of `store/pos.ts` because that module is `"use client"` (Zustand).

export type Branch = "Branch 1" | "Branch 2";
export type BranchFilter = Branch | "all";

export interface Variant {
  attr: string;
  finish: string;
  price: number;
  weight: number;
  /** Per-branch on-hand. Legacy rows may carry a flat `stock: number` instead. */
  stockByBranch?: Partial<Record<Branch, number>>;
  /** @deprecated Legacy single-bucket stock, treated as sitting in Branch 1. */
  stock?: number;
  disabled?: boolean;
}

/** On-hand at a specific branch for one variant. Tolerates the legacy shape:
 *  a variant that pre-dates per-branch buckets carries `stock: number`, which
 *  is treated as sitting in Branch 1. */
export function variantStockAt(v: Variant, branch: Branch): number {
  if (v.stockByBranch && typeof v.stockByBranch[branch] === "number") {
    return Number(v.stockByBranch[branch]) || 0;
  }
  return branch === "Branch 1" ? Number(v.stock) || 0 : 0;
}

/** Total on-hand across every branch for one variant. */
export function variantStock(v: Variant): number {
  if (v.stockByBranch) {
    return (Number(v.stockByBranch["Branch 1"]) || 0) + (Number(v.stockByBranch["Branch 2"]) || 0);
  }
  return Number(v.stock) || 0;
}

/** Set the `branch` bucket to `qty`, preserving other buckets. Migrates a
 *  legacy `stock` field into the map. Returns a new object; never mutates. */
export function setVariantStockAt(v: Variant, branch: Branch, qty: number): Variant {
  const legacyBranch1 = v.stockByBranch ? undefined : Number(v.stock) || 0;
  const next: Partial<Record<Branch, number>> = {
    ...(v.stockByBranch ?? {}),
    ...(legacyBranch1 !== undefined ? { "Branch 1": legacyBranch1 } : {}),
    [branch]: Math.max(0, Math.round(qty)),
  };
  const { stock: _drop, ...rest } = v;
  void _drop;
  return { ...rest, stockByBranch: next };
}
