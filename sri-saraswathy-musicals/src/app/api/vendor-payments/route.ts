import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import {
  createVendorPayment,
  getVendorPayments,
  PurchaseValidationError,
  type VendorPaymentInput,
} from "@/lib/db/queries/purchases";
import type { Branch } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** List vendor payments. `?vendorId=…` narrows to one vendor's ledger. Branch
 *  staff see only payments they recorded. */
export function GET(request: NextRequest) {
  return handle("staff", async ({ access }) => {
    const vendorId = request.nextUrl.searchParams.get("vendorId") ?? undefined;
    const list = await getVendorPayments(vendorId);
    const filtered = access === "all" ? list : list.filter((p) => p.branch === access);
    return ok(filtered);
  });
}

/** On-account/lump-sum payment, not tied to a specific purchase. */
export function POST(request: NextRequest) {
  return handle("staff", async ({ user, access }) => {
    const body = await readJson<VendorPaymentInput>(request);
    const branch: Branch = access === "all" ? body.branch : (access as Branch);
    try {
      const rec = await createVendorPayment({ ...body, purchaseId: null, branch }, user.id);
      return created(rec);
    } catch (e) {
      if (e instanceof PurchaseValidationError) return badRequest(e.message);
      throw e;
    }
  });
}
