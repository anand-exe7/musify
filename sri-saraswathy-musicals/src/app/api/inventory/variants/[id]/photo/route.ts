import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handle } from "@/lib/api/http";
import { variantPhoto } from "@/lib/db/queries/inventoryPage";
import { photoResponse } from "@/lib/api/photo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * One variant's photo as a real image. Variant photos are data URLs in the database; serving them here keeps
 * the variant list JSON small, and the browser caches each one (`?v=` changes when the photo does).
 */
export function GET(request: NextRequest, ctx: Ctx) {
  return handle("staff", async () => {
    const { id } = await ctx.params;
    const photo = await variantPhoto(id);
    return photo ? photoResponse(photo, request) : new NextResponse(null, { status: 404 });
  });
}
