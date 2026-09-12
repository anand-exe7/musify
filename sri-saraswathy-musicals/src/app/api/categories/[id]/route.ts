import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent } from "@/lib/api/http";
import { getCategory, deleteCategory } from "@/lib/db/queries/categories";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const c = await getCategory(id);
    return c ? ok(c) : notFound("Category not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return (await deleteCategory(id)) ? noContent() : notFound("Category not found");
  });
}
