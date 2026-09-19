import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, badRequest, readJson } from "@/lib/api/http";
import { getUser, updateUser, deleteUser } from "@/lib/db/queries/users";
import { requireAdmin, requireUser } from "@/lib/auth/server";
import type { User } from "@/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/users/[id]
 * Full admins can fetch any user. A signed-in user can fetch their own profile.
 */
export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await requireUser();
    const { id } = await ctx.params;
    // Only allow fetching own profile, or admin fetching anyone's.
    if (session.id !== id && !session.isAdmin) {
      return notFound("User not found");
    }
    const u = await getUser(id);
    return u ? ok(u) : notFound("User not found");
  });
}

/**
 * PATCH /api/users/[id]
 * Full admins can change anything (role/branch/admin flags).
 * A non-admin user can only update their own safe fields (name, phone).
 */
export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await requireUser();
    const { id } = await ctx.params;

    // Ensure caller owns this record or is admin.
    if (session.id !== id && !session.isAdmin) {
      return notFound("User not found");
    }

    const patch = await readJson<Partial<User>>(request);

    // Non-admins may only change name and phone — never role/isAdmin/permissions.
    if (!session.isAdmin) {
      const safePatch: Partial<User> = {};
      if (patch.name !== undefined) safePatch.name = patch.name;
      if (patch.phone !== undefined) safePatch.phone = patch.phone;
      if (Object.keys(safePatch).length === 0) return badRequest("Nothing to update");
      const u = await updateUser(id, safePatch);
      return u ? ok(u) : notFound("User not found");
    }

    // Full admin — allow any field.
    const u = await updateUser(id, patch);
    return u ? ok(u) : notFound("User not found");
  });
}

/** DELETE — admin only */
export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await ctx.params;
    return (await deleteUser(id)) ? noContent() : notFound("User not found");
  });
}
