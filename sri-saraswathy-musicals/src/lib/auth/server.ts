/**
 * Server-only session helpers. Import from Server Components and Route Handlers
 * (Node runtime). NOT edge-safe — `proxy.ts` uses `verifySessionToken` directly.
 *
 * The session cookie is a 30-day signed token, so it can't be trusted for
 * authorisation on its own: someone fired or demoted after sign-in would keep
 * their old rights until it expired. Everything here that gates access
 * ({@link requireUser} and friends, {@link getVerifiedSession}) therefore
 * re-reads the user from the database and uses *that* — `active`, `isAdmin` and
 * `branch` — instead of the token's claims. {@link getSession} stays token-only
 * for places that just need to know who is probably signed in.
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, adminAccessOf, type SessionUser, type AdminAccess, type BranchKey } from "./session";
import { HttpError } from "@/lib/api/errors";
import { getUser } from "@/lib/db/queries/users";

/** The signed-in user per the cookie alone (NOT re-checked against the DB). */
export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/**
 * The signed-in user with live DB values, or `null` when signed out, deleted,
 * or deactivated. Throws if the database is unreachable — callers that gate
 * access must fail closed rather than fall back to the cookie.
 */
export async function getVerifiedSession(): Promise<SessionUser | null> {
  const claimed = await getSession();
  if (!claimed) return null;
  const fresh = await getUser(claimed.id);
  if (!fresh || fresh.active === false) return null;
  return {
    id: fresh.id,
    email: fresh.email,
    name: fresh.name,
    isAdmin: fresh.isAdmin === true,
    branch: fresh.branch === "Branch 1" || fresh.branch === "Branch 2" ? fresh.branch : null,
    avatar: fresh.avatar ?? null,
  };
}

/** Require a signed-in, active user; throws a 401 otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getVerifiedSession();
  if (!user) throw new HttpError(401, "Sign in required");
  return user;
}

/** Require an admin user; throws 401/403 otherwise. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new HttpError(403, "Admin access required");
  return user;
}

export interface AdminAuth {
  user: SessionUser;
  access: "all" | BranchKey;
}

/**
 * Require admin-area access — a full admin ("all") OR a branch-scoped staff
 * member (their branch key). Throws 401 if signed out, 403 for a plain
 * customer. Returns the user too (for `createdBy` audit fields); narrow the
 * payload with {@link scopeByBranch}.
 */
export async function requireAdminUser(): Promise<AdminAuth> {
  const user = await requireUser();
  const access = adminAccessOf(user);
  if (access === null) throw new HttpError(403, "Admin access required");
  return { user, access };
}

/** Like {@link requireAdminUser} but returns only the access level. */
export async function requireAdminAccess(): Promise<"all" | BranchKey> {
  return (await requireAdminUser()).access;
}

/**
 * Narrow branch-tagged rows to the caller's scope. A full admin ("all") sees
 * everything; a branch user sees only rows whose `branch` matches theirs
 * (rows with no branch are hidden from branch users — visible only to admins).
 */
export function scopeByBranch<T extends { branch?: string | null }>(rows: T[], access: AdminAccess): T[] {
  if (access === "all" || access === null) return rows;
  return rows.filter((r) => r.branch === access);
}
