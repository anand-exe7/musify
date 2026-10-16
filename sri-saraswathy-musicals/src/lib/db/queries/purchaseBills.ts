/**
 * The vendor-bill register: one page of bills at a time, each with what every branch took, has to pay,
 * has paid and still owes. Built from light per-bill totals (no items, no photos) so it stays quick as the
 * bills pile up; a bill's items are fetched only when it is opened (see `getBillDetail`).
 *
 * Every figure comes from `billShares`, the same rule the payment dialogs, outstandings and checks use.
 */
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchases, stockInward, vendorPayments, vendors } from "@/lib/db/schema";
import type { Branch } from "@/lib/stock";
import { branchBills, billStatus, orderedBranches, type BillStatus, type BranchAgg, type BranchBill } from "@/lib/billShares";
import { getPurchases } from "./purchases";

export interface BillFilter {
  vendorId?: string;
  /** Only this branch's part of each bill (and only bills it is in). */
  branch?: string;
  /** "open" = unpaid or part-paid. */
  status?: "all" | "open" | "unpaid" | "part" | "paid";
  from?: string;
  to?: string;
  q?: string;
  sort?: "newest" | "oldest" | "balance" | "amount";
  page?: number;
  pageSize?: number;
}

export interface BillRow {
  id: string;
  vendorId: string;
  vendorName: string;
  invoiceNo: string;
  /** yyyy-mm-dd the bill counts for. */
  date: string;
  createdAt: string;
  openingBranch: string | null;
  /** The first few things bought, e.g. "Mridangam Wood ×11". */
  items: string[];
  itemCount: number;
  totalQty: number;
  /** Money below is the whole bill, or only the viewed branches' part when a branch filter / scope applies. */
  total: number;
  paid: number;
  left: number;
  status: BillStatus;
  branches: BranchBill[];
  /** Some branch paid more than its part. */
  overpaid: boolean;
}

export interface BillsSummary {
  bills: number;
  bought: number;
  paid: number;
  left: number;
  /** `left` is net (bought − paid): below 0 means the branch paid for another branch's goods. */
  branches: Record<string, { qty: number; bought: number; paid: number; left: number }>;
}

export interface BillsPage {
  rows: BillRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  summary: BillsSummary;
}

export const MAX_BILL_PAGE = 1000;

export const dayExpr = sql`coalesce(nullif(${purchases.purchaseDate}, ''), substr(${purchases.createdAt}, 1, 10))`;
const inList = (xs: string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

/** The branches whose part of each bill is shown: the user's own, narrowed by the branch filter. `null` = the whole bill. */
export function viewBranches(f: BillFilter, scope: Branch[] | null): string[] | null {
  const picked = f.branch && f.branch !== "all" ? f.branch : null;
  if (scope) return picked ? (scope.includes(picked as Branch) ? [picked] : []) : [...scope];
  return picked ? [picked] : null;
}

export function whereFor(f: BillFilter, view: string[] | null): SQL | undefined {
  const c: SQL[] = [];
  if (f.vendorId) c.push(eq(purchases.vendorId, f.vendorId));
  if (f.from) c.push(sql`${dayExpr} >= ${f.from}`);
  if (f.to) c.push(sql`${dayExpr} <= ${f.to}`);
  if (view) {
    if (view.length === 0) c.push(sql`false`);
    else c.push(sql`(${purchases.openingBranch} in (${inList(view)}) or exists (select 1 from ${stockInward} si where si.purchase_id = ${purchases.id} and si.branch in (${inList(view)})))`);
  }
  const term = (f.q ?? "").trim().slice(0, 80);
  if (term) {
    const like = likeOf(term);
    c.push(sql`(${purchases.invoiceNo} ilike ${like} or ${purchases.id} ilike ${like}
      or ${purchases.vendorId} in (select v.id from ${vendors} v where v.name ilike ${like})
      or exists (select 1 from ${stockInward} sq where sq.purchase_id = ${purchases.id} and sq.product_name ilike ${like}))`);
  }
  return c.length ? and(...c) : undefined;
}

/** Every bill matching the filter, with each branch's figures (no items yet, not sorted or paged). */
export async function loadBills(f: BillFilter, scope: Branch[] | null): Promise<BillRow[]> {
  const view = viewBranches(f, scope);

  const [heads, vendorRows] = await Promise.all([
    db.select().from(purchases).where(whereFor(f, view)),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors),
  ]);
  const vendorName = new Map(vendorRows.map((v) => [v.id, v.name]));
  const ids = heads.map((h) => h.id);

  const [lineAgg, payAgg] = ids.length
    ? await Promise.all([
        db
          .select({
            purchaseId: stockInward.purchaseId,
            branch: stockInward.branch,
            goods: sql<number>`COALESCE(SUM(${stockInward.quantity} * ${stockInward.unitCost}), 0)`,
            qty: sql<number>`COALESCE(SUM(${stockInward.quantity}), 0)`,
          })
          .from(stockInward)
          .where(inArray(stockInward.purchaseId, ids))
          .groupBy(stockInward.purchaseId, stockInward.branch),
        db
          .select({ purchaseId: vendorPayments.purchaseId, branch: vendorPayments.branch, sum: sql<number>`COALESCE(SUM(${vendorPayments.amount}), 0)` })
          .from(vendorPayments)
          .where(inArray(vendorPayments.purchaseId, ids))
          .groupBy(vendorPayments.purchaseId, vendorPayments.branch),
      ])
    : [[], []];

  const aggBy = new Map<string, Record<string, BranchAgg>>();
  for (const r of lineAgg) {
    const m = aggBy.get(r.purchaseId as string) ?? {};
    m[r.branch] = { goods: Number(r.goods), qty: Number(r.qty) };
    aggBy.set(r.purchaseId as string, m);
  }
  const laterBy = new Map<string, Record<string, number>>();
  for (const r of payAgg) {
    const m = laterBy.get(r.purchaseId as string) ?? {};
    m[r.branch] = Number(r.sum);
    laterBy.set(r.purchaseId as string, m);
  }

  let rows: BillRow[] = heads.map((h) => {
    const agg = aggBy.get(h.id) ?? {};
    const later = laterBy.get(h.id) ?? {};
    const all = branchBills({ total: h.totalAmount, amountPaid: h.amountPaid, paidAllocations: h.paidAllocations, openingBranch: h.openingBranch }, agg, later);
    const shown = (view ? all.filter((b) => view.includes(b.branch)) : all).filter((b) => b.bill > 0 || b.paid > 0 || b.qty > 0);
    const total = view ? shown.reduce((n, b) => n + b.bill, 0) : h.totalAmount;
    const paid = view ? shown.reduce((n, b) => n + b.paid, 0) : h.amountPaid + Object.values(later).reduce((n, v) => n + v, 0);
    const left = view ? shown.reduce((n, b) => n + b.left, 0) : Math.max(0, total - paid);
    return {
      id: h.id,
      vendorId: h.vendorId,
      vendorName: vendorName.get(h.vendorId) ?? h.vendorId,
      invoiceNo: h.invoiceNo,
      date: h.purchaseDate || h.createdAt.slice(0, 10),
      createdAt: h.createdAt,
      openingBranch: h.openingBranch ?? null,
      items: [],
      itemCount: 0,
      totalQty: shown.reduce((n, b) => n + b.qty, 0),
      total, paid, left,
      status: billStatus(total, paid),
      branches: shown,
      overpaid: shown.some((b) => b.over > 0),
    };
  });

  if (f.status && f.status !== "all") rows = rows.filter((r) => (f.status === "open" ? r.status !== "paid" : r.status === f.status));
  return rows;
}

export async function getBillsPage(f: BillFilter, scope: Branch[] | null): Promise<BillsPage> {
  const pageSize = Math.min(MAX_BILL_PAGE, Math.max(1, Math.floor(Number(f.pageSize)) || 25));
  const rows = await loadBills(f, scope);

  const byDateDesc = (a: BillRow, b: BillRow) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1);
  rows.sort(
    f.sort === "oldest" ? (a, b) => -byDateDesc(a, b)
    : f.sort === "balance" ? (a, b) => b.left - a.left || byDateDesc(a, b)
    : f.sort === "amount" ? (a, b) => b.total - a.total || byDateDesc(a, b)
    : byDateDesc,
  );

  const summary: BillsSummary = { bills: rows.length, bought: 0, paid: 0, left: 0, branches: {} };
  for (const r of rows) {
    summary.bought += r.total;
    summary.paid += r.paid;
    summary.left += r.left;
    for (const b of r.branches) {
      const t = (summary.branches[b.branch] ??= { qty: 0, bought: 0, paid: 0, left: 0 });
      t.qty += b.qty; t.bought += b.bill; t.paid += b.paid; t.left += b.left - b.over; // net, so the branches add up to the whole
    }
  }
  // Keep the branch cards in the shop's fixed order.
  summary.branches = Object.fromEntries(orderedBranches(Object.keys(summary.branches)).map((b) => [b, summary.branches[b]]));

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(Number(f.page)) || 1), pages);
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  // What was bought — only for the bills on this page.
  if (pageRows.length > 0) {
    const pageIds = pageRows.map((r) => r.id);
    const items = await db
      .select({
        purchaseId: stockInward.purchaseId,
        name: stockInward.productName,
        variant: stockInward.variant,
        qty: sql<number>`COALESCE(SUM(${stockInward.quantity}), 0)`,
      })
      .from(stockInward)
      .where(inArray(stockInward.purchaseId, pageIds))
      .groupBy(stockInward.purchaseId, stockInward.productName, stockInward.variant)
      .orderBy(stockInward.productName);
    const byBill = new Map<string, { label: string; qty: number }[]>();
    for (const i of items) {
      const arr = byBill.get(i.purchaseId as string) ?? [];
      arr.push({ label: i.name + (i.variant ? ` (${i.variant})` : ""), qty: Number(i.qty) });
      byBill.set(i.purchaseId as string, arr);
    }
    for (const r of pageRows) {
      const list = byBill.get(r.id) ?? [];
      r.itemCount = list.length;
      r.items = list.slice(0, 3).map((x) => `${x.label} ×${x.qty}`);
    }
  }

  return { rows: pageRows, total: rows.length, page, pages, pageSize, summary };
}

export interface BillPayment {
  id: string;
  branch: string;
  amount: number;
  mode: string;
  reference: string;
  paidAt: string;
  notes: string;
}

/** One bill in full: everything the dialogs need, what each branch has to pay, and its payment history. */
export async function getBillDetail(id: string, scope: Branch[] | null) {
  const [p] = await getPurchases({ ids: [id] });
  if (!p) return undefined;
  const agg: Record<string, BranchAgg> = {};
  for (const l of p.lines) {
    const a = (agg[l.branch] ??= { goods: 0, qty: 0 });
    a.goods += l.quantity * l.unitCost;
    a.qty += l.quantity;
  }
  const all = branchBills({ total: p.totalAmount, amountPaid: p.amountPaid, paidAllocations: p.paidAllocations, openingBranch: p.openingBranch }, agg, p.paidLater);
  const branches = (scope ? all.filter((b) => scope.includes(b.branch as Branch)) : all).filter((b) => b.bill > 0 || b.paid > 0 || b.qty > 0);
  const payRows = await db.select().from(vendorPayments).where(eq(vendorPayments.purchaseId, id)).orderBy(vendorPayments.paidAt);
  const payments: BillPayment[] = payRows
    .filter((r) => !scope || scope.includes(r.branch as Branch))
    .map((r) => ({ id: r.id, branch: r.branch, amount: r.amount, mode: r.mode, reference: r.reference, paidAt: r.paidAt, notes: r.notes }));
  return { purchase: p, branches, payments };
}
