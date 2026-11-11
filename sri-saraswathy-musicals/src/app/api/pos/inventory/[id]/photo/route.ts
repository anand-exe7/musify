import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handle } from "@/lib/api/http";
import { productListPhoto } from "@/lib/db/queries/variants";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * One product's list thumbnail as a real image. Photos are stored as data URLs in the database; serving them here
 * (instead of inside the catalogue JSON) keeps the catalogue small, and the browser caches each image — the
 * `?v=` fingerprint in the URL changes when the photo does.
 */
export function GET(request: NextRequest, ctx: Ctx) {
  return handle("staff", async () => {
    const { id } = await ctx.params;
    const photo = await productListPhoto(id);
    if (!photo) return new NextResponse(null, { status: 404 });
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(photo);
    if (!m) return NextResponse.redirect(new URL(photo, request.url), 302);
    const body = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
    return new NextResponse(new Uint8Array(body), {
      headers: { "Content-Type": m[1] || "image/webp", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  });
}
