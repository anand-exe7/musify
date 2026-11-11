import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getInventoryList, createInventoryProduct } from "@/lib/db/queries/pos";
import type { InvProduct } from "@/lib/store/pos";

export const dynamic = "force-dynamic";

/**
 * The whole catalogue for billing / purchases / pickers — one photo per product, without the gallery or variant
 * photos (those made this take 10+ seconds). The product editor loads a product in full from `/api/pos/inventory/[id]`.
 */
export function GET() {
  return handle("staff", async () => ok(await getInventoryList()));
}

/** Creating a new product sets its prices, so it's admin-only (Phase 7). */
export function POST(request: NextRequest) {
  return handle("admin", async () => {
    const body = await readJson<InvProduct>(request);
    if (!body?.id) return badRequest("Inventory product requires `id`");
    if (!/^\d{4,8}$/.test(String(body.hsn ?? "").trim())) return badRequest("HSN / SAC code is required (4–8 digits)");
    return created(await createInventoryProduct(body));
  });
}
