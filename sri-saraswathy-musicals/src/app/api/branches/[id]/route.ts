import type { NextRequest } from "next/server";
import { handle, ok, notFound, readJson } from "@/lib/api/http";
import { updateBranch, type BranchProfile } from "@/lib/db/queries/branches";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Edit a branch's profile (name/address/GSTIN/phone/active) — full admin only. */
export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<BranchProfile>>(request);
    const b = await updateBranch(id, patch);
    return b ? ok(b) : notFound("Branch not found");
  });
}
