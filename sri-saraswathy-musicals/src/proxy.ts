/**
 * Route gate (Next.js 16 renamed `middleware` → `proxy`). Runs before the
 * protected routes render and enforces:
 *   • /checkout, /profile  → must be signed in
 *   • /admin/*             → must be signed in AND an admin
 *
 * Only the signed session cookie is inspected (no DB call), so this stays fast
 * and edge-safe. The cookie carries the authoritative `isAdmin` flag baked in
 * at sign-in time.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

function redirectToLogin(request: NextRequest): NextResponse {
  const dest = request.nextUrl.pathname + request.nextUrl.search;
  const url = new URL("/auth/login", request.url);
  url.searchParams.set("redirect", dest);
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/admin")) {
    if (!session) return redirectToLogin(request);
    if (!session.isAdmin) return NextResponse.redirect(new URL("/?denied=admin", request.url));
    return NextResponse.next();
  }

  // /checkout and /profile — signed-in customers (or admins) only.
  if (!session) return redirectToLogin(request);
  return NextResponse.next();
}

export const config = {
  matcher: ["/checkout", "/checkout/:path*", "/profile", "/profile/:path*", "/admin", "/admin/:path*"],
};
