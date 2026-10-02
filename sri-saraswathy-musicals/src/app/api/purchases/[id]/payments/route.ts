import type { NextRequest } from "next/server";
import { handle, created, badRequest, readJson } from "@/lib/api/http";
import { createVendorPayment, getPurchase, purchaseVisibleTo, PurchaseValidationError, type VendorPaymentInput } from "@/lib/db/queries/purchases";
import type { Branch } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** Record a part-payment against a specific purchase. The vendor is inferred
 *  from the purchase header, so the caller only sends the money bit. */
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("staff", async ({ user, access }) => {
    const { id } = await params;
    const header = await getPurchase(id);
    if (!header || !(await purchaseVisibleTo(id, access as Branch | "all"))) return badRequest("Purchase not found");

    type Body = Omit<VendorPaymentInput, "vendorId" | "purchaseId">;
    const body = await readJson<Body>(request);
    const branch: Branch = access === "all" ? body.branch : (access as Branch);

    try {
      const rec = await createVendorPayment(
        { ...body, vendorId: header.vendorId, purchaseId: id, branch },
        user.id,
      );
      return created(rec);
    } catch (e) {
      if (e instanceof PurchaseValidationError) return badRequest(e.message);
      throw e;
    }
  });
}
