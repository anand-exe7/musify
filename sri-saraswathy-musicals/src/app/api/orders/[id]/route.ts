import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { getOrder, updateOrder, deleteOrder } from "@/lib/db/queries/orders";
import type { Order } from "@/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const o = await getOrder(id);
    return o ? ok(o) : notFound("Order not found");
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Order>>(request);
    const o = await updateOrder(id, patch);
    return o ? ok(o) : notFound("Order not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return (await deleteOrder(id)) ? noContent() : notFound("Order not found");
  });
}
