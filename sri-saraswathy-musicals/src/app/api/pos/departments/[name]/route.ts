import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson, badRequest } from "@/lib/api/http";
import { deletePosDepartment, setPosDepartmentActive } from "@/lib/db/queries/pos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ name: string }> };

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { name } = await ctx.params;
    return (await deletePosDepartment(decodeURIComponent(name))) ? noContent() : notFound("Department not found");
  });
}

/** PATCH { active } — switch a department off without touching the products already in it. */
export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { name } = await ctx.params;
    const body = await readJson<{ active?: boolean }>(request);
    if (typeof body?.active !== "boolean") return badRequest("Send { active: true | false }");
    const done = await setPosDepartmentActive(decodeURIComponent(name), body.active);
    return done ? ok({ name: decodeURIComponent(name), active: body.active }) : notFound("Department not found");
  });
}
