import type { NextRequest } from "next/server";
import { handle, notFound, noContent } from "@/lib/api/http";
import { deleteBill } from "@/lib/db/queries/pos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return (await deleteBill(id)) ? noContent() : notFound("Bill not found");
  });
}
