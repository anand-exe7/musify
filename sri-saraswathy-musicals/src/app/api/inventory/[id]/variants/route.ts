import type { NextRequest } from "next/server";
import { handle, ok, notFound } from "@/lib/api/http";
import { getInventoryVariants } from "@/lib/db/queries/inventoryPage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/inventory/{id}/variants — one product's variants with what each branch has on hand. */
export function GET(_request: NextRequest, ctx: Ctx) {
  return handle("staff", async () => {
    const { id } = await ctx.params;
    const variants = await getInventoryVariants(id);
    return variants ? ok(variants) : notFound("Product not found");
  });
}
