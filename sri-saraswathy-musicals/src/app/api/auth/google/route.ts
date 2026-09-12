import { NextResponse, type NextRequest } from "next/server";
import { googleAuthUrl } from "@/lib/auth/google";
import { isGoogleConfigured, appUrl } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

/** Only allow same-site relative redirect targets (prevents open-redirects). */
function safeRedirect(r: string | null): string {
  if (r && r.startsWith("/") && !r.startsWith("//")) return r;
  return "/profile";
}

/** Kick off Google sign-in: stash CSRF state + intended destination, then bounce
 *  the browser to Google's consent screen. */
export function GET(request: NextRequest) {
  const redirectTo = safeRedirect(request.nextUrl.searchParams.get("redirect"));

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/auth/login?error=not_configured", appUrl()));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(googleAuthUrl(state));

  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 minutes to complete the round-trip
  };
  res.cookies.set("ssm_oauth_state", state, cookie);
  res.cookies.set("ssm_oauth_redirect", redirectTo, cookie);
  return res;
}
