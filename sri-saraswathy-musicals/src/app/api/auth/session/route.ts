import { NextResponse } from "next/server";
import { handle, ok } from "@/lib/api/http";
import { getSession } from "@/lib/auth/server";
import { getUser } from "@/lib/db/queries/users";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/session
 *
 * Returns the current signed-in user (or `{ user: null }`). Also does a live
 * DB lookup on every call to pick up permission changes (e.g. is_admin toggled
 * by an admin) without requiring the user to log out and back in. If the DB
 * values differ from the cookie, the cookie is refreshed in the same response.
 */
export function GET() {
  return handle(async () => {
    const session = await getSession();

    if (!session) {
      return ok({ user: null });
    }

    // Live DB check — picks up is_admin / branch changes immediately.
    let freshUser;
    try {
      freshUser = await getUser(session.id);
    } catch {
      // DB unreachable — fall back to cookie values so the app stays usable.
      return ok({ user: session });
    }

    if (!freshUser) {
      // User was deleted from the DB — treat as signed-out.
      return ok({ user: null });
    }

    const sessionUser = {
      id: freshUser.id,
      email: freshUser.email,
      name: freshUser.name,
      isAdmin: freshUser.isAdmin,
      branch:
        freshUser.branch === "Branch 1" || freshUser.branch === "Branch 2"
          ? freshUser.branch
          : null,
      avatar: freshUser.avatar ?? null,
    } as const;

    // Check whether the cookie needs refreshing (isAdmin or branch changed).
    const needsRefresh =
      session.isAdmin !== sessionUser.isAdmin ||
      session.branch !== sessionUser.branch;

    if (needsRefresh) {
      // Re-issue the session cookie with the updated values.
      const newToken = await createSessionToken(sessionUser);
      const res = NextResponse.json({ user: sessionUser });
      res.cookies.set(SESSION_COOKIE, newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE,
      });
      return res;
    }

    return ok({ user: sessionUser });
  });
}
