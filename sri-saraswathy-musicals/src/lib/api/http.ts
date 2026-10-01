/**
 * Small helpers for JSON Route Handlers — consistent responses and a `handle`
 * wrapper that enforces an access level, then turns thrown errors into a 500
 * (and `HttpError`s into their chosen status) so individual handlers stay
 * focused on the happy path.
 */
import { NextResponse } from "next/server";
import { HttpError } from "./errors";
import { requireUser, requireAdminUser, type AdminAuth } from "@/lib/auth/server";
import type { SessionUser, AdminAccess } from "@/lib/auth/session";

export { HttpError };

export const ok = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);
export const created = <T>(data: T) => NextResponse.json(data, { status: 201 });
export const noContent = () => new NextResponse(null, { status: 204 });

export const badRequest = (message = "Bad request") =>
  NextResponse.json({ error: message }, { status: 400 });
export const notFound = (message = "Not found") =>
  NextResponse.json({ error: message }, { status: 404 });

/**
 * Who may call a route. Every `handle` call must pick one, so a new route can't
 * ship unguarded by accident.
 *  - `public` — anyone, signed in or not
 *  - `user`   — any signed-in, active user
 *  - `staff`  — a full admin OR a branch-scoped staff member (narrow the data
 *               with `scopeByBranch`)
 *  - `admin`  — full admins only
 */
export type Access = "public" | "user" | "staff" | "admin";

/** What a guarded handler receives. `public` routes get nothing. */
export type AuthFor<A extends Access> = A extends "public"
  ? undefined
  : A extends "user"
    ? { user: SessionUser; access: AdminAccess }
    : A extends "staff"
      ? AdminAuth
      : { user: SessionUser; access: "all" };

/**
 * Wrap a handler body: enforce `access` first (re-checking the user against the
 * database — a stale cookie never outranks the DB), then run `fn`, converting
 * thrown errors into JSON error responses.
 */
export async function handle<A extends Access>(
  access: A,
  fn: (auth: AuthFor<A>) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    let auth: unknown;
    if (access === "user") {
      const user = await requireUser();
      auth = { user, access: user.isAdmin ? "all" : (user.branch ?? null) };
    } else if (access === "staff") {
      auth = await requireAdminUser();
    } else if (access === "admin") {
      const a = await requireAdminUser();
      if (a.access !== "all") throw new HttpError(403, "Admin access required");
      auth = a;
    }
    return await fn(auth as AuthFor<A>);
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error("[api] unhandled error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Parse a JSON request body, throwing a 400 on malformed input. */
export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
