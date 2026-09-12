import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { updateZone, deleteZone } from "@/lib/db/queries/settings";
import type { Zone } from "@/lib/store/settings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Zone>>(request);
    const z = await updateZone(id, patch);
    return z ? ok(z) : notFound("Zone not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return (await deleteZone(id)) ? noContent() : notFound("Zone not found");
  });
}
