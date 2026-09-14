import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getTickets, createTicket } from "@/lib/db/queries/repair";
import { requireAdminAccess, scopeByBranch } from "@/lib/auth/server";
import type { RepairTicket } from "@/lib/store/repair";

export const dynamic = "force-dynamic";

/** Repair tickets — admin or branch staff (scoped to their branch). */
export function GET() {
  return handle(async () => {
    const access = await requireAdminAccess();
    return ok(scopeByBranch(await getTickets(), access));
  });
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const access = await requireAdminAccess();
    const body = await readJson<RepairTicket>(request);
    if (!body?.id) return badRequest("Repair ticket requires `id`");
    // A branch user can only file tickets for their own branch.
    if (access !== "all") body.branch = access;
    return created(await createTicket(body));
  });
}
