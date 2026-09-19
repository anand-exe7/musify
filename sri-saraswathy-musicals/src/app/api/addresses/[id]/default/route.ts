import type { NextRequest } from "next/server";
import { handle, ok, notFound } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/server";
import { setDefaultAddress } from "@/lib/db/queries/addresses";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function POST(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const addr = await setDefaultAddress(id, user.id);
    return addr ? ok(addr) : notFound("Address not found");
  });
}
