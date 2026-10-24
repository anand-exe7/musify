import type { NextRequest } from "next/server";
import { handle, ok, notFound, badRequest, readJson } from "@/lib/api/http";
import { getBillDetail } from "@/lib/db/queries/purchaseBills";
import type { Branch } from "@/lib/stock";
import { updatePurchase, deletePurchase,purchaseVisibleTo, scopePurchaseLines, PurchaseValidationError, type PurchasePatch } from "@/lib/db/queries/purchases";

export const dynamic = "force-dynamic";

/** One bill in full: its items, what each branch has to pay, and its payment history. */
export function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("admin", async ({ access }) => {
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

/** Delete a bill (admin only). `?stock=keep` (default) leaves stock alone; `?stock=reverse` also takes it back out. */
export function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("admin", async () => {
    const { id } = await params;
    const stock = req.nextUrl.searchParams.get("stock") === "reverse" ? "reverse" : "keep";
    try {
      return (await deletePurchase(id, stock)) ? ok({ ok: true }) : notFound("Purchase not found");
    } catch (e) {
      if (e instanceof PurchaseValidationError) return badRequest(e.message);
      throw e;
    }
  });
}
