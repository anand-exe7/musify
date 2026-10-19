/**
 * Two more views of the same bill figures: one row per vendor (the "By vendor" tab) and the purchase analytics.
 * Both read the per-branch numbers from `purchaseBills`, so every screen agrees down to the paisa.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases, vendorPayments, vendors } from "@/lib/db/schema";
import type { Branch } from "@/lib/stock";
import { orderedBranches } from "@/lib/billShares";
import { dayExpr, loadBills, MAX_BILL_PAGE, viewBranches, whereFor } from "./purchaseBills";
import { vendorOutstandings } from "./purchases";

/* ───────────────────────────  By vendor  ─────────────────────────── */

export interface VendorBranchMoney { branch: string; bought: number; paid: number; left: number }

export interface VendorRollupRow {
  vendorId: string;
  vendorName: string;
  bills: number;
  lastDate: string;
  bought: number;
  paid: number;
  /** Net (bought minus paid). Below 0 means the vendor holds a credit. */
  left: number;
  branches: VendorBranchMoney[];
  /** Payments made to this vendor that name no bill (an admin can apply them to bills). */
  unapplied: { count: number; amount: number };
}

export interface VendorRollupPage {
  rows: VendorRollupRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  summary: { vendors: number; bought: number; paid: number; left: number; branches: Record<string, VendorBranchMoney> };
}

export interface VendorFilter { q?: string; branch?: string; openOnly?: boolean; page?: number; pageSize?: number }

/**
 * One row per vendor: what was bought, paid and is still owed, branch by branch. The money comes from the same
 * vendor outstandings the old page used, so it agrees with every other screen, including payments that name no bill.
 */
export async function getVendorRollup(f: VendorFilter, scope: Branch[] | null): Promise<VendorRollupPage> {
  const view = viewBranches({ branch: f.branch }, scope);
  const pageSize = Math.min(MAX_BILL_PAGE, Math.max(1, Math.floor(Number(f.pageSize)) || 10));
  const [out, vendorRows, billStats, loose] = await Promise.all([
    vendorOutstandings(),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors),
    db
      .select({ vendorId: purchases.vendorId, n: sql<number>`count(*)::int`, last: sql<string>`max(${dayExpr})` })
      .from(purchases)
      .where(whereFor({}, view))
      .groupBy(purchases.vendorId),
    db
      .select({ vendorId: vendorPayments.vendorId, n: sql<number>`count(*)::int`, amount: sql<number>`COALESCE(SUM(${vendorPayments.amount}), 0)` })
      .from(vendorPayments)
      .where(and(sql`${vendorPayments.purchaseId} is null`, view ? (view.length ? inArray(vendorPayments.branch, view) : sql`false`) : undefined))
      .groupBy(vendorPayments.vendorId),
  ]);
  const name = new Map(vendorRows.map((v) => [v.id, v.name]));
  const stats = new Map(billStats.map((b) => [b.vendorId, b]));
  const looseBy = new Map(loose.map((l) => [l.vendorId, l]));

  const byVendor = new Map<string, VendorRollupRow>();
  for (const o of out) {
    if (view && !view.includes(o.branch)) continue;
    const row = byVendor.get(o.vendorId) ?? {
      vendorId: o.vendorId,
      vendorName: name.get(o.vendorId) ?? o.vendorId,
      bills: Number(stats.get(o.vendorId)?.n ?? 0),
      lastDate: stats.get(o.vendorId)?.last ?? "",
      bought: 0, paid: 0, left: 0, branches: [],
      unapplied: { count: Number(looseBy.get(o.vendorId)?.n ?? 0), amount: Number(looseBy.get(o.vendorId)?.amount ?? 0) },
    };
    row.bought += o.purchased; row.paid += o.paid; row.left += o.outstanding;
    row.branches.push({ branch: o.branch, bought: o.purchased, paid: o.paid, left: o.outstanding });
    byVendor.set(o.vendorId, row);
  }
  const term = (f.q ?? "").trim().toLowerCase();
  let rows = [...byVendor.values()].filter((r) => !term || r.vendorName.toLowerCase().includes(term));
  if (f.openOnly) rows = rows.filter((r) => r.left !== 0 || r.branches.some((b) => b.left !== 0));
  const order = (b: string) => orderedBranches(["Branch 1", "Branch 2", "Branch 3", b]).indexOf(b);
  for (const r of rows) r.branches.sort((a, b) => order(a.branch) - order(b.branch));
  rows.sort((a, b) => b.left - a.left || a.vendorName.localeCompare(b.vendorName));

  const summary: VendorRollupPage["summary"] = { vendors: rows.length, bought: 0, paid: 0, left: 0, branches: {} };
  for (const r of rows) {
    summary.bought += r.bought; summary.paid += r.paid; summary.left += r.left;
    for (const b of r.branches) {
      const t = (summary.branches[b.branch] ??= { branch: b.branch, bought: 0, paid: 0, left: 0 });
      t.bought += b.bought; t.paid += b.paid; t.left += b.left;
    }
  }
  summary.branches = Object.fromEntries(orderedBranches(Object.keys(summary.branches)).map((b) => [b, summary.branches[b]]));

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(Number(f.page)) || 1), pages);
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pages, pageSize, summary };
}

/* ───────────────────────────  Analytics  ─────────────────────────── */

export interface AnalyticsBranch { bills: number; qty: number; goods: number; gst: number; bought: number; opening: number; paid: number; left: number }
export interface AnalyticsVendor {
  vendorId: string; vendorName: string; bills: number; bought: number; opening: number; paid: number; left: number; last: string;
  branches: Record<string, { bought: number; paid: number; left: number }>;
}
export interface PurchaseAnalytics {
  totals: { bills: number; qty: number; goods: number; gst: number; bought: number; opening: number; paid: number; left: number };
  branches: Record<string, AnalyticsBranch>;
  vendors: AnalyticsVendor[];
  /** Real purchases per month (opening balances are not purchases), with each branch's part. */
  months: { month: string; total: number; branches: Record<string, number> }[];
  /** Payments that name no bill (not date-filtered). */
  unapplied: { count: number; amount: number };
}

export interface AnalyticsFilter { from?: string; to?: string; branch?: string; vendorId?: string }

/**
 * Purchase analytics from the same per-branch bill figures as the register, so "what did Porur buy and pay?"
 * is answered the same way everywhere. The branch filter applies to every number, not just one table.
 * Opening balances are shown separately: they are old debts, not purchases of the period.
 */
export async function getPurchaseAnalytics(f: AnalyticsFilter, scope: Branch[] | null): Promise<PurchaseAnalytics> {
  const view = viewBranches({ branch: f.branch }, scope);
  const rows = await loadBills({ from: f.from, to: f.to, branch: f.branch, vendorId: f.vendorId }, scope);

  const totals = { bills: 0, qty: 0, goods: 0, gst: 0, bought: 0, opening: 0, paid: 0, left: 0 };
  const branches: Record<string, AnalyticsBranch> = {};
  const vendorMap = new Map<string, AnalyticsVendor>();
  const monthMap = new Map<string, { month: string; total: number; branches: Record<string, number> }>();

  for (const r of rows) {
    const isOpening = !!r.openingBranch;
    const v = vendorMap.get(r.vendorId) ?? { vendorId: r.vendorId, vendorName: r.vendorName, bills: 0, bought: 0, opening: 0, paid: 0, left: 0, last: "", branches: {} };
    if (!isOpening) { v.bills += 1; totals.bills += 1; if (r.date > v.last) v.last = r.date; }
    for (const b of r.branches) {
      const t = (branches[b.branch] ??= { bills: 0, qty: 0, goods: 0, gst: 0, bought: 0, opening: 0, paid: 0, left: 0 });
      const vb = (v.branches[b.branch] ??= { bought: 0, paid: 0, left: 0 });
      const net = b.left - b.over;
      if (isOpening) {
        t.opening += b.bill; v.opening += b.bill; totals.opening += b.bill;
      } else {
        t.bills += 1; t.qty += b.qty; t.goods += b.goods; t.gst += b.gst; t.bought += b.bill;
        v.bought += b.bill; vb.bought += b.bill;
        totals.qty += b.qty; totals.goods += b.goods; totals.gst += b.gst; totals.bought += b.bill;
        const m = r.date.slice(0, 7);
        const mm = monthMap.get(m) ?? { month: m, total: 0, branches: {} };
        mm.total += b.bill;
        mm.branches[b.branch] = (mm.branches[b.branch] ?? 0) + b.bill;
        monthMap.set(m, mm);
      }
      t.paid += b.paid; t.left += net;
      v.paid += b.paid; v.left += net; vb.paid += b.paid; vb.left += net;
      totals.paid += b.paid; totals.left += net;
    }
    vendorMap.set(r.vendorId, v);
  }

  const [looseRow] = await db
    .select({ n: sql<number>`count(*)::int`, amount: sql<number>`COALESCE(SUM(${vendorPayments.amount}), 0)` })
    .from(vendorPayments)
    .where(and(
      sql`${vendorPayments.purchaseId} is null`,
      f.vendorId ? eq(vendorPayments.vendorId, f.vendorId) : undefined,
      view ? (view.length ? inArray(vendorPayments.branch, view) : sql`false`) : undefined,
    ));

  return {
    totals,
    branches: Object.fromEntries(orderedBranches(Object.keys(branches)).map((b) => [b, branches[b]])),
    vendors: [...vendorMap.values()].sort((a, b) => b.bought - a.bought || a.vendorName.localeCompare(b.vendorName)),
    months: [...monthMap.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
    unapplied: { count: Number(looseRow?.n ?? 0), amount: Number(looseRow?.amount ?? 0) },
  };
}
