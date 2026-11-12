/**
 * Photos are stored as data URLs. Routes that serve one hand back real image bytes so the browser can cache it,
 * instead of the data URL travelling inside a JSON list every time the list is read.
 */
import { NextResponse } from "next/server";

const DATA_URL = /^data:([^;,]+)(;base64)?,(.*)$/s;

export function photoResponse(photo: string, request: { url: string }): NextResponse {
  const m = DATA_URL.exec(photo);
  // A plain URL (seeded catalogue images) is not ours to serve — point the browser at it.
  if (!m) return NextResponse.redirect(new URL(photo, request.url), 302);
  const body = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
  return new NextResponse(new Uint8Array(body), {
    headers: { "Content-Type": m[1] || "image/webp", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
