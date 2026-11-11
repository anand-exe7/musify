import { handle, ok } from "@/lib/api/http";
import { getProductNames } from "@/lib/db/queries/products";

export const dynamic = "force-dynamic";

/** id → product name, for labelling order lines on admin screens (Orders, Analytics). Tiny compared with the catalogue. */
export function GET() {
  return handle("staff", async () => ok(await getProductNames()));
}
