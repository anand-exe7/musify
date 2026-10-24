import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getTickets, createTicket, cleanParts, syncPartsStock } from "@/lib/db/queries/repair";
import { scopeByBranch } from "@/lib/auth/server";
import type { RepairTicket } from "@/lib/store/repair";
import { branchAllowed, primaryBranchOf } from "@/lib/auth/session";
import { DEFAULT_BRANCH } from "@/lib/stock";

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
    body.parts = cleanParts(body.parts ?? []);
    delete body.stockTaken;
    const sync = await syncPartsStock({ branch: body.branch, status: "", stockTaken: [] }, body);
    try {
      return created(await createTicket({ ...body, stockTaken: sync.taken }));
    } catch (e) {
      await sync.undo();
      throw e;
    }
  });
}
