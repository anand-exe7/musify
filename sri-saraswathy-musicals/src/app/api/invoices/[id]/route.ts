import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { getInvoice, updateInvoice, deleteInvoice } from "@/lib/db/queries/invoices";
import type { Invoice } from "@/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const inv = await getInvoice(id);
    return inv ? ok(inv) : notFound("Invoice not found");
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Invoice>>(request);
    const inv = await updateInvoice(id, patch);
    return inv ? ok(inv) : notFound("Invoice not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return (await deleteInvoice(id)) ? noContent() : notFound("Invoice not found");
  });
}
