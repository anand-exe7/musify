import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson, HttpError } from "@/lib/api/http";
import { getOrder, fulfilOrder, deleteOrder } from "@/lib/db/queries/orders";
import { branchAllowed } from "@/lib/auth/session";
import { sendOrderShipped } from "@/lib/email/resend";
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

/**
 * PATCH /api/orders/:id  { status?, courier?, trackingNo? } — move an online order along (processing → shipped →
 * delivered, or cancelled) and record how it is travelling. Admins, or branch staff for their own branch's orders.
 * The customer is emailed (best effort) when it first moves to shipped.
 */
export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ access }) => {
    const { id } = await ctx.params;
    const existing = await getOrder(id);
    if (!existing || !branchAllowed(access, existing.branch)) return notFound("Order not found");
    const body = await readJson<{ status?: Order["status"]; courier?: string; trackingNo?: string }>(request);
    const result = await fulfilOrder(id, { status: body.status, courier: body.courier, trackingNo: body.trackingNo });
    if (!result) return notFound("Order not found");
    if (result.changed && result.order.status === "shipped") await sendOrderShipped(result.order, result.order.email);
    return ok(result.order);
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    return (await deleteOrder(id)) ? noContent() : notFound("Order not found");
  });
}
