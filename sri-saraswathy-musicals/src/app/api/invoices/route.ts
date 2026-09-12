import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getInvoices, createInvoice } from "@/lib/db/queries/invoices";
import type { Invoice } from "@/types";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok(await getInvoices()));
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<Invoice>(request);
    if (!body?.id) return badRequest("Invoice requires `id`");
    return created(await createInvoice(body));
  });
}
