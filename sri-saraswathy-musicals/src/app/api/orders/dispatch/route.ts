import { handle, ok } from "@/lib/api/http";
import { getPendingDispatch } from "@/lib/db/queries/orders";
import { scopeByBranch } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Orders not yet dispatched, soonest deadline first — what the admin dispatch alert reads. */
export function GET() {
  return handle("staff", async ({ access }) => ok(scopeByBranch(await getPendingDispatch(), access)));
}
