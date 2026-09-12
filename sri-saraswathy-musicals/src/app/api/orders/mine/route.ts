import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/auth/server";
import { getOrdersByUser } from "@/lib/db/queries/orders";

export const dynamic = "force-dynamic";

/** The signed-in customer's own orders — used by the profile page. */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    return ok(await getOrdersByUser(user.id));
  });
}
