import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson, HttpError } from "@/lib/api/http";
import { getOrder, updateOrder, deleteOrder } from "@/lib/db/queries/orders";
import type { Order } from "@/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** An order is readable by its owner or any admin. */
export function GET(_request: NextRequest, ctx: Ctx) {
  return handle("user", async ({ user }) => {
    const { id } = await ctx.params;
    const o = await getOrder(id);
    if (!o) return notFound("Order not found");
    if (!user.isAdmin && o.userId !== user.id) throw new HttpError(403, "Not your order");
    return ok(o);
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Order>>(request);
    const o = await updateOrder(id, patch);
    return o ? ok(o) : notFound("Order not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    return (await deleteOrder(id)) ? noContent() : notFound("Order not found");
  });
}
