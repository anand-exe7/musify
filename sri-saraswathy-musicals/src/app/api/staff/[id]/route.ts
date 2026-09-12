import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { updateStaff, deleteStaff } from "@/lib/db/queries/staff";
import type { Staff } from "@/lib/store/staff";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Staff>>(request);
    const s = await updateStaff(id, patch);
    return s ? ok(s) : notFound("Staff not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return (await deleteStaff(id)) ? noContent() : notFound("Staff not found");
  });
}
