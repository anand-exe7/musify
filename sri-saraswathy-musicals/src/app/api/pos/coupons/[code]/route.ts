import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { updateCoupon, deleteCoupon } from "@/lib/db/queries/pos";
import type { Coupon } from "@/lib/store/pos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { code } = await ctx.params;
    const patch = await readJson<Partial<Coupon>>(request);
    const c = await updateCoupon(code, patch);
    return c ? ok(c) : notFound("Coupon not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { code } = await ctx.params;
    return (await deleteCoupon(code)) ? noContent() : notFound("Coupon not found");
  });
}
