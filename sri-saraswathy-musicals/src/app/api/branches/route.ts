import { handle, ok } from "@/lib/api/http";
import { getBranches } from "@/lib/db/queries/branches";
import { requireAdminAccess } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Branch directory (name, address, per-branch GSTIN) — admin or branch staff. */
export function GET() {
  return handle(async () => {
    await requireAdminAccess();
    return ok(await getBranches());
  });
}
