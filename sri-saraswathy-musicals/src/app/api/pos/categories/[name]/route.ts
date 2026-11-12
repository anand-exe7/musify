import type { NextRequest } from "next/server";
import { handle, notFound, noContent, ok, readJson, badRequest } from "@/lib/api/http";
import { deletePosCategory, setPosCategoryActive } from "@/lib/db/queries/pos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { name } = await ctx.params;
    return (await deletePosCategory(decodeURIComponent(name))) ? noContent() : notFound("Category not found");
  });
}

/** PATCH { active } — INV-01: disable a category without touching the products already in it. */
export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { name } = await ctx.params;
    const body = await readJson<{ active?: boolean }>(request);
    if (typeof body?.active !== "boolean") return badRequest("Send { active: true | false }");
    const done = await setPosCategoryActive(decodeURIComponent(name), body.active);
    return done ? ok({ name: decodeURIComponent(name), active: body.active }) : notFound("Category not found");
  });
}
