import type { NextRequest } from "next/server";
import { handle, ok, notFound, readJson } from "@/lib/api/http";
import { getQuotation } from "@/lib/db/queries/quotations";
import { convertQuotation } from "@/lib/db/queries/quotationConvert";
import { branchAllowed } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/quotations/:id/convert  { payments: [{ method, amount }] } — make the quotation a real, stock-reducing sale. */
export function POST(request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ access }) => {
    const { id } = await ctx.params;
    const q = await getQuotation(id);
    if (!q || !branchAllowed(access, q.branch)) return notFound("Quotation not found");
    const body = await readJson<{ payments?: unknown }>(request);
    const result = await convertQuotation(id, body.payments ?? []);
    return result ? ok(result) : notFound("Quotation not found");
  });
}
