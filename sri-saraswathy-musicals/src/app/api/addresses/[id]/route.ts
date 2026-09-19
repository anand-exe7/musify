import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/server";
import { getUserAddress, updateUserAddress, deleteUserAddress } from "@/lib/db/queries/addresses";
import type { UserAddress } from "@/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const addr = await getUserAddress(id);
    if (!addr || addr.userId !== user.id) return notFound("Address not found");
    return ok(addr);
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const patch = await request.json().catch(() => ({})) as Partial<UserAddress>;
    const addr = await updateUserAddress(id, user.id, patch);
    return addr ? ok(addr) : notFound("Address not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    return (await deleteUserAddress(id, user.id)) ? noContent() : notFound("Address not found");
  });
}
