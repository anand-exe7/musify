import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson, HttpError } from "@/lib/api/http";
import { getOrder, updateOrder, deleteOrder } from "@/lib/db/queries/orders";
import { getSession, requireAdmin } from "@/lib/auth/server";
import type { Order } from "@/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** An order is readable by its owner or any admin. */
export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const o = await getOrder(id);
    if (!o) return notFound("Order not found");
    const session = await getSession();
    if (!session) throw new HttpError(401, "Sign in required");
    if (!session.isAdmin && o.userId !== session.id) throw new HttpError(403, "Not your order");
    return ok(o);
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Order>>(request);
    const o = await updateOrder(id, patch);
    return o ? ok(o) : notFound("Order not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    return (await deleteOrder(id)) ? noContent() : notFound("Order not found");
  });
}
