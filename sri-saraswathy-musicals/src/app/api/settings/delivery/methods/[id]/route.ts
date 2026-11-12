import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, badRequest, readJson } from "@/lib/api/http";
import { updateDeliveryMethod, deleteDeliveryMethod } from "@/lib/db/queries/settings";
import type { DeliveryMethod } from "@/lib/delivery/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<DeliveryMethod>>(request);
    if (patch.name !== undefined && !patch.name.trim()) return badRequest("Give the delivery method a name.");
    const m = await updateDeliveryMethod(id, patch);
    return m ? ok(m) : notFound("Delivery method not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    return (await deleteDeliveryMethod(id)) ? noContent() : notFound("Delivery method not found");
  });
}
