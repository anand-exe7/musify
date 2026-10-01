import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getUsers, createUser } from "@/lib/db/queries/users";
import type { User } from "@/types";

export const dynamic = "force-dynamic";

// The user roster carries emails and grants admin/branch access — full admins only.
export function GET() {
  return handle("admin", async () => {
    return ok(await getUsers());
  });
}

export function POST(request: NextRequest) {
  return handle("admin", async () => {
    const body = await readJson<User>(request);
    if (!body?.id || !body?.email) return badRequest("User requires `id` and `email`");
    return created(await createUser(body));
  });
}
