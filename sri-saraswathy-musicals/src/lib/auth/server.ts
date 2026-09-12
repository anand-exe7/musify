/**
 * Server-only session helpers. Import from Server Components and Route Handlers
 * (Node runtime). NOT edge-safe — `proxy.ts` uses `verifySessionToken` directly.
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type SessionUser } from "./session";
import { HttpError } from "@/lib/api/http";

/** The current signed-in user, or `null`. */
export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/** Require a signed-in user; throws a 401 otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new HttpError(401, "Sign in required");
  return user;
}

/** Require an admin user; throws 401/403 otherwise. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new HttpError(403, "Admin access required");
  return user;
}
