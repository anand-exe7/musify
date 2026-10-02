import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api/http";
import { vendorStatement, vendorBranchPurchaseTotals } from "@/lib/db/queries/purchases";
import { BRANCH_KEYS, type Branch } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** Ledger view for one vendor: every purchase + payment, oldest first, plus
 *  per-branch totals so the UI can show the branch split without re-aggregating. */
export function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("staff", async ({ access }) => {
    const { id } = await params;
    const scope = access === "all" ? null : (access as Branch);
    const [entries, byBranch] = await Promise.all([
      vendorStatement(id, scope),
      vendorBranchPurchaseTotals(id),
    ]);
    // Branch staff only get their own branch's total.
    if (scope) for (const b of BRANCH_KEYS) if (b !== scope) byBranch[b] = 0;
    return ok({ entries, byBranch });
  });
}
