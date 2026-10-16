import type { NextRequest } from "next/server";
import { handle, ok, notFound, badRequest, readJson } from "@/lib/api/http";
import { getBillDetail } from "@/lib/db/queries/purchaseBills";
import type { Branch } from "@/lib/stock";
import { updatePurchase, deleteOpeningBalance, purchaseVisibleTo, scopePurchaseLines, PurchaseValidationError, type PurchasePatch } from "@/lib/db/queries/purchases";

export const dynamic = "force-dynamic";

/** One bill in full: its items, what each branch has to pay, and its payment history. */
export function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("staff", async ({ access }) => {
    const { id } = await params;
    const scope = access === "all" ? null : (access as Branch[]);
    if (!(await purchaseVisibleTo(id, scope))) return notFound("Purchase not found");
    const d = await getBillDetail(id, scope);
    if (!d) return notFound("Purchase not found");
    return ok({ ...scopePurchaseLines(d.purchase, scope), branches: d.branches, payments: d.payments });
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

/** Only an opening balance with no payments against it can be removed. */
export function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("admin", async () => {
    const { id } = await params;
    try {
      return (await deleteOpeningBalance(id)) ? ok({ ok: true }) : notFound("Purchase not found");
    } catch (e) {
      if (e instanceof PurchaseValidationError) return badRequest(e.message);
      throw e;
    }
  });
}
