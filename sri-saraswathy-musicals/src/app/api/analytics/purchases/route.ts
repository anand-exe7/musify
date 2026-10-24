import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api/http";
import { getPurchaseAnalytics } from "@/lib/db/queries/purchaseViews";
import type { Branch } from "@/lib/stock";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/purchases?from=&to=&branch=&vendor=
 * Purchase analytics with every figure split by branch (bought, paid, still to pay). The branch filter applies
 * to all of it. Branch staff only ever see their own branches.
 */
export function GET(request: NextRequest) {
  return handle("admin", async ({ access }) => {
    const sp = request.nextUrl.searchParams;
    return ok(await getPurchaseAnalytics({
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      branch: sp.get("branch") || undefined,
      vendorId: sp.get("vendor") || undefined,
    }, access === "all" ? null : (access as Branch[])));
  });
}
