import type { NextRequest } from "next/server";
import { handle, ok, notFound } from "@/lib/api/http";
import { getProductBySlug } from "@/lib/db/queries/products";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const product = await getProductBySlug(slug);
    return product ? ok(product) : notFound("Product not found");
  });
}
