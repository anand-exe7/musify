import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { getInquiry, updateInquiry, deleteInquiry } from "@/lib/db/queries/inquiries";
import { scopeByBranch } from "@/lib/auth/server";
import type { Inquiry } from "@/lib/store/inquiry";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ access }) => {
    const { id } = await ctx.params;
    const found = await getInquiry(id);
    const i = found && scopeByBranch([found], access).length ? found : undefined;
    return i ? ok(i) : notFound("Inquiry not found");
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ access }) => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Inquiry>>(request);
    const existing = await getInquiry(id);
    if (!existing || !scopeByBranch([existing], access).length) return notFound("Inquiry not found");
    const i = await updateInquiry(id, patch);
    return i ? ok(i) : notFound("Inquiry not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    return (await deleteInquiry(id)) ? noContent() : notFound("Inquiry not found");
  });
}
