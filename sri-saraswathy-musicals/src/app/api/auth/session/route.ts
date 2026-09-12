import { handle, ok } from "@/lib/api/http";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** The current signed-in user (or `{ user: null }`). Consumed by the client
 *  auth store to hydrate the header/profile. */
export function GET() {
  return handle(async () => ok({ user: await getSession() }));
}
