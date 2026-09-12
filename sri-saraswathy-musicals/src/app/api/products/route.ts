import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import {
  getAllProducts,
  getProductsByCategory,
  getFeaturedProducts,
  getBestSellers,
  createProduct,
} from "@/lib/db/queries/products";
import type { Product } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/products?category=&featured=&bestSeller=
export function GET(request: NextRequest) {
  return handle(async () => {
    const sp = request.nextUrl.searchParams;
    if (sp.get("featured") === "true") return ok(await getFeaturedProducts());
    if (sp.get("bestSeller") === "true") return ok(await getBestSellers());
    const category = sp.get("category");
    if (category) return ok(await getProductsByCategory(category));
    return ok(await getAllProducts());
  });
}

// POST /api/products
export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<Product>(request);
    if (!body?.id || !body?.slug) return badRequest("Product requires `id` and `slug`");
    return created(await createProduct(body));
  });
}
