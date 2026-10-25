/**
 * Branch staff sell from the catalogue only: every line must be a real product + variant, and its name, price,
 * GST, HSN and MRP are read from the catalogue here, whatever the browser sent. Only quantity, discount and
 * notes stay theirs. A full admin (`access === "all"`) is not touched.
 */
import { HttpError } from "@/lib/api/errors";
import type { AdminAccess } from "@/lib/auth/session";
import { selectProduct } from "@/lib/db/queries/variants";
import { variantKey } from "@/lib/catalog/variants";
import type { ProductRow } from "@/lib/db/schema";
import { lineTax, allocateDiscount } from "@/lib/gst/inclusive";
import type { Bill, BillItem } from "@/lib/store/pos";
import type { QuotationLine } from "@/types";
import type { ServicePart } from "@/lib/billing/serviceInvoice";

type Variants = NonNullable<ProductRow["variants"]>;

const bad = (m: string) => new HttpError(403, m);
export const isFullAdmin = (access: AdminAccess) => access === "all";

/** What the counter names the line: the product, plus "— variant" when it has more than one on offer. */
function lineName(p: ProductRow, v: Variants[number]): string {
  const live = (p.variants ?? []).filter((x) => !x.disabled).length;
  return live > 1 ? `${p.name} — ${v.attr}${v.finish ? ` · ${v.finish}` : ""}` : p.name;
}
const unitPrice = (p: ProductRow, v: Variants[number]) => (v.price > 0 ? v.price : p.price);

async function product(productId: unknown, label: string): Promise<ProductRow> {
  if (typeof productId !== "string" || !productId) throw bad(`"${label || "An item"}" isn't from the catalogue. Pick the product from the catalogue.`);
  const p = await selectProduct(productId);
  if (!p) throw bad(`"${label}" is no longer in the catalogue. Pick it again.`);
  return p;
}

/** Bill lines (billing counter). */
export async function lockBillItems(items: BillItem[], access: AdminAccess): Promise<BillItem[]> {
  if (isFullAdmin(access)) return items;
  const out: BillItem[] = [];
  for (const it of items) {
    const p = await product(it?.productId, it?.name);
    const vi = Number.isInteger(it.variantIndex) ? (it.variantIndex as number) : 0;
    const v = (p.variants ?? [])[vi];
    if (!v) throw bad(`"${it.name}": that variant isn't in the catalogue. Pick it again.`);
    const price = unitPrice(p, v);
    out.push({ ...it, name: lineName(p, v), price, gstRate: p.gstRate ?? null, hsn: p.hsn || undefined, mrp: Math.max(p.mrp || 0, price), productId: p.id, variantIndex: vi });
  }
  return out;
}

/**
 * A bill raised by branch staff: lines locked to the catalogue, and the money restated from them. The browser's
 * subtotal, total and GST are not trusted, so a lowered figure can't ride in beside catalogue lines. The bill-level
 * discount (coupon + manual) and delivery stay what the staff member entered, as before.
 */
export async function lockBill(bill: Bill, access: AdminAccess): Promise<Bill> {
  if (isFullAdmin(access)) return bill;
  const items = await lockBillItems(bill.items ?? [], access);
  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  const itemDiscounts = items.reduce((n, i) => n + (i.discount || 0), 0);
  const discount = Math.max(bill.discount || 0, itemDiscounts); // total discount: lines + bill-level
  const billLevel = Math.min(Math.max(0, subtotal - itemDiscounts), discount - itemDiscounts);
  const nets = items.map((i) => Math.max(0, i.price * i.qty - (i.discount || 0)));
  const shares = allocateDiscount(nets, billLevel);
  let taxable = 0, tax = 0;
  items.forEach((it, i) => {
    const rate = Number(it.gstRate) || 0;
    if (rate <= 0) return;
    const t = lineTax(nets[i] - shares[i], rate);
    taxable += t.taxable;
    tax += t.tax;
  });
  const cgst = Math.round(tax / 2);
  const delivery = Math.max(0, bill.delivery || 0);
  return { ...bill, items, subtotal, discount, delivery, total: Math.max(0, subtotal - discount) + delivery, taxable, cgst, sgst: tax - cgst, gst: tax };
}

/** Quotation lines. */
export async function lockQuoteLines<T extends Partial<QuotationLine>>(lines: T[], access: AdminAccess): Promise<T[]> {
  if (isFullAdmin(access)) return lines;
  const out: T[] = [];
  for (const l of lines) {
    const p = await product(l?.productId, l?.name ?? "");
    const v = (p.variants ?? []).find((x) => variantKey(x) === l.variantKey);
    if (!v) throw bad(`"${l.name}": that variant isn't in the catalogue. Pick it again.`);
    const rate = unitPrice(p, v);
    out.push({ ...l, name: lineName(p, v), rate, mrp: Math.max(p.mrp || 0, rate), hsn: p.hsn ?? "", gst: p.isGstApplicable === false ? 0 : (p.gstRate ?? 18) });
  }
  return out;
}

/** Products used in a repair. Only parts picked from inventory are allowed; the price and GST come from it. */
export async function lockRepairParts(parts: ServicePart[], access: AdminAccess, existing: ServicePart[] = []): Promise<ServicePart[]> {
  if (isFullAdmin(access)) return parts;
  const out: ServicePart[] = [];
  for (const x of parts) {
    // A line already on the ticket stays as it is (an admin may have priced it); staff can only change its quantity.
    const had = existing.find((e) => e.id === x?.id);
    if (had && had.name === x.name && had.price === x.price && had.gst === x.gst && had.productId === x.productId && had.variantIndex === x.variantIndex) {
      out.push(x);
      continue;
    }
    const p = await product(x?.productId, x?.name);
    const vi = Number.isInteger(x.variantIndex) ? (x.variantIndex as number) : 0;
    const v = (p.variants ?? [])[vi];
    if (!v) throw bad(`"${x.name}": that variant isn't in the catalogue. Pick it again.`);
    out.push({ ...x, name: lineName(p, v), hsn: p.hsn || undefined, price: unitPrice(p, v), gst: p.gstRate ?? 0, productId: p.id, variantIndex: vi });
  }
  return out;
}
