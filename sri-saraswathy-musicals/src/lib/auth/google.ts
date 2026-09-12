/**
 * Minimal Google OAuth 2.0 (Authorization Code flow) helpers. No SDK — just the
 * three documented endpoints. See https://developers.google.com/identity/openid-connect/openid-connect
 */
import { googleConfig } from "./config";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export interface GoogleUser {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

/** Build the Google consent URL to redirect the user to. `state` is echoed back
 *  to the callback for CSRF protection. */
export function googleAuthUrl(state: string): string {
  const { clientId, redirectUri } = googleConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Exchange an authorization code for tokens, returning the access token. */
async function exchangeCode(code: string): Promise<string> {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google token exchange returned no access_token");
  return data.access_token;
}

/** Fetch the authenticated user's profile from Google's userinfo endpoint. */
async function fetchUser(accessToken: string): Promise<GoogleUser> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo failed (${res.status})`);
  const p = (await res.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  return {
    sub: p.sub,
    email: p.email,
    emailVerified: p.email_verified ?? false,
    name: p.name || p.email,
    picture: p.picture,
  };
}

/** Full round-trip: code → access token → Google profile. */
export async function getGoogleUserFromCode(code: string): Promise<GoogleUser> {
  const accessToken = await exchangeCode(code);
  return fetchUser(accessToken);
}
