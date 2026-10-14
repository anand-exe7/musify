import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import {
  getTransfers,
  createTransfer,
  createTransferBatch,
  TransferValidationError,
  type StockTransferInput,
  type TransferBatchLine,
} from "@/lib/db/queries/stockTransfers";
import { scopeByBranch } from "@/lib/auth/server";
import { BRANCH_KEYS, isBranch, type Branch } from "@/lib/stock";
import { branchAllowed } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Inter-branch transfer log — a branch user only sees rows involving their
 *  branch (the shared `scopeByBranch` reads the `branch` field, so this is
 *  filtered manually here by mapping to the source branch). */
export function GET() {
  return handle("staff", async ({ access }) => {
    const list = await getTransfers();
    // Branch users see transfers where one of their branches was source or destination.
    return ok(list.filter((r) => branchAllowed(access, r.fromBranch) || branchAllowed(access, r.toBranch)));
  });
}

export function POST(request: NextRequest) {
  return handle("staff", async ({ user, access }) => {
    const body = await readJson<Partial<StockTransferInput> & { lines?: TransferBatchLine[]; batchId?: string }>(request);
    if (Array.isArray(body?.lines)) {
      const from = (body.fromBranch as Branch) ?? BRANCH_KEYS[0];
      const to = (body.toBranch as Branch) ?? BRANCH_KEYS[1];
      if (!isBranch(from) || !isBranch(to)) return badRequest("Unknown branch");
      if (!branchAllowed(access, from)) return badRequest("You can only transfer from your own branches");
      try {
        return created(await createTransferBatch(body.lines, from, to, body.note ?? "", user.id, body.batchId));
      } catch (e) {
        if (e instanceof TransferValidationError) return badRequest(e.message);
        throw e;
      }
    }
    if (!body?.id || !body.productId || typeof body.variantIndex !== "number") {
      return badRequest("Transfer requires `id`, `productId`, `variantIndex`");
    }
    const fromBranch = (body.fromBranch as Branch) ?? BRANCH_KEYS[0];
    const toBranch = (body.toBranch as Branch) ?? BRANCH_KEYS[1];
    if (!isBranch(fromBranch) || !isBranch(toBranch)) return badRequest("Unknown branch");
    // Branch users can only originate transfers from their own branch.
    if (!branchAllowed(access, fromBranch)) {
      return badRequest("You can only transfer from your own branches");
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
