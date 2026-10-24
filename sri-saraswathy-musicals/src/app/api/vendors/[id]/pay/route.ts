import type { NextRequest } from "next/server";
import { handle, created, badRequest, readJson } from "@/lib/api/http";
import { payVendorBills, PurchaseValidationError, type VendorPaymentInput } from "@/lib/db/queries/purchases";

export const dynamic = "force-dynamic";

/** Pay several of a vendor's bills at once: `rows` say which bill, which branch pays and how much. */
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("admin", async ({ user, access }) => {
    const { id } = await params;
    const body = await readJson<{ rows: { purchaseId: string; branch: string; amount: number }[]; mode: VendorPaymentInput["mode"]; reference?: string; notes?: string }>(request);
    try {
      const saved = await payVendorBills(
        { vendorId: id, rows: body.rows, mode: body.mode, reference: body.reference, notes: body.notes },
        user.id,
        access === "all" ? null : access,
      );
      return created(saved);
    } catch (e) {
      if (e instanceof PurchaseValidationError) return badRequest(e.message);
      throw e;
    }
  });
}
