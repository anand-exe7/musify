import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getInvoices, createInvoice } from "@/lib/db/queries/invoices";
import { requireAdmin } from "@/lib/auth/server";
import type { Invoice } from "@/types";

export const dynamic = "force-dynamic";

/** The unified sales/tax ledger (web + POS) — admin only. */
export function GET() {
  return handle(async () => {
    await requireAdmin();
    return ok(await getInvoices());
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
