import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getInvoices, createInvoice } from "@/lib/db/queries/invoices";
import { requireAdmin, requireAdminAccess, scopeByBranch } from "@/lib/auth/server";
import type { Invoice } from "@/types";

export const dynamic = "force-dynamic";

/** The unified sales/tax ledger (web + POS) — admin or branch staff (scoped). */
export function GET() {
  return handle(async () => {
    const access = await requireAdminAccess();
    return ok(scopeByBranch(await getInvoices(), access));
  });
}

export function POST(request: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const body = await readJson<Invoice>(request);
    if (!body?.id) return badRequest("Invoice requires `id`");
    return created(await createInvoice(body));
  });
}
