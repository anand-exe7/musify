import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import {
  createVendorPayment,
  getVendorPayments,
  PurchaseValidationError,
  type VendorPaymentInput,
} from "@/lib/db/queries/purchases";
import type { Branch } from "@/lib/stock";
import { branchAllowed, primaryBranchOf } from "@/lib/auth/session";
import { DEFAULT_BRANCH } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** List vendor payments. `?vendorId=…` narrows to one vendor's ledger. Branch
 *  staff see only payments they recorded. */
export function GET(request: NextRequest) {
  return handle("staff", async ({ access }) => {
    const vendorId = request.nextUrl.searchParams.get("vendorId") ?? undefined;
    const list = await getVendorPayments(vendorId);
    const filtered = list.filter((p) => branchAllowed(access, p.branch));
    return ok(filtered);
  });
}

/** Pay a vendor: every payment is against one bill (`purchaseId`), never the vendor in general. */
export function POST(request: NextRequest) {
  return handle("staff", async ({ user, access }) => {
    const body = await readJson<VendorPaymentInput>(request);
    if (!body.purchaseId) return badRequest("Pick the invoice this payment is for.");
    const branch: Branch = access === "all" || branchAllowed(access, body.branch) ? body.branch : primaryBranchOf(access, DEFAULT_BRANCH);
    try {
      const rec = await createVendorPayment({ ...body, branch }, user.id);
      return created(rec);
    } catch (e) {
      if (e instanceof PurchaseValidationError) return badRequest(e.message);
      throw e;
    }
  });
}
