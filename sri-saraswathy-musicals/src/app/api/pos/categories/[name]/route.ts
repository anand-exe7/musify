import type { NextRequest } from "next/server";
import { handle, notFound, noContent } from "@/lib/api/http";
import { deletePosCategory } from "@/lib/db/queries/pos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { name } = await ctx.params;
    return (await deletePosCategory(decodeURIComponent(name))) ? noContent() : notFound("Category not found");
  });
}
