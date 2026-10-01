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

/** Every branch the app knows about. Validate untrusted branch strings against this. */
export const BRANCH_KEYS: readonly Branch[] = ["Branch 1", "Branch 2"];

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
        `${what}only ${onHand} in stock at ${d.branch}, ${-d.delta} needed`,
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
