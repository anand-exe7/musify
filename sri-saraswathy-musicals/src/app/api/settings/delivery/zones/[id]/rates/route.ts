import type { NextRequest } from "next/server";
import { handle, created, badRequest, readJson } from "@/lib/api/http";
import { createRate } from "@/lib/db/queries/settings";
import { bandProblem, type RateBand } from "@/lib/delivery/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Add a courier weight band to a zone. */
export function POST(request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    const body = await readJson<RateBand>(request);
    if (!body?.id) return badRequest("Rate requires `id`");
    const minG = Math.max(0, Math.round(Number(body.minG) || 0));
    const maxG = Math.round(Number(body.maxG));
    // A band has to be bounded at both ends — an open one would swallow every heavier parcel.
    const problem = bandProblem({ minG, maxG });
    if (problem) return badRequest(problem);
    return created(
      await createRate(id, {
        id: body.id,
        minG,
        maxG,
        price: Math.max(0, Math.round(Number(body.price) || 0)),
        position: Math.round(Number(body.position) || 0),
      }),
    );
  });
}
