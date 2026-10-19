import { handle, ok } from "@/lib/api/http";
import { getOrderAlerts } from "@/lib/db/queries/orders";

export const dynamic = "force-dynamic";

/** GET /api/orders/alerts — online orders still waiting to be shipped (count + the latest few). Light enough to poll;
 *  branch staff only see their own branches' orders. */
export function GET() {
  return handle("staff", async ({ access }) => ok(await getOrderAlerts(access === "all" ? null : (access as string[]))));
}
