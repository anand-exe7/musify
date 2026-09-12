import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getVendors, createVendor } from "@/lib/db/queries/vendors";
import type { Vendor } from "@/types";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok(await getVendors()));
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<Vendor>(request);
    if (!body?.id) return badRequest("Vendor requires `id`");
    return created(await createVendor(body));
  });
}
