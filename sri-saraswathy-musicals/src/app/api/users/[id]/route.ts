import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { getUser, updateUser, deleteUser } from "@/lib/db/queries/users";
import { requireAdmin } from "@/lib/auth/server";
import type { User } from "@/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const u = await getUser(id);
    return u ? ok(u) : notFound("User not found");
  });
}

// Grants role/branch/admin access — full admins only.
export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    const patch = await readJson<Partial<User>>(request);
    const u = await updateUser(id, patch);
    return u ? ok(u) : notFound("User not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    return (await deleteUser(id)) ? noContent() : notFound("User not found");
  });
}
