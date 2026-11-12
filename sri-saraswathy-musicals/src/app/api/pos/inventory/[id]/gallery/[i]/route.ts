import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handle } from "@/lib/api/http";
import { galleryPhoto } from "@/lib/db/queries/variants";
import { photoResponse } from "@/lib/api/photo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; i: string }> };

/** One slot of a product's photo gallery as a real image — what the product editor shows instead of a data URL. */
export function GET(request: NextRequest, ctx: Ctx) {
  return handle("staff", async () => {
    const { id, i } = await ctx.params;
    const photo = await galleryPhoto(id, Number(i) || 0);
    return photo ? photoResponse(photo, request) : new NextResponse(null, { status: 404 });
  });
}
