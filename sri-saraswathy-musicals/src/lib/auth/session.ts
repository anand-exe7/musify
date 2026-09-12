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

export const SESSION_COOKIE = "ssm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  avatar?: string | null;
}

/** HMAC key for signing/verifying. Falls back to an insecure dev secret so the
 *  app still boots before `AUTH_SECRET` is configured — but never in production. */
function secretKey(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV !== "production" ? "dev-insecure-secret-change-me" : "");
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
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      isAdmin: payload.isAdmin === true,
      avatar: (payload.avatar as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
