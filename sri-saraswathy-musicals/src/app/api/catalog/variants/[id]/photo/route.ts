import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handle } from "@/lib/api/http";
import { variantPhotoById } from "@/lib/db/queries/variants";
import { photoResponse } from "@/lib/api/photo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** One variant's photo as a real image, for the storefront (no sign-in). See the gallery route alongside it. */
export function GET(request: NextRequest, ctx: Ctx) {
  return handle("public", async () => {
    const { id } = await ctx.params;
    const photo = await variantPhotoById(id);
    return photo ? photoResponse(photo, request) : new NextResponse(null, { status: 404 });
  });
}
