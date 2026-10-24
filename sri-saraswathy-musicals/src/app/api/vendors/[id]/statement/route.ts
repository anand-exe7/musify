import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api/http";
import { vendorStatement, vendorBranchPurchaseTotals } from "@/lib/db/queries/purchases";

export const dynamic = "force-dynamic";

/** Ledger view for one vendor: every purchase + payment, oldest first, plus
 *  per-branch totals so the UI can show the branch split without re-aggregating. */
export function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("admin", async () => {
    const { id } = await params;
    const [entries, byBranch] = await Promise.all([
      vendorStatement(id, null),
      vendorBranchPurchaseTotals(id),
    ]);
    return ok({ entries, byBranch });
  });
}
