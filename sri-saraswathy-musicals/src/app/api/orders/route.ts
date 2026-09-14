import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getOrders, createOrder } from "@/lib/db/queries/orders";
import { requireAdmin, requireAdminAccess, scopeByBranch } from "@/lib/auth/server";
import type { Order } from "@/types";

export const dynamic = "force-dynamic";

/** Every storefront order — admin or branch staff (scoped to their branch).
 *  Customers use `/api/orders/mine`; the storefront places orders through
 *  `/api/checkout/*`. */
export function GET() {
  return handle(async () => {
    const access = await requireAdminAccess();
    return ok(scopeByBranch(await getOrders(), access));
  });
}

export function POST(request: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson<Order>(request);
    if (!body?.id) return badRequest("Order requires `id`");
    return created(await createOrder(body));
  });
}
