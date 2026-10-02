import { handle, ok } from "@/lib/api/http";
import { vendorOutstandings } from "@/lib/db/queries/purchases";

export const dynamic = "force-dynamic";

/** One row per (vendorId, branch) with purchased/paid/outstanding totals in
 *  paise. The UI joins against the vendor list for display names. */
export function GET() {
  return handle("staff", async ({ access }) => {
    const list = await vendorOutstandings();
    return ok(access === "all" ? list : list.filter((r) => r.branch === access));
  });
}
