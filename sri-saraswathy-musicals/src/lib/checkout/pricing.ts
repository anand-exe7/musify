/**
 * Authoritative order pricing — computed on the server from database product
 * prices, never trusted from the client. Used by both the order-placement and
 * the Razorpay create/verify routes so the amount charged and the amount stored
 * always agree and can't be tampered with in the browser.
 */
import { getAllProducts } from "@/lib/db/queries/products";
import { HttpError } from "@/lib/api/http";

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

/** Shipping mirrors the storefront checkout: white-glove free, express ₹500,
 *  standard free over ₹5,000 else ₹200. */
function shippingFor(method: DeliveryMethod, subtotal: number): number {
  if (method === "express") return 500;
  if (method === "white-glove") return 0;
  return subtotal > 5000 ? 0 : 200;
}

/** Price a cart. Throws a 400 for an empty cart or an unknown product. */
export async function priceOrder(
  rawItems: CartLineInput[],
  delivery: DeliveryMethod,
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
  const shipping = shippingFor(delivery, subtotal);
  const total = subtotal + gst + shipping;
  return { items: priced, subtotal, gst, shipping, total };
}
