import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getInventory, createInventoryProduct } from "@/lib/db/queries/pos";
import type { InvProduct } from "@/lib/store/pos";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok(await getInventory()));
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<InvProduct>(request);
    if (!body?.id) return badRequest("Inventory product requires `id`");
    return created(await createInventoryProduct(body));
  });
}
