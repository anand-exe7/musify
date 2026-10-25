import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { HttpError } from "@/lib/api/errors";
import { getQuotation, updateQuotation, deleteQuotation, type QuotationInput } from "@/lib/db/queries/quotations";
import { branchAllowed } from "@/lib/auth/session";
import { lockQuoteLines } from "@/lib/auth/catalogLines";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ access }) => {
    const { id } = await ctx.params;
    const q = await getQuotation(id);
    if (!q || !branchAllowed(access, q.branch)) return notFound("Quotation not found");
    return ok(q);
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ access }) => {
    const { id } = await ctx.params;
    const current = await getQuotation(id);
    if (!current || !branchAllowed(access, current.branch)) return notFound("Quotation not found");
    const patch = await readJson<QuotationInput>(request);
    // Moving a quotation to another branch needs access to that branch too.
    if (patch.branch !== undefined && !branchAllowed(access, patch.branch)) throw new HttpError(403, "No access to that branch");
    if (patch.items) patch.items = await lockQuoteLines(patch.items, access);
    const q = await updateQuotation(id, patch);
    return q ? ok(q) : notFound("Quotation not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    return (await deleteQuotation(id)) ? noContent() : notFound("Quotation not found");
  });
}
