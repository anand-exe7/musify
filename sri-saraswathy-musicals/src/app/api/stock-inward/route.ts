import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getInwards, createInward, createInwardBatch, InwardValidationError, type StockInwardInput, type InwardBatchLine } from "@/lib/db/queries/stock";
import type { Branch } from "@/lib/stock";
import { scopeByBranch } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Goods-received log — admin or branch staff (scoped to their branch). */
export function GET() {
  return handle("staff", async ({ access }) => {
    return ok(scopeByBranch(await getInwards(), access));
  });
}

export function POST(request: NextRequest) {
  return handle("staff", async ({ user, access }) => {
    const body = await readJson<Partial<StockInwardInput> & { lines?: InwardBatchLine[]; batchId?: string }>(request);
    // Multi-line receipt with per-branch split.
    if (Array.isArray(body?.lines)) {
      if (!body.vendorId) return badRequest("Inward requires `vendorId`");
      try {
        const recs = await createInwardBatch(body.vendorId, body.lines, user.id, access === "all" ? null : (access as Branch), body.batchId);
        return created(recs);
      } catch (e) {
        if (e instanceof InwardValidationError) return badRequest(e.message);
        throw e;
      }
    }
    if (!body?.id || !body.vendorId || !body.productId) {
      return badRequest("Inward requires `id`, `vendorId` and `productId`");
    }
    // Branch users can only receive stock into their own branch.
    const branch = access === "all" ? body.branch || "Branch 1" : access;
    const rec = await createInward({
      id: body.id,
      vendorId: body.vendorId,
      productId: body.productId,
      variantIndex: Number(body.variantIndex) || 0,
      quantity: Math.max(0, Number(body.quantity) || 0),
      unitCost: Math.max(0, Number(body.unitCost) || 0),
      branch,
      createdBy: user.id,
    });
    return created(rec);
  });
}
