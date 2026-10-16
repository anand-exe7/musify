/**
 * Typing how many units each branch gets on a purchase line. The branch boxes are the truth: nothing here
 * ever changes a box the person didn't type in. If they also type the vendor bill's total quantity, the
 * boxes are only compared with it, and the difference is reported (never silently "fixed").
 */
import { BRANCH_KEYS } from "@/lib/stock";

export type Alloc = Record<string, number>;

export const zeroAlloc = (): Alloc => Object.fromEntries(BRANCH_KEYS.map((b) => [b, 0]));

/** Units placed across all branches. */
export const allocTotal = (a: Alloc): number => BRANCH_KEYS.reduce((n, b) => n + Math.max(0, a[b] || 0), 0);

export interface SplitStatus {
  /** Units placed in the branch boxes. */
  sum: number;
  /** The total on the vendor's bill, if the person typed one. */
  target: number | null;
  /** empty: nothing placed · ok · under: fewer placed than the bill says · over: more. */
  state: "empty" | "ok" | "under" | "over";
  /** How far off (always ≥ 0). */
  diff: number;
}

export function splitStatus(alloc: Alloc, target: number | null): SplitStatus {
  const sum = allocTotal(alloc);
  if (target === null || target <= 0) return { sum, target: null, state: sum > 0 ? "ok" : "empty", diff: 0 };
  if (sum === target) return { sum, target, state: "ok", diff: 0 };
  return sum < target ? { sum, target, state: "under", diff: target - sum } : { sum, target, state: "over", diff: sum - target };
}

/**
 * The person typed a total. If all the stock sits in one branch (or nowhere yet), that branch simply takes the
 * total — the common case. Once it is split across branches, nothing is moved: the mismatch is flagged instead.
 */
export function followTotal(alloc: Alloc, total: number, fallbackBranch: string): Alloc {
  const holders = BRANCH_KEYS.filter((b) => (alloc[b] || 0) > 0);
  if (holders.length > 1) return alloc;
  return { ...zeroAlloc(), [holders[0] ?? fallbackBranch]: total };
}

/** Everything to one branch. */
export const moveAll = (total: number, branch: string): Alloc => ({ ...zeroAlloc(), [branch]: total });

/** As even as possible; the odd units go to the first branches. */
export function splitEvenly(total: number): Alloc {
  const n = BRANCH_KEYS.length;
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Object.fromEntries(BRANCH_KEYS.map((b, i) => [b, base + (i < extra ? 1 : 0)]));
}

/** Add the missing units to one branch. */
export const putRest = (alloc: Alloc, branch: string, diff: number): Alloc => ({ ...alloc, [branch]: (alloc[branch] || 0) + diff });

/** Take the surplus out of one branch (never below 0). */
export const takeFrom = (alloc: Alloc, branch: string, diff: number): Alloc => ({ ...alloc, [branch]: Math.max(0, (alloc[branch] || 0) - diff) });
