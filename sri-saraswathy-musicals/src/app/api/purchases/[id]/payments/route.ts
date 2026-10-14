import type { NextRequest } from "next/server";
import { handle, created, badRequest, readJson } from "@/lib/api/http";
import {
  createVendorPayment,
  createVendorPaymentSplit,
  getPurchase,
  purchaseVisibleTo,
  PurchaseValidationError,
  type PaidAllocationInput,
  type VendorPaymentInput,
} from "@/lib/db/queries/purchases";
import type { Branch } from "@/lib/stock";
import { branchAllowed, primaryBranchOf } from "@/lib/auth/session";
import { DEFAULT_BRANCH } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** Record a part-payment against a specific purchase. The vendor is inferred
 *  from the purchase header, so the caller only sends the money bit: either one
 *  `amount` + `branch`, or `allocations` (how much each branch pays). */
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("staff", async ({ user, access }) => {
    const { id } = await params;
    const header = await getPurchase(id);
    if (!header || !(await purchaseVisibleTo(id, access === "all" ? null : access))) return badRequest("Purchase not found");

    type Body = Omit<VendorPaymentInput, "vendorId" | "purchaseId"> & { allocations?: PaidAllocationInput[] };
    const body = await readJson<Body>(request);

    try {
      if (Array.isArray(body.allocations)) {
        const rows = await createVendorPaymentSplit(
          { vendorId: header.vendorId, purchaseId: id, allocations: body.allocations, mode: body.mode, reference: body.reference, paidAt: body.paidAt, notes: body.notes },
          user.id,
          access === "all" ? null : access,
        );
        return created(rows);
      }
      const branch: Branch = access === "all" || branchAllowed(access, body.branch) ? body.branch : primaryBranchOf(access, DEFAULT_BRANCH);
      const rec = await createVendorPayment({ ...body, vendorId: header.vendorId, purchaseId: id, branch }, user.id);
      return created(rec);
    } catch (e) {
      if (e instanceof PurchaseValidationError) return badRequest(e.message);
      throw e;
    }
  });
}
