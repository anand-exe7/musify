import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { getInquiry, updateInquiry, deleteInquiry } from "@/lib/db/queries/inquiries";
import type { Inquiry } from "@/lib/store/inquiry";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const i = await getInquiry(id);
    return i ? ok(i) : notFound("Inquiry not found");
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Inquiry>>(request);
    const i = await updateInquiry(id, patch);
    return i ? ok(i) : notFound("Inquiry not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return (await deleteInquiry(id)) ? noContent() : notFound("Inquiry not found");
  });
}
