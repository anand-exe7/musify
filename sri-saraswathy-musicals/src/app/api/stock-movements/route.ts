import { handle, ok } from "@/lib/api/http";
import { getStockMovements } from "@/lib/db/queries/stockMovements";
import { branchAllowed } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** LED-04: stock movement log (cancelled bills/orders putting stock back, transfers, purchases). Branch users see only their branches. */
export function GET() {
  return handle("admin", async ({ access }) => {
    const list = await getStockMovements();
    return ok(list.filter((r) => branchAllowed(access, r.branch)));
  });
}
