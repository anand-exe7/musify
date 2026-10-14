/**
 * "Pay the vendor" in one go: one amount is spread over the vendor's unpaid bills,
 * oldest first, and each bill's part is charged to the branches that received its
 * stock (in proportion to the goods each took) — or all to one chosen branch.
 * Pure, so the screen and the tests share it (all amounts in paise).
 */
export interface PlanBill {
  id: string;
  /** What is still owed on the bill. */
  balance: number;
  /** Goods value per branch on the bill (the branches that can pay it). */
  weights: Record<string, number>;
}

export interface PlanRow { purchaseId: string; branch: string; amount: number }

export interface Plan {
  rows: PlanRow[];
  /** Per bill: how much of the payment it takes. */
  perBill: Record<string, number>;
  /** Part of the amount that no bill could take. */
  leftover: number;
  /** Bills skipped because the chosen branch didn't receive their stock. */
  skipped: string[];
}

/**
 * Split `amount` by `weights`. The last branch with a weight takes the rounding
 * remainder (a branch at 0 never gets any); equal shares if every weight is 0.
 */
export function splitByWeights(amount: number, weights: Record<string, number>): Record<string, number> {
  const branches = Object.keys(weights);
  if (branches.length === 0 || amount <= 0) return {};
  const total = branches.reduce((n, b) => n + Math.max(0, weights[b]), 0);
  const w = total > 0 ? weights : Object.fromEntries(branches.map((b) => [b, 1]));
  const sum = total > 0 ? total : branches.length;
  const active = branches.filter((b) => w[b] > 0);
  const out: Record<string, number> = {};
  let left = amount;
  for (const b of branches) out[b] = 0;
  active.forEach((b, i) => {
    const share = i === active.length - 1 ? left : Math.round((amount * w[b]) / sum);
    out[b] = share;
    left -= share;
  });
  return out;
}

/**
 * `bills` must already be oldest first. `paidBy` is `"each"` (every receiving branch
 * pays its own share) or a branch key (that branch pays, for the bills it received).
 */
export function planVendorPayment(bills: PlanBill[], amount: number, paidBy: string): Plan {
  const rows: PlanRow[] = [];
  const perBill: Record<string, number> = {};
  const skipped: string[] = [];
  let left = Math.max(0, amount);
  for (const b of bills) {
    if (b.balance <= 0) continue;
    if (paidBy !== "each" && !(paidBy in b.weights)) { skipped.push(b.id); continue; }
    if (left <= 0) continue;
    const take = Math.min(left, b.balance);
    const shares = paidBy === "each" ? splitByWeights(take, b.weights) : { [paidBy]: take };
    for (const [branch, amt] of Object.entries(shares)) if (amt > 0) rows.push({ purchaseId: b.id, branch, amount: amt });
    perBill[b.id] = take;
    left -= take;
  }
  return { rows, perBill, leftover: left, skipped };
}
