import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, badRequest, readJson } from "@/lib/api/http";
import { updateZone, deleteZone, getZones } from "@/lib/db/queries/settings";
import type { Zone } from "@/lib/store/settings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Zone>>(request);

    if (patch.states) {
      // A state belongs to exactly one zone: two zones claiming it would make the rate it is
      // charged depend on row order. Say which zone has it, so the admin knows where to look.
      const zones = await getZones();
      const taken = new Map<string, string>();
      for (const z of zones) {
        if (z.id === id) continue;
        for (const st of z.states) taken.set(st.trim().toLowerCase(), z.name || "another zone");
      }
      const clash = patch.states.find((st) => taken.has(st.trim().toLowerCase()));
      if (clash) {
        return badRequest(`${clash} is already in “${taken.get(clash.trim().toLowerCase())}”. Remove it there first.`);
      }
      if (patch.name !== undefined && !patch.name.trim()) return badRequest("Give the zone a name.");
    }

    const z = await updateZone(id, patch);
    return z ? ok(z) : notFound("Zone not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    return (await deleteZone(id)) ? noContent() : notFound("Zone not found");
  });
}
