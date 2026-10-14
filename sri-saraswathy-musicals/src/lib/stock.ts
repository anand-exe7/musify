// Pure stock/branch helpers — safe to import from both server and client code.
// Kept out of `store/pos.ts` because that module is `"use client"` (Zustand).

import { BUSINESS } from "@/lib/data/business";

/** A branch key such as "Branch 1". The set of valid keys is `BRANCH_KEYS`. */
export type Branch = string;
export type BranchFilter = Branch | "all";

export interface Variant {
  /** Durable identity (set once the variant is saved). `variantIndex` is its position. */
  id?: string;
  attr: string;
  finish: string;
  price: number;
  weight: number;
  /** Per-branch on-hand. Legacy rows may carry a flat `stock: number` instead. */
  stockByBranch?: Partial<Record<Branch, number>>;
  /** @deprecated Legacy single-bucket stock, treated as sitting in Branch 1. */
  stock?: number;
  disabled?: boolean;
  /** This variant's own photo. */
  photo?: string | null;
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
    return BRANCH_KEYS.reduce((n, b) => n + (Number(v.stockByBranch?.[b]) || 0), 0);
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

/** Every branch the app knows about. Validate untrusted branch strings against this. */
export const BRANCH_KEYS: readonly Branch[] = BUSINESS.branches.map((b) => b.key);

/** What people call a branch — its area, e.g. "Vadapalani" (falls back to the key). */
export function branchLabel(branch: string | null | undefined): string {
  if (!branch) return "";
  return BUSINESS.branches.find((b) => b.key === branch)?.area ?? branch;
}

/** Manager role for a branch: "Branch 3" → "branch3-manager". */
export const branchManagerRole = (branch: Branch): string => `${branch.toLowerCase().replace(/\s+/g, "")}-manager`;

/** The branch that new records default to (and that legacy flat stock sits in). */
export const DEFAULT_BRANCH: Branch = BRANCH_KEYS[0];

/** `{ "Branch 1": 0, "Branch 2": 0, … }` — a zeroed per-branch stock map. */
export function emptyStockByBranch(): Record<Branch, number> {
  return Object.fromEntries(BRANCH_KEYS.map((b) => [b, 0]));
}

export function isBranch(v: unknown): v is Branch {
  return typeof v === "string" && (BRANCH_KEYS as readonly string[]).includes(v);
}

/** One change to one variant's on-hand at one branch. */
export interface StockDelta {
  variantIndex: number;
  branch: Branch;
  /** Negative = take stock out, positive = put stock in. */
  delta: number;
}

export class StockShortfallError extends Error {
  constructor(
    message: string,
    public readonly variantIndex: number,
    public readonly branch: Branch,
    public readonly onHand: number,
    public readonly requested: number,
  ) {
    super(message);
    this.name = "StockShortfallError";
  }
}

/**
 * Apply stock deltas to a product's variants without mutating them. Deltas to
 * the same bucket are netted first, so a transfer (−n here, +n there) is judged
 * on the final result. A bucket that would go negative throws
 * {@link StockShortfallError} unless `allowShort` is set, in which case it is
 * clamped at zero (used where the goods are already sold/paid for).
 */
export function applyStockDeltas(
  variants: Variant[],
  deltas: StockDelta[],
  opts: { allowShort?: boolean; label?: string } = {},
): Variant[] {
  const net = new Map<string, StockDelta>();
  for (const d of deltas) {
    if (!isBranch(d.branch)) throw new Error(`Unknown branch: ${String(d.branch)}`);
    if (!Number.isInteger(d.delta)) throw new Error("Stock quantity must be a whole number");
    const k = `${d.variantIndex}|${d.branch}`;
    const prev = net.get(k);
    net.set(k, { ...d, delta: (prev?.delta ?? 0) + d.delta });
  }
  let next = variants;
  for (const d of net.values()) {
    const v = next[d.variantIndex];
    if (!v) throw new Error("Unknown variant on this product");
    const onHand = variantStockAt(v, d.branch);
    const after = onHand + d.delta;
    if (after < 0 && !opts.allowShort) {
      const what = opts.label ? `${opts.label} — ` : "";
      throw new StockShortfallError(
        `${what}only ${onHand} in stock at ${branchLabel(d.branch)}, ${-d.delta} needed`,
        d.variantIndex,
        d.branch,
        onHand,
        -d.delta,
      );
    }
    next = next.map((x, i) => (i === d.variantIndex ? setVariantStockAt(x, d.branch, Math.max(0, after)) : x));
  }
  return next;
}
