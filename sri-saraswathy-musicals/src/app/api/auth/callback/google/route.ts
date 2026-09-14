import { NextResponse, type NextRequest } from "next/server";
import { getGoogleUserFromCode } from "@/lib/auth/google";
import { upsertGoogleUser } from "@/lib/db/queries/users";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/session";
import { appUrl } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

function loginError(code: string) {
  return NextResponse.redirect(new URL(`/auth/login?error=${code}`, appUrl()));
}

/** Google redirects here with `?code&state`. Verify state, resolve the user,
 *  set the session cookie, and return to wherever they were headed. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code) return loginError("oauth");

  const cookieState = request.cookies.get("ssm_oauth_state")?.value;
  if (!state || !cookieState || state !== cookieState) return loginError("state");

  let redirectTo = request.cookies.get("ssm_oauth_redirect")?.value || "/profile";
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) redirectTo = "/profile";

  try {
    const profile = await getGoogleUserFromCode(code);
    if (!profile.emailVerified) return loginError("unverified");

    const user = await upsertGoogleUser({
      googleId: profile.sub,
      email: profile.email,
      name: profile.name,
      avatar: profile.picture ?? null,
    });

    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      branch: user.branch === "Branch 1" || user.branch === "Branch 2" ? user.branch : null,
      avatar: user.avatar ?? null,
    });

    const res = NextResponse.redirect(new URL(redirectTo, appUrl()));
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    // Clear the one-shot OAuth cookies.
    res.cookies.set("ssm_oauth_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("ssm_oauth_redirect", "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("[auth] google callback failed:", err);
    return loginError("callback");
  }
}
