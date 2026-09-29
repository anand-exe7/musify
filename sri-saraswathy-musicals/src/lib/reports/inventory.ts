/**
 * Pure CSV row builders for the inventory reports: stock snapshot, per-item
 * purchase & sales ledger, and category-wise purchase/sales totals. Money is
 * paise in, rupees out (2 decimals).
 */
import { productStock, stockState, variantStock, variantStockAt, inPeriod, type Bill, type InvProduct } from "@/lib/store/pos";
import { rupees } from "@/lib/csv";

type Cell = string | number;
export interface DateRange { from?: string; to?: string }

export interface PurchaseRecord {
  id: string;
  vendorId: string;
  productId: string;
  productName: string;
  variant: string;
  quantity: number;
  unitCost: number; // paise
  branch: string;
  inwardAt: string;
}

const NO_CATEGORY = "Uncategorized";
const STATE_LABEL = { in: "In Stock", low: "Low Stock", out: "Out Of Stock" } as const;
const day = (iso: string) => (isNaN(+new Date(iso)) ? iso : new Date(iso).toISOString().slice(0, 10));
const inRange = (iso: string, r: DateRange) => inPeriod(iso, "custom", new Date(), r);
const variantLabel = (p: InvProduct, i?: number) => {
  const v = i === undefined ? undefined : p.variants[i];
  return v ? `${v.attr} · ${v.finish}` : "";
};

/** One row per variant with per-branch on-hand and stock value at cost. */
export function stockRows(products: InvProduct[]): Cell[][] {
  const head = ["Product", "Category", "Department", "Brand", "Variant", "Selling Price", "Cost", "Branch 1", "Branch 2", "Total", "Stock Value (Cost)", "Low Stock At", "Status", "Visible"];
  const body: Cell[][] = [];
  for (const p of products) {
    p.variants.forEach((v, i) => {
      if (v.disabled) return;
      const total = variantStock(v);
      body.push([
        p.name, p.category, p.department, p.brand ?? "", variantLabel(p, i), rupees(v.price || p.basePrice), rupees(p.cost ?? 0),
        variantStockAt(v, "Branch 1"), variantStockAt(v, "Branch 2"), total, rupees(total * (p.cost ?? 0)),
        p.lowStockAt, STATE_LABEL[total <= 0 ? "out" : total <= p.lowStockAt ? "low" : "in"], p.active ? "Yes" : "Hidden",
      ]);
    });
    if (p.variants.every((v) => v.disabled)) body.push([p.name, p.category, p.department, p.brand ?? "", "", rupees(p.basePrice), rupees(p.cost ?? 0), 0, 0, 0, "0.00", p.lowStockAt, STATE_LABEL[stockState(p)], p.active ? "Yes" : "Hidden"]);
  }
  return [head, ...body];
}

interface Movement {
  date: string;
  type: "Purchase" | "Sale";
  productId?: string;
  product: string;
  category: string;
  variant: string;
  qty: number;
  rate: number; // paise
  amount: number; // paise
  branch: string;
  ref: string;
  party: string;
}

/** Sale lines from completed product bills (service tickets excluded), matched
 *  to the catalog by productId, falling back to exact name (web orders). */
function saleMovements(products: InvProduct[], bills: Bill[], range: DateRange): Movement[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));
  const out: Movement[] = [];
  for (const b of bills) {
    if (b.status !== "completed" || b.source === "service" || !inRange(b.createdAt, range)) continue;
    for (const it of b.items) {
      const p = (it.productId && byId.get(it.productId)) || byName.get(it.name.trim().toLowerCase());
      out.push({
        date: day(b.createdAt), type: "Sale", productId: p?.id, product: p?.name ?? it.name, category: p?.category ?? NO_CATEGORY,
        variant: p ? variantLabel(p, it.variantIndex) : "", qty: it.qty, rate: it.price,
        amount: Math.max(0, it.price * it.qty - (it.discount || 0)), branch: b.branch, ref: b.id, party: b.customerName,
      });
    }
  }
  return out;
}

function purchaseMovements(products: InvProduct[], inwards: PurchaseRecord[], vendorName: (id: string) => string, range: DateRange): Movement[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return inwards.filter((r) => inRange(r.inwardAt, range)).map((r) => ({
    date: day(r.inwardAt), type: "Purchase", productId: r.productId, product: byId.get(r.productId)?.name ?? r.productName,
    category: byId.get(r.productId)?.category ?? NO_CATEGORY, variant: r.variant, qty: r.quantity, rate: r.unitCost,
    amount: r.quantity * r.unitCost, branch: r.branch, ref: r.id, party: vendorName(r.vendorId),
  }));
}

/** Purchase + sales ledger, one row per transaction, grouped by item then date.
 *  `productIds` limits it to those items (omit for the whole catalog). */
export function itemHistoryRows(
  products: InvProduct[], inwards: PurchaseRecord[], bills: Bill[], vendorName: (id: string) => string,
  range: DateRange, productIds?: Set<string>,
): Cell[][] {
  const moves = [...purchaseMovements(products, inwards, vendorName, range), ...saleMovements(products, bills, range)]
    .filter((m) => !productIds || (m.productId && productIds.has(m.productId)))
    .sort((a, b) => a.product.localeCompare(b.product) || a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  const head = ["Item", "Category", "Variant", "Date", "Type", "Qty", "Rate", "Amount", "Branch", "Reference", "Vendor / Customer"];
  return [head, ...moves.map((m) => [m.product, m.category, m.variant, m.date, m.type, m.qty, rupees(m.rate), rupees(m.amount), m.branch, m.ref, m.party])];
}

/** Purchase vs sales totals per category (all items, incl. unmatched sales). */
export function categoryHistoryRows(
  products: InvProduct[], inwards: PurchaseRecord[], bills: Bill[], vendorName: (id: string) => string, range: DateRange,
): Cell[][] {
  const acc = new Map<string, { pq: number; pc: number; sq: number; sr: number }>();
  for (const p of products) acc.set(p.category, { pq: 0, pc: 0, sq: 0, sr: 0 });
  for (const m of [...purchaseMovements(products, inwards, vendorName, range), ...saleMovements(products, bills, range)]) {
    const a = acc.get(m.category) ?? { pq: 0, pc: 0, sq: 0, sr: 0 };
    if (m.type === "Purchase") { a.pq += m.qty; a.pc += m.amount; } else { a.sq += m.qty; a.sr += m.amount; }
    acc.set(m.category, a);
  }
  const head = ["Category", "Units Purchased", "Purchase Cost", "Units Sold", "Sales Revenue", "Net Units (Purchased − Sold)"];
  const body = [...acc].sort(([a], [b]) => a.localeCompare(b)).map(([c, a]) => [c, a.pq, rupees(a.pc), a.sq, rupees(a.sr), a.pq - a.sq]);
  return [head, ...body];
}
