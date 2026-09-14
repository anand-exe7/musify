import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getBills, createBill } from "@/lib/db/queries/pos";
import { recordBillInvoice } from "@/lib/billing/ledger";
import { requireAdminAccess, scopeByBranch } from "@/lib/auth/server";
import type { Bill } from "@/lib/store/pos";

export const dynamic = "force-dynamic";

/** POS bills — admin or branch staff (scoped to their branch). */
export function GET() {
  return handle(async () => {
    const access = await requireAdminAccess();
    return ok(scopeByBranch(await getBills(), access));
  });
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const access = await requireAdminAccess();
    const body = await readJson<Bill>(request);
    if (!body?.id) return badRequest("Bill requires `id`");
    // A branch user can only raise bills for their own branch.
    if (access !== "all") body.branch = access;
    const bill = await createBill(body);
    await recordBillInvoice(bill);
    return created(bill);
  });
}
