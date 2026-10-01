/**
 * Authoritative order pricing — computed on the server from database prices,
 * never trusted from the client. The cart, checkout, order-placement and the
 * Razorpay create/verify routes all call this one function, so the number a
 * customer sees is the number they are charged and the number that is stored.
 *
 * Tax model: prices are GST-INCLUSIVE (same as the POS and Indian MRP
 * convention). A coupon is taken off the gross first, then the tax contained in
 * what is actually paid is extracted line by line. Shipping is a separate,
 * untaxed add-on. Money is paise.
 */
import { getPricingCatalog, type PricingProduct } from "@/lib/db/queries/products";
import { getZones, getGstSettings } from "@/lib/db/queries/settings";
import { getCoupon } from "@/lib/db/queries/pos";
import { HttpError } from "@/lib/api/errors";
import type { Zone } from "@/lib/store/settings";
import { variantKey as keyOf, variantLabel } from "@/lib/catalog/variants";
import { evaluateCoupon } from "@/lib/checkout/coupon";
import { taxLines } from "@/lib/gst/inclusive";
import { isIntraSupply } from "@/lib/gst/place-of-supply";
import { variantStockAt, isBranch, type Branch } from "@/lib/stock";

export type DeliveryMethod = "standard" | "white-glove" | "express";
export const DELIVERY_METHODS: readonly DeliveryMethod[] = ["standard", "white-glove", "express"];

export interface CartLineInput {
  productId: string;
  variantKey?: string;
  quantity: number;
}

export interface PricedLine {
  productId: string;
  variantKey: string;
  variantLabel: string;
  quantity: number;
  /** Unit price, GST-inclusive. */
  price: number;
  /** GST rate (%) snapshotted for this line; 0 for an exempt product. */
  gstRate: number;
  /** price × quantity, before any coupon. */
  lineTotal: number;
}

/** Something that stops this cart from being ordered as-is. The cart shows it;
 *  `/api/checkout/create` refuses to proceed while any remain. */
export interface PricingIssue {
  kind: "coupon" | "stock" | "variant";
  message: string;
}

export interface PricedOrder {
  items: PricedLine[];
  /** Sum of line totals (GST-inclusive), before the coupon. */
  subtotal: number;
  /** Coupon discount, paise. */
  discount: number;
  couponCode: string | null;
  /** Taxable value (ex-GST) of what is paid for the goods, after the coupon. */
  taxable: number;
  /** GST contained in the goods total. cgst+sgst (same state) or igst. */
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** True for a same-state supply (CGST+SGST), false for IGST. */
  intra: boolean;
  shipping: number;
  /** Shipping for each delivery method, so the UI never has to compute it. */
  shippingOptions: Record<DeliveryMethod, number>;
  /** subtotal − discount + shipping. */
  total: number;
  issues: PricingIssue[];
}

/** Pick the zone whose `states` includes the buyer's state; else the fallback
 *  zone (empty `states`); else the first zone; else undefined. */
function pickZone(zones: Zone[], shipState: string): Zone | undefined {
  const s = shipState.trim().toLowerCase();
  if (s) {
    const hit = zones.find((z) => z.states.some((x) => x.trim().toLowerCase() === s));
    if (hit) return hit;
  }
  return zones.find((z) => z.states.length === 0) ?? zones[0];
}

/**
 * Standard shipping = zone's ≤ 500 g slab (the base courier rate). White-glove
 * and express are shop-level services, not on the courier tariff — priced flat.
 * There is no free-shipping threshold. Cart weight is not tracked yet, so a
 * heavier parcel is still billed at the base slab; when product weight lands,
 * walk the ladder (uptoGm250 → uptoGm500 → perAddl500 → above5kgPerKg → above10kgPerKg).
 */
function shippingFor(method: DeliveryMethod, zone: Zone | undefined): number {
  if (method === "express") return 50000; // ₹500 flat, in paise
  if (method === "white-glove") return 0;
  if (!zone) return 0;
  return zone.uptoGm500 || zone.uptoGm250 || zone.charge;
}

function lineLabel(p: PricingProduct): string {
  return `${p.brand} ${p.name}`.trim();
}

/**
 * Price a cart. Throws a 400 for an empty cart, an unknown product or a bad
 * delivery method; everything fixable by the shopper (stale variant, short
 * stock, a coupon that doesn't apply) comes back in `issues` instead, so the
 * cart can still show a total and explain what to change.
 */
export async function priceOrder(
  rawItems: CartLineInput[],
  delivery: DeliveryMethod,
  shipState = "",
  opts: { couponCode?: string | null; branch?: Branch } = {},
): Promise<PricedOrder> {
  if (!DELIVERY_METHODS.includes(delivery)) throw new HttpError(400, "Unknown delivery method");
  const branch: Branch = isBranch(opts.branch) ? opts.branch : "Branch 1";

  const wanted = (rawItems || []).filter((i) => i && i.productId && Number(i.quantity) > 0);
  if (wanted.length === 0) throw new HttpError(400, "Cart is empty");

  const [catalog, zones, gstCfg] = await Promise.all([getPricingCatalog(), getZones(), getGstSettings()]);
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const issues: PricingIssue[] = [];

  // Merge repeated (product, variant) lines so stock is judged on the combined demand.
  const merged = new Map<string, CartLineInput & { quantity: number }>();
  for (const i of wanted) {
    const qty = Math.max(1, Math.floor(Number(i.quantity)));
    const k = `${i.productId}::${i.variantKey ?? ""}`;
    const prev = merged.get(k);
    merged.set(k, { productId: i.productId, variantKey: i.variantKey, quantity: (prev?.quantity ?? 0) + qty });
  }

  const priced: PricedLine[] = [];
  for (const i of merged.values()) {
    const product = byId.get(i.productId);
    if (!product) throw new HttpError(400, `Unknown product: ${i.productId}`);
    const variants = product.variants ?? [];
    const name = lineLabel(product);

    let idx = -1;
    if (i.variantKey) {
      idx = variants.findIndex((v) => keyOf(v) === i.variantKey);
      if (idx < 0) {
        issues.push({ kind: "variant", message: `${name}: that option is no longer available — please re-add it.` });
        idx = variants.findIndex((v) => !v.disabled);
      }
    } else {
      idx = variants.findIndex((v) => !v.disabled);
    }
    if (idx < 0 && variants.length > 0) idx = 0;
    const variant = idx >= 0 ? variants[idx] : undefined;

    if (variant?.disabled) issues.push({ kind: "variant", message: `${name}: that option is currently unavailable.` });
    if (variant) {
      const onHand = variantStockAt(variant, branch);
      if (onHand < i.quantity) {
        issues.push({
          kind: "stock",
          message:
            onHand > 0
              ? `${name}: only ${onHand} available at ${branch}.`
              : `${name}: out of stock at ${branch}.`,
        });
      }
    }

    const unitPrice = variant?.price || product.price;
    const rate = product.isGstApplicable ? (product.gstRate ?? 0) : 0;
    priced.push({
      productId: product.id,
      variantKey: variant ? keyOf(variant) : "",
      variantLabel: variant ? variantLabel(variant) : "",
      quantity: i.quantity,
      price: unitPrice,
      gstRate: rate,
      lineTotal: unitPrice * i.quantity,
    });
  }

  const subtotal = priced.reduce((n, l) => n + l.lineTotal, 0);

  let discount = 0;
  let couponCode: string | null = null;
  const code = (opts.couponCode ?? "").trim();
  if (code) {
    const result = evaluateCoupon(await getCoupon(code), subtotal);
    if (result.ok) {
      discount = result.discount;
      couponCode = code.toUpperCase();
    } else {
      issues.push({ kind: "coupon", message: result.reason });
    }
  }

  const intra = isIntraSupply(shipState, gstCfg.homeState);
  const { totals } = taxLines(
    priced.map((l) => ({ gross: l.lineTotal, rate: l.gstRate })),
    discount,
    intra,
  );

  const zone = pickZone(zones, shipState);
  const shippingOptions = {
    standard: shippingFor("standard", zone),
    "white-glove": shippingFor("white-glove", zone),
    express: shippingFor("express", zone),
  };
  const shipping = shippingOptions[delivery];

  return {
    items: priced,
    subtotal,
    discount,
    couponCode,
    taxable: totals.taxable,
    gst: totals.tax,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    intra,
    shipping,
    shippingOptions,
    total: subtotal - discount + shipping,
    issues,
  };
}

/** The fields of a priced line that are stored on the order. */
export function orderItemsOf(priced: Pick<PricedOrder, "items">) {
  return priced.items.map((l) => ({
    productId: l.productId,
    variantKey: l.variantKey,
    variantLabel: l.variantLabel,
    quantity: l.quantity,
    price: l.price,
    gstRate: l.gstRate,
  }));
}
