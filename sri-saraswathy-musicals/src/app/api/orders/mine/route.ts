import { handle, ok } from "@/lib/api/http";
import { getOrdersByUser } from "@/lib/db/queries/orders";

export const dynamic = "force-dynamic";

/** The signed-in customer's own orders — used by the profile page. */
export function GET() {
  return handle("user", async ({ user }) => {
    return ok(await getOrdersByUser(user.id));
  });
}
