import { handle, ok } from "@/lib/api/http";
import { vendorOutstandings } from "@/lib/db/queries/purchases";
import { branchAllowed } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** One row per (vendorId, branch) with purchased/paid/outstanding totals in
 *  paise. The UI joins against the vendor list for display names. */
export function GET() {
  return handle("admin", async ({ access }) => {
    const list = await vendorOutstandings();
    return ok(list.filter((r) => branchAllowed(access, r.branch)));
  });
}
