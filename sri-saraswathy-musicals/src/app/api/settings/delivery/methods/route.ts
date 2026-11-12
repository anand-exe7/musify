import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getDeliveryMethods, createDeliveryMethod } from "@/lib/db/queries/settings";
import type { DeliveryMethod } from "@/lib/delivery/types";

export const dynamic = "force-dynamic";

/** Public: checkout reads this to know what it may offer. */
export function GET() {
  return handle("public", async () => ok(await getDeliveryMethods()));
}

export function POST(request: NextRequest) {
  return handle("admin", async () => {
    const body = await readJson<DeliveryMethod>(request);
    if (!body?.id) return badRequest("Delivery method requires `id`");
    if (!body.name?.trim()) return badRequest("Give the delivery method a name.");
    return created(await createDeliveryMethod({ ...body, name: body.name.trim() }));
  });
}
