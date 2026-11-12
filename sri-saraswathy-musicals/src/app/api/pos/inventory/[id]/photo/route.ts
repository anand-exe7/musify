import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handle } from "@/lib/api/http";
import { productListPhoto } from "@/lib/db/queries/variants";
import { photoResponse } from "@/lib/api/photo";

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
    return photoResponse(photo, request);
  });
}
