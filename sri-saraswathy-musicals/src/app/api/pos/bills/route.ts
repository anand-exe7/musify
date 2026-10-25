import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getBills, createBill } from "@/lib/db/queries/pos";
import { recordBillInvoice } from "@/lib/billing/ledger";
import { scopeByBranch } from "@/lib/auth/server";
import { lockBill } from "@/lib/auth/catalogLines";
import type { Bill } from "@/lib/store/pos";
import { branchAllowed, primaryBranchOf } from "@/lib/auth/session";
import { DEFAULT_BRANCH } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** POS bills — admin or branch staff (scoped to their branch). */
export function GET() {
  return handle("staff", async ({ access }) => {
    return ok(scopeByBranch(await getBills(), access));
  });
}

export function POST(request: NextRequest) {
  return handle("staff", async ({ access }) => {
    const body = await readJson<Bill>(request);
    if (!body?.id) return badRequest("Bill requires `id`");
    // A branch user can only raise bills for one of their branches.
    if (access !== "all" && !branchAllowed(access, body.branch)) body.branch = primaryBranchOf(access, DEFAULT_BRANCH);
    // Branch staff sell catalogue products at catalogue prices only.
    const bill = await createBill(await lockBill(body, access));
    await recordBillInvoice(bill);
    return created(bill);
  });
}
