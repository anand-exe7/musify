import type { NextRequest } from "next/server";
import { handle, created, badRequest, readJson } from "@/lib/api/http";
import { createOpeningBalance, PurchaseValidationError } from "@/lib/db/queries/purchases";

export const dynamic = "force-dynamic";

/** What we already owed this vendor before the system: one bill per branch, admin only. */
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("admin", async ({ user }) => {
    const { id } = await params;
    const body = await readJson<{ branch: string; amount: number; asOf?: string; notes?: string }>(request);
    try {
      return created(await createOpeningBalance({ vendorId: id, branch: body.branch, amount: body.amount, asOf: body.asOf, notes: body.notes }, user.id));
    } catch (e) {
      if (e instanceof PurchaseValidationError) return badRequest(e.message);
      throw e;
    }
  });
}
