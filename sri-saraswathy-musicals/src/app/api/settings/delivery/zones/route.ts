import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getZones, createZone } from "@/lib/db/queries/settings";
import type { Zone } from "@/lib/store/settings";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok(await getZones()));
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<Zone>(request);
    if (!body?.id) return badRequest("Zone requires `id`");
    return created(await createZone(body));
  });
}
