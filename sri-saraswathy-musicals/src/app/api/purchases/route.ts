import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { createPurchase, getPurchases, PurchaseValidationError, type PurchaseInput } from "@/lib/db/queries/purchases";
import { purchaseIdsInBranch, scopePurchaseLines } from "@/lib/db/queries/purchases";
import type { Branch } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** List purchase headers. Branch staff only see purchases whose lines touched
 *  their branch. */
export function GET() {
  return handle("staff", async ({ access }) => {
    const list = await getPurchases();
    if (access === "all") return ok(list);
    const scope = await purchaseIdsInBranch(access as Branch);
    return ok(list.filter((p) => scope.has(p.id)).map((p) => scopePurchaseLines(p, access as Branch)));
  });
}

export function POST(request: NextRequest) {
  return handle("staff", async ({ user, access }) => {
    const body = await readJson<PurchaseInput>(request);
    try {
      const rec = await createPurchase(body, user.id, access === "all" ? null : (access as Branch));
      return created(rec);
    } catch (e) {
      if (e instanceof PurchaseValidationError) return badRequest(e.message);
      throw e;
    }
  });
}
