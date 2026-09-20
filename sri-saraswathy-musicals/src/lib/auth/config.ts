/**
 * Auth configuration derived from environment variables. See `.env.example`
 * and `AUTH.md` for how to obtain each value.
 */

/** Base URL of the app, used to build the OAuth redirect URI. */
export function appUrl(): string {
  // If we are in the browser, always use the current origin
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }
  
  // Server-side fallbacks (Vercel automatic env vars)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // Custom env or localhost
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function googleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: `${appUrl()}/api/auth/callback/google`,
  };
}

/** Whether Google OAuth env is present — lets the UI show a helpful message
 *  instead of bouncing the user to a broken Google screen. */
export function isGoogleConfigured(): boolean {
  const { clientId, clientSecret } = googleConfig();
  return Boolean(clientId && clientSecret);
}
