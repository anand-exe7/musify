/**
 * Authoritative order pricing — computed on the server from database product
 * prices, never trusted from the client. Used by both the order-placement and
 * the Razorpay create/verify routes so the amount charged and the amount stored
 * always agree and can't be tampered with in the browser.
 */
import { getAllProducts } from "@/lib/db/queries/products";
import { getZones } from "@/lib/db/queries/settings";
import { HttpError } from "@/lib/api/http";
import type { Zone } from "@/lib/store/settings";

export type DeliveryMethod = "standard" | "white-glove" | "express";

export interface CartLineInput {
  productId: string;
  quantity: number;
}

export interface PricedOrder {
  items: { productId: string; quantity: number; price: number }[];
  subtotal: number;
  gst: number;
  shipping: number;
  total: number;
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
 * No free-shipping threshold. Cart weight is not tracked yet, so a heavier
 * parcel is still billed at the base slab; when product weight lands, walk the
 * ladder (uptoGm250 → uptoGm500 → perAddl500 → above5kgPerKg → above10kgPerKg).
 */
async function shippingFor(method: DeliveryMethod, shipState: string): Promise<number> {
  if (method === "express") return 500;
  if (method === "white-glove") return 0;
  const zone = pickZone(await getZones(), shipState);
  if (!zone) return 0;
  return zone.uptoGm500 || zone.uptoGm250 || zone.charge;
}

/** Price a cart. Throws a 400 for an empty cart or an unknown product. */
export async function priceOrder(
  rawItems: CartLineInput[],
  delivery: DeliveryMethod,
  shipState = "",
): Promise<PricedOrder> {
  const items = (rawItems || []).filter((i) => i && i.productId && i.quantity > 0);
  if (items.length === 0) throw new HttpError(400, "Cart is empty");

  const byId = new Map((await getAllProducts()).map((p) => [p.id, p]));

  let subtotal = 0;
  let gstAccum = 0;
  const priced = items.map((i) => {
    const product = byId.get(i.productId);
    if (!product) throw new HttpError(400, `Unknown product: ${i.productId}`);
    const qty = Math.max(1, Math.floor(i.quantity));
    const lineAmount = product.price * qty;
    subtotal += lineAmount;
    gstAccum += (lineAmount * product.gstRate) / 100;
    return { productId: product.id, quantity: qty, price: product.price };
  });

  const gst = Math.round(gstAccum);
  const shipping = await shippingFor(delivery, shipState);
  const total = subtotal + gst + shipping;
  return { items: priced, subtotal, gst, shipping, total };
}
