import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { getVendor, updateVendor, deleteVendor } from "@/lib/db/queries/vendors";
import type { Vendor } from "@/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const v = await getVendor(id);
    return v ? ok(v) : notFound("Vendor not found");
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Vendor>>(request);
    const v = await updateVendor(id, patch);
    return v ? ok(v) : notFound("Vendor not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return (await deleteVendor(id)) ? noContent() : notFound("Vendor not found");
  });
}
