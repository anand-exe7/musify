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
import { getZones, getGstSettings, getDeliveryMethods } from "@/lib/db/queries/settings";
import { getCoupon } from "@/lib/db/queries/pos";
import { HttpError } from "@/lib/api/errors";
import { zoneForState, priceMethod, type QuotedMethod } from "@/lib/delivery/types";
import { variantKey as keyOf, variantLabel } from "@/lib/catalog/variants";
import { evaluateCoupon } from "@/lib/checkout/coupon";
import { taxLines } from "@/lib/gst/inclusive";
import { isIntraSupply } from "@/lib/gst/place-of-supply";
import { variantStockAt, isBranch, branchLabel, BRANCH_KEYS, DEFAULT_BRANCH, type Branch } from "@/lib/stock";

/** A delivery method is whatever the admin has set up — its id, not a fixed enum. */
export type DeliveryMethod = string;

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
  kind: "coupon" | "stock" | "variant" | "delivery";
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
  /** Every delivery method the admin offers, priced for THIS cart, so the UI computes nothing. */
  shippingOptions: QuotedMethod[];
  /** The method actually charged (id), and how it reads on the order. */
  deliveryId: string;
  deliveryName: string;
  deliveryEta: string;
  /** Working days the shop has to dispatch, from the chosen method. */
  dispatchDays: number;
  /** Total billable weight of the cart, grams — what picked the courier band. */
  weightG: number;
  /** The destination zone's name, for "charged at the Rest of India rate". */
  zoneName: string;
  /** subtotal − discount + shipping. */
  total: number;
  issues: PricingIssue[];
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
  /**
   * A shop is only picked at checkout. Until then the cart is priced without one, and a line counts as
   * short only when NO branch can supply it — stock moves between the three shops, so a piece sitting in
   * Ashok Nagar is still a piece we can sell. Once a branch IS named (checkout, order placement), the
   * check goes back to that one branch, because that is where the goods are actually taken out of stock.
   */
  const branchChosen = isBranch(opts.branch);
  const branch: Branch = branchChosen ? (opts.branch as Branch) : DEFAULT_BRANCH;

  const wanted = (rawItems || []).filter((i) => i && i.productId && Number(i.quantity) > 0);
  if (wanted.length === 0) throw new HttpError(400, "Cart is empty");

  const [catalog, zones, gstCfg, methods] = await Promise.all([
    // Only the products this cart names — never the whole catalogue.
    getPricingCatalog([...new Set(wanted.map((i) => i.productId))]),
    getZones(),
    getGstSettings(),
    getDeliveryMethods(),
  ]);
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
  let weightG = 0;
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
      const onHand = branchChosen
        ? variantStockAt(variant, branch)
        : BRANCH_KEYS.reduce((n, b) => n + variantStockAt(variant, b), 0);
      if (onHand < i.quantity) {
        const where = branchChosen ? ` at ${branchLabel(branch)}` : "";
        issues.push({
          kind: "stock",
          message: onHand > 0 ? `${name}: only ${onHand} available${where}.` : `${name}: out of stock${where}.`,
        });
      }
    }

    const unitPrice = variant?.price || product.price;
    const rate = product.isGstApplicable ? (product.gstRate ?? 0) : 0;
    // The courier bills on weight, so the cart's weight is the sum of its lines'.
    weightG += Math.max(0, variant?.weight ?? 0) * i.quantity;
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

  // Delivery: the destination's zone (a state nobody claimed lands in the fallback, "Rest of
  // India"), the cart's weight, and whatever methods the admin offers — no built-in services.
  const zone = zoneForState(zones, shipState);
  const live = methods.filter((m) => m.active);
  const shippingOptions: QuotedMethod[] = live.map((m) => {
    const { price, priced: ok } = priceMethod(m, zone, weightG);
    return { id: m.id, name: m.name, description: m.description, eta: m.eta || zone?.eta || "", price, dispatchDays: m.dispatchDays, priced: ok };
  });
  const chosen = live.find((m) => m.id === delivery) ?? live[0];
  const quoted = shippingOptions.find((o) => o.id === chosen?.id);
  if (delivery && live.length > 0 && !live.some((m) => m.id === delivery)) {
    issues.push({ kind: "delivery", message: "That delivery option is no longer offered — pick another one." });
  }
  if (live.length === 0) {
    issues.push({ kind: "delivery", message: "No delivery method is set up yet. Please contact the shop." });
  } else if (quoted && !quoted.priced) {
    issues.push({
      kind: "delivery",
      message: `${zone?.name ?? "This destination"} has no courier rate for a ${Math.round(weightG)} g parcel. Please contact the shop.`,
    });
  }
  const shipping = quoted?.price ?? 0;

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
    deliveryId: chosen?.id ?? "",
    deliveryName: chosen?.name ?? "",
    deliveryEta: quoted?.eta ?? "",
    dispatchDays: chosen?.dispatchDays ?? 2,
    weightG,
    zoneName: zone?.name ?? "",
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
