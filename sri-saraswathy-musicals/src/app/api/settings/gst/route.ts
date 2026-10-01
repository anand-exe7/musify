import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/lib/api/http";
import { getGstSettings, updateGstSettings, type GstSettings } from "@/lib/db/queries/settings";

export const dynamic = "force-dynamic";

export function GET() {
  return handle("public", async () => ok(await getGstSettings()));
}

export function PATCH(request: NextRequest) {
  return handle("admin", async () => {
    const patch = await readJson<Partial<GstSettings>>(request);
    return ok(await updateGstSettings(patch));
  });
}
