/**
 * Post-login redirect targets must stay on this site. Browsers treat `\` like
 * `/` in URLs, so `/\evil.com` is protocol-relative and would leave the origin
 * even though it starts with a single `/` — hence the explicit backslash ban
 * and the origin comparison, instead of a prefix check alone.
 */
const FALLBACK = "/profile";
const BASE = "http://redirect-check.invalid";

export function safeRedirect(target: string | null | undefined, fallback = FALLBACK): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return fallback;
  // Backslashes and control characters (tab/newline are stripped by URL parsers).
  if (/[\\\u0000-\u001f\u007f]/.test(target)) return fallback;
  try {
    const url = new URL(target, BASE);
    if (url.origin !== BASE) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
