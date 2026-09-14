import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getVendors, createVendor } from "@/lib/db/queries/vendors";
import { requireAdminAccess } from "@/lib/auth/server";
import type { Vendor } from "@/types";

export const dynamic = "force-dynamic";

/** Vendor directory — admin or branch staff (both need it for stock-inward). */
export function GET() {
  return handle(async () => {
    await requireAdminAccess();
    return ok(await getVendors());
  });
}

export function POST(request: NextRequest) {
  return handle(async () => {
    await requireAdminAccess();
    const body = await readJson<Vendor>(request);
    if (!body?.id || !body?.name) return badRequest("Vendor requires `id` and `name`");
    return created(await createVendor(body));
  });
}
