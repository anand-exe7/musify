/**
 * Server-only session helpers. Import from Server Components and Route Handlers
 * (Node runtime). NOT edge-safe — `proxy.ts` uses `verifySessionToken` directly.
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, adminAccessOf, type SessionUser, type AdminAccess, type BranchKey } from "./session";
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

/**
 * Require admin-area access — a full admin ("all") OR a branch-scoped staff
 * member (their branch key). Throws 401 if signed out, 403 for a plain
 * customer. Use this (not {@link requireAdmin}) on endpoints branch staff also
 * need, then narrow the payload with {@link scopeByBranch}.
 */
export async function requireAdminAccess(): Promise<"all" | BranchKey> {
  const user = await requireUser();
  const access = adminAccessOf(user);
  if (access === null) throw new HttpError(403, "Admin access required");
  return access;
}

/** Like {@link requireAdminAccess} but also returns the user (for `createdBy`
 *  audit fields). */
export async function requireAdminUser(): Promise<{ user: SessionUser; access: "all" | BranchKey }> {
  const user = await requireUser();
  const access = adminAccessOf(user);
  if (access === null) throw new HttpError(403, "Admin access required");
  return { user, access };
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
