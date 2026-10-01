import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/lib/api/http";
import { priceOrder, type CartLineInput, type DeliveryMethod } from "@/lib/checkout/pricing";

export const dynamic = "force-dynamic";

interface QuoteBody {
  items: CartLineInput[];
  delivery: DeliveryMethod;
  shipState?: string;
  branch?: "Branch 1" | "Branch 2";
  couponCode?: string;
}

/**
 * Price a cart without placing anything. The cart and checkout pages render this
 * response instead of doing their own tax/shipping/coupon maths, so what the
 * shopper sees is exactly what `/api/checkout/create` will charge. Read-only,
 * so it is open to signed-out visitors browsing the cart.
 */
export function POST(request: NextRequest) {
  return handle("public", async () => {
    const body = await readJson<QuoteBody>(request);
    return ok(
      await priceOrder(body.items, body.delivery, body.shipState, {
        couponCode: body.couponCode,
        branch: body.branch,
      }),
    );
  });
}
