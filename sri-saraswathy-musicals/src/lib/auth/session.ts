/**
 * Session token — a signed, httpOnly cookie that stands in for a server-side
 * session store. Kept dependency-light and **edge-safe** (only `jose`, no
 * `next/headers`, no database) so it can be imported from `proxy.ts`, Route
 * Handlers and Server Components alike.
 *
 * The token carries just enough to render the header and gate routes without a
 * database round-trip: the user id, email, name, avatar and the authoritative
 * `isAdmin` flag (computed from the DB + the admin allowlist at sign-in time).
 */
import { SignJWT, jwtVerify } from "jose";
import { isBranch } from "@/lib/stock";

export const SESSION_COOKIE = "ssm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

export type BranchKey = string;
/** Admin-area reach: "all" = full admin, a list of branches = scoped to those, null = none. */
export type AdminAccess = "all" | BranchKey[] | null;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  /** Primary branch (null for full admins and customers). */
  branch?: BranchKey | null;
  /** Every branch the user may work in (empty for full admins and customers). */
  branches?: BranchKey[];
  avatar?: string | null;
}

/** The branches a non-admin may work in, from their stored primary + access list. */
export function branchesOf(u: { branch?: string | null; branchAccess?: string[] | null }): BranchKey[] {
  return [...new Set([...(u.branchAccess ?? []), ...(u.branch ? [u.branch] : [])])].filter((b) => isBranch(b));
}

/**
 * Resolve a user's admin-area reach from their flags: full admins see every
 * branch ("all"); a non-admin with branches assigned is scoped to those; everyone
 * else (plain customers) gets no admin access. This is the single place the rule
 * lives — the proxy and the admin UI both derive from it.
 */
export function adminAccessOf(u: { isAdmin: boolean; branches?: BranchKey[]; branch?: BranchKey | null } | null): AdminAccess {
  if (!u) return null;
  if (u.isAdmin) return "all";
  const list = u.branches && u.branches.length > 0 ? u.branches : u.branch ? [u.branch] : [];
  return list.length > 0 ? list : null;
}

/** May `access` act on `branch`? Full admins may; branch users only on their own. */
export function branchAllowed(access: AdminAccess, branch: unknown): boolean {
  if (access === "all") return true;
  return Array.isArray(access) && typeof branch === "string" && access.includes(branch);
}

/** The branch a new record defaults to for this access (first allowed one). */
export function primaryBranchOf(access: AdminAccess, fallback: BranchKey): BranchKey {
  return Array.isArray(access) && access.length > 0 ? access[0] : fallback;
}

/** HMAC key for signing/verifying (also used for checkout drafts). There is
 *  deliberately NO fallback: a committed default secret would let anyone mint an
 *  admin cookie, so a missing `AUTH_SECRET` fails hard in every environment. */
export function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and add it to .env.local.",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Sign a session token for the given user (valid for {@link SESSION_MAX_AGE}). */
export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    branch: user.branch ?? null,
    branches: user.branches ?? [],
    avatar: user.avatar ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

/** Verify and decode a session token. Returns `null` for missing/invalid/expired. */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  // Resolve the key first and outside the try: a missing secret must surface as
  // an error, not read as "everyone is signed out".
  const key = secretKey();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub) return null;
    const branch = isBranch(payload.branch) ? payload.branch : null;
    const branches = Array.isArray(payload.branches) ? (payload.branches as unknown[]).filter(isBranch) : [];
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      isAdmin: payload.isAdmin === true,
      branch,
      branches,
      avatar: (payload.avatar as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
