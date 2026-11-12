import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, badRequest, readJson } from "@/lib/api/http";
import { updateRate, deleteRate, getZones } from "@/lib/db/queries/settings";
import { bandProblem, type RateBand } from "@/lib/delivery/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; rateId: string }> };

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id, rateId } = await ctx.params;
    const patch = await readJson<Partial<RateBand>>(request);
    // Check the band as it will BE, not just the fields that changed.
    const existing = (await getZones()).find((z) => z.id === id)?.rates.find((x) => x.id === rateId);
    if (!existing) return notFound("Rate not found");
    const problem = bandProblem({ minG: patch.minG ?? existing.minG, maxG: patch.maxG ?? existing.maxG });
    if (problem) return badRequest(problem);
    const r = await updateRate(rateId, patch);
    return r ? ok(r) : notFound("Rate not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { rateId } = await ctx.params;
    return (await deleteRate(rateId)) ? noContent() : notFound("Rate not found");
  });
}
