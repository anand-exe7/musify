import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getInwards, createInward, type StockInwardInput } from "@/lib/db/queries/stock";
import { requireAdminAccess, requireAdminUser, scopeByBranch } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Goods-received log — admin or branch staff (scoped to their branch). */
export function GET() {
  return handle(async () => {
    const access = await requireAdminAccess();
    return ok(scopeByBranch(await getInwards(), access));
  });
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const { user, access } = await requireAdminUser();
    const body = await readJson<Partial<StockInwardInput>>(request);
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
