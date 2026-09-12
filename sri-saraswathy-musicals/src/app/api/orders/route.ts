import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getOrders, createOrder } from "@/lib/db/queries/orders";
import type { Order } from "@/types";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok(await getOrders()));
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<Order>(request);
    if (!body?.id) return badRequest("Order requires `id`");
    return created(await createOrder(body));
  });
}
