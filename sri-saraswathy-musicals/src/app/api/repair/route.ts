import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getTickets, createTicket, cleanParts, syncPartsStock } from "@/lib/db/queries/repair";
import { scopeByBranch } from "@/lib/auth/server";
import { lockRepairParts } from "@/lib/auth/catalogLines";
import type { RepairTicket } from "@/lib/store/repair";
import { branchAllowed, primaryBranchOf } from "@/lib/auth/session";
import { DEFAULT_BRANCH } from "@/lib/stock";
import { cleanPayments, paymentsTotal, isPayMode } from "@/lib/billing/repairPayments";

export const dynamic = "force-dynamic";

/** Repair tickets — admin or branch staff (scoped to their branch). */
export function GET() {
  return handle("staff", async ({ access }) => {
    return ok(scopeByBranch(await getTickets(), access));
  });
}

export function POST(request: NextRequest) {
  return handle("staff", async ({ access }) => {
    const body = await readJson<RepairTicket>(request);
    if (!body?.id) return badRequest("Repair ticket requires `id`");
    // A branch user can only file tickets for one of their branches.
    if (access !== "all" && !branchAllowed(access, body.branch)) body.branch = primaryBranchOf(access, DEFAULT_BRANCH);
    // Products picked at intake are checked, and leave stock only once the repair is Ready (see the PATCH route).
    body.parts = cleanParts(await lockRepairParts(body.parts ?? [], access));
    delete body.stockTaken;
    // REP-01 / REP-03: money taken at intake is the first part-payment on the ticket, in the chosen payment mode.
    if (!isPayMode(body.paymentMode)) body.paymentMode = "CASH";
    try {
      body.payments = cleanPayments(body.payments ?? []);
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : "Invalid payments");
    }
    if (body.payments.length === 0 && (body.advance || 0) > 0) {
      body.payments = [{ id: crypto.randomUUID(), at: body.createdAt || new Date().toISOString(), amount: Math.round(body.advance), mode: body.paymentMode, note: "Paid at intake", receiptNo: `${body.id}/R1` }];
    }
    body.advance = paymentsTotal(body.payments);
    const sync = await syncPartsStock({ branch: body.branch, status: "", stockTaken: [] }, body);
    try {
      return created(await createTicket({ ...body, stockTaken: sync.taken }));
    } catch (e) {
      await sync.undo();
      throw e;
    }
  });
}
