import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import {
  getTransfers,
  createTransfer,
  type StockTransferInput,
} from "@/lib/db/queries/stockTransfers";
import { requireAdminAccess, requireAdminUser, scopeByBranch } from "@/lib/auth/server";
import type { Branch } from "@/lib/store/pos";

export const dynamic = "force-dynamic";

/** Inter-branch transfer log — a branch user only sees rows involving their
 *  branch (the shared `scopeByBranch` reads the `branch` field, so this is
 *  filtered manually here by mapping to the source branch). */
export function GET() {
  return handle(async () => {
    const access = await requireAdminAccess();
    const list = await getTransfers();
    if (access === "all") return ok(list);
    // Branch users see transfers where they were either source or destination.
    return ok(
      scopeByBranch(
        list.map((r) => ({ ...r, branch: r.fromBranch })),
        access,
      ).concat(
        scopeByBranch(
          list.map((r) => ({ ...r, branch: r.toBranch })),
          access,
        ),
      ),
    );
  });
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const { user, access } = await requireAdminUser();
    const body = await readJson<Partial<StockTransferInput>>(request);
    if (!body?.id || !body.productId || typeof body.variantIndex !== "number") {
      return badRequest("Transfer requires `id`, `productId`, `variantIndex`");
    }
    const fromBranch = (body.fromBranch as Branch) ?? "Branch 1";
    const toBranch = (body.toBranch as Branch) ?? "Branch 2";
    // Branch users can only originate transfers from their own branch.
    if (access !== "all" && fromBranch !== access) {
      return badRequest("You can only transfer from your own branch");
    }
    const rec = await createTransfer({
      id: body.id,
      productId: body.productId,
      variantIndex: Number(body.variantIndex) || 0,
      quantity: Math.max(0, Number(body.quantity) || 0),
      fromBranch,
      toBranch,
      note: body.note,
      createdBy: user.id,
    });
    return created(rec);
  });
}
