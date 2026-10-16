/**
 * How one vendor bill divides between the branches that received its stock. This is the single
 * rule the purchase form, the bill register, the payment dialogs, the vendor outstandings and the
 * analytics all share, so every screen shows the same figure down to the paisa. Pure (no database),
 * all amounts in paise.
 */
import { BRANCH_KEYS } from "@/lib/stock";

/** What one branch took on a bill: the value of its goods (before GST) and the units. */
export interface BranchAgg { goods: number; qty: number }

/** Known branches in their fixed order, then any unknown ones alphabetically — so rounding always lands on the same branch. */
export function orderedBranches(keys: Iterable<string>): string[] {
  const set = new Set(keys);
  const known = BRANCH_KEYS.filter((b) => set.has(b));
  const rest = [...set].filter((b) => !(BRANCH_KEYS as readonly string[]).includes(b)).sort();
  return [...known, ...rest];
}

/**
 * Split `amount` (a bill's total, or the part of it paid up front) between the branches, in
 * proportion to the goods each took — or by units when the goods are free. A branch that took
 * nothing gets 0; the leftover paise land on the last branch that took something, so the shares
 * always add up to `amount`.
 */
export function shareFromAggregates(amount: number, agg: Record<string, BranchAgg>): Record<string, number> {
  const branches = orderedBranches(Object.keys(agg));
  const useGoods = branches.some((b) => agg[b].goods > 0);
  const weight = (b: string) => (useGoods ? agg[b].goods : agg[b].qty);
  const used = branches.filter((b) => weight(b) > 0);
  const sum = used.reduce((n, b) => n + weight(b), 0);
  const out: Record<string, number> = Object.fromEntries(branches.map((b) => [b, 0]));
  let left = amount;
  used.forEach((b, i) => {
    const part = i === used.length - 1 ? left : Math.round((amount * weight(b)) / sum);
    out[b] = part;
    left -= part;
  });
  return out;
}

/** Aggregate raw lines into per-branch goods and units. */
export function aggregateLines(lines: { branch: string; quantity: number; unitCost: number }[]): Record<string, BranchAgg> {
  const out: Record<string, BranchAgg> = {};
  for (const l of lines) {
    const a = (out[l.branch] ??= { goods: 0, qty: 0 });
    a.goods += l.quantity * l.unitCost;
    a.qty += l.quantity;
  }
  return out;
}

/** One branch's line on a bill. Everything is paise except `qty`. */
export interface BranchBill {
  branch: string;
  /** Units this branch took. */
  qty: number;
  /** Value of its goods, before GST. */
  goods: number;
  /** Its part of the GST (its bill minus its goods). */
  gst: number;
  /** Its part of the bill (goods + GST) — what it has to pay in all. */
  bill: number;
  /** Paid when the purchase was saved. */
  paidAtPurchase: number;
  /** Paid since, against this bill. */
  paidLater: number;
  /** Paid in all. */
  paid: number;
  /** Still to pay (never below 0). */
  left: number;
  /** Paid above its part of the bill (0 normally). */
  over: number;
}

export interface BillFacts {
  total: number;
  amountPaid: number;
  paidAllocations?: Record<string, number> | null;
  openingBranch?: string | null;
}

/**
 * The per-branch breakdown of one bill: what each branch took, owes, has paid and still has to pay.
 * `agg` is what each branch took; `later` is what each branch has paid since, against this bill.
 * An opening-balance bill has no goods: it is wholly the opening branch's.
 */
export function branchBills(bill: BillFacts, agg: Record<string, BranchAgg>, later: Record<string, number>): BranchBill[] {
  const share: Record<string, number> = bill.openingBranch ? { [bill.openingBranch]: bill.total } : shareFromAggregates(bill.total, agg);
  const atPurchase: Record<string, number> = bill.paidAllocations
    ? { ...bill.paidAllocations }
    : bill.amountPaid > 0
      ? bill.openingBranch ? { [bill.openingBranch]: bill.amountPaid } : shareFromAggregates(bill.amountPaid, agg)
      : {};
  const branches = orderedBranches([...Object.keys(share), ...Object.keys(atPurchase), ...Object.keys(later), ...Object.keys(agg)]);
  return branches.map((branch) => {
    const goods = bill.openingBranch ? 0 : agg[branch]?.goods ?? 0;
    const billShare = share[branch] ?? 0;
    const paidAtPurchase = atPurchase[branch] ?? 0;
    const paidLater = later[branch] ?? 0;
    const paid = paidAtPurchase + paidLater;
    return {
      branch,
      qty: agg[branch]?.qty ?? 0,
      goods,
      gst: bill.openingBranch ? 0 : Math.max(0, billShare - goods),
      bill: billShare,
      paidAtPurchase,
      paidLater,
      paid,
      left: Math.max(0, billShare - paid),
      over: Math.max(0, paid - billShare),
    };
  });
}

export type BillStatus = "paid" | "part" | "unpaid";

/** Whole-bill status from what has been paid in all. */
export function billStatus(total: number, paid: number): BillStatus {
  if (total <= 0 || paid >= total) return "paid";
  return paid > 0 ? "part" : "unpaid";
}
