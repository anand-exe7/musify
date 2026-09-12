import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/lib/api/http";
import {
  getDeliverySettings,
  updateDeliverySettings,
  type DeliverySettings,
} from "@/lib/db/queries/settings";

export const dynamic = "force-dynamic";

// GET returns delivery config incl. `zones`.
export function GET() {
  return handle(async () => ok(await getDeliverySettings()));
}

// PATCH updates the scalar delivery fields (zones have their own endpoint).
export function PATCH(request: NextRequest) {
  return handle(async () => {
    const patch = await readJson<Partial<Omit<DeliverySettings, "zones">>>(request);
    return ok(await updateDeliverySettings(patch));
  });
}
