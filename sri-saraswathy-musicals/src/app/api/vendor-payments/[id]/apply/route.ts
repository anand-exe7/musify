import type { NextRequest } from "next/server";
import { handle, ok, badRequest, readJson } from "@/lib/api/http";
import { applyPaymentToBills, PurchaseValidationError } from "@/lib/db/queries/purchases";

export const dynamic = "force-dynamic";

/** Attach a vendor-level payment to specific bills. Admin only: it re-labels money already recorded. */
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("admin", async () => {
    const { id } = await params;
    const body = await readJson<{ shares: { purchaseId: string; amount: number }[] }>(request);
    try {
      await applyPaymentToBills(id, body.shares);
      return ok({ ok: true });
    } catch (e) {
      if (e instanceof PurchaseValidationError) return badRequest(e.message);
      throw e;
    }
  });
}
