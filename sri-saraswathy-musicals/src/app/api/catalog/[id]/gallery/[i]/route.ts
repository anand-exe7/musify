import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handle } from "@/lib/api/http";
import { galleryPhoto } from "@/lib/db/queries/variants";
import { photoResponse } from "@/lib/api/photo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; i: string }> };

/**
 * One gallery slot of a product, as a real image, for the STOREFRONT (no sign-in).
 * Photos are stored as data URLs; serving them here instead of inside the catalogue JSON is what keeps the
 * shop, a product page and the cart small — and the browser caches each one, since the `?v=` fingerprint in
 * the URL changes only when the photo does.
 */
export function GET(request: NextRequest, ctx: Ctx) {
  return handle("public", async () => {
    const { id, i } = await ctx.params;
    const photo = await galleryPhoto(id, Number(i) || 0);
    return photo ? photoResponse(photo, request) : new NextResponse(null, { status: 404 });
  });
}
