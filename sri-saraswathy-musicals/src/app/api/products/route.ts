import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import {
  getStorefrontProducts,
  getProductsByCategory,
  getFeaturedProducts,
  getBestSellers,
  getStorefrontPage,
  getStorefrontProductsByIds,
  createProduct,
} from "@/lib/db/queries/products";
import type { Product } from "@/types";

export const dynamic = "force-dynamic";

// GET /api/products?category=&featured=&bestSeller=
// GET /api/products?ids=a,b,c  → just those products (cart, wishlist)
// GET /api/products?page=1&pageSize=12&category=&origin=&maxPrice=&q=&sort=  → one page: { items, total, page, pageSize, pages }
// Storefront-facing: only `active` products are returned (the admin kill switch).
export function GET(request: NextRequest) {
  return handle("public", async () => {
    const sp = request.nextUrl.searchParams;
    if (sp.has("ids")) return ok(await getStorefrontProductsByIds((sp.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean)));
    if (sp.has("page") || sp.has("pageSize")) {
      return ok(await getStorefrontPage({
        category: sp.get("category") ?? undefined,
        origin: sp.get("origin") ?? undefined,
        maxPrice: sp.has("maxPrice") ? Number(sp.get("maxPrice")) : undefined,
        q: sp.get("q") ?? undefined,
        sort: sp.get("sort") ?? undefined,
        page: Number(sp.get("page")) || 1,
        pageSize: Number(sp.get("pageSize")) || 12,
      }));
    }
    if (sp.get("featured") === "true") return ok(await getFeaturedProducts());
    if (sp.get("bestSeller") === "true") return ok(await getBestSellers());
    const category = sp.get("category");
    if (category) return ok(await getProductsByCategory(category));
    return ok(await getStorefrontProducts());
  });
}

// POST /api/products
export function POST(request: NextRequest) {
  return handle("admin", async () => {
    const body = await readJson<Product>(request);
    if (!body?.id || !body?.slug) return badRequest("Product requires `id` and `slug`");
    return created(await createProduct(body));
  });
}
