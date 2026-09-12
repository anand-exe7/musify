import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { updateInventoryProduct, deleteInventoryProduct } from "@/lib/db/queries/pos";
import type { InvProduct } from "@/lib/store/pos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<InvProduct>>(request);
    const p = await updateInventoryProduct(id, patch);
    return p ? ok(p) : notFound("Inventory product not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return (await deleteInventoryProduct(id)) ? noContent() : notFound("Inventory product not found");
  });
}
