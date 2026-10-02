import type { NextRequest } from "next/server";
import { handle, ok, notFound, badRequest, readJson } from "@/lib/api/http";
import { getPurchase, updatePurchase, purchaseVisibleTo, scopePurchaseLines, PurchaseValidationError, type PurchasePatch } from "@/lib/db/queries/purchases";
import type { Branch } from "@/lib/stock";

export const dynamic = "force-dynamic";

export function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("staff", async ({ access }) => {
    const { id } = await params;
    if (!(await purchaseVisibleTo(id, access as Branch | "all"))) return notFound("Purchase not found");
    const rec = await getPurchase(id);
    return rec ? ok(scopePurchaseLines(rec, access as Branch | "all")) : notFound("Purchase not found");
  });
}

/** Editing a purchase's money fields is admin-only. */
export function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("admin", async () => {
    const { id } = await params;
    const body = await readJson<PurchasePatch>(request);
    try {
      const rec = await updatePurchase(id, body);
      return rec ? ok(rec) : notFound("Purchase not found");
    } catch (e) {
      if (e instanceof PurchaseValidationError) return badRequest(e.message);
      throw e;
    }
  });
}
