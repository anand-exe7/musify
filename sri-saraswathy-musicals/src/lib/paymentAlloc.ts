/**
 * Splitting a payment across branches, the same way stock is split: the person
 * enters how much each receiving branch pays and the amounts must add up to the
 * payment. Pure, so the forms and the tests share it (all amounts in paise).
 */
export type PaymentAlloc = Record<string, number>;

export const sumAlloc = (a: PaymentAlloc): number => Object.values(a).reduce((n, v) => n + (v || 0), 0);

/**
 * Re-balance `alloc` so it adds up to `total`: every branch except `keep` stays as
 * entered (trimmed from the last one back if they now exceed the total), and
 * `keep` takes whatever is left.
 */
export function fitPaymentAlloc(alloc: PaymentAlloc, total: number, keep: string, branches: string[]): PaymentAlloc {
  const next: PaymentAlloc = {};
  for (const b of branches) next[b] = Math.max(0, alloc[b] || 0);
  let others = branches.filter((b) => b !== keep).reduce((n, b) => n + next[b], 0);
  for (const b of [...branches].reverse()) {
    if (others <= total) break;
    if (b === keep) continue;
    const cut = Math.min(next[b], others - total);
    next[b] -= cut;
    others -= cut;
  }
  next[keep] = Math.max(0, total - others);
  return next;
}

/** The non-zero shares as a list, for sending to the server. */
export function allocList(a: PaymentAlloc): { branch: string; amount: number }[] {
  return Object.entries(a).filter(([, v]) => v > 0).map(([branch, amount]) => ({ branch, amount }));
}

/**
 * `alloc` as it should read for a payment of `total` across `branches`: untouched
 * if it already adds up, otherwise re-fitted (the first branch holding money takes
 * the difference). With a single branch it is simply the whole amount.
 */
export function normalizeAlloc(alloc: PaymentAlloc, total: number, branches: string[]): PaymentAlloc {
  if (branches.length === 0) return {};
  const mine: PaymentAlloc = {};
  for (const b of branches) mine[b] = Math.max(0, alloc[b] || 0);
  if (sumAlloc(mine) === total) return mine;
  const keep = branches.find((b) => mine[b] > 0) ?? branches[0];
  return fitPaymentAlloc(mine, total, keep, branches);
}
