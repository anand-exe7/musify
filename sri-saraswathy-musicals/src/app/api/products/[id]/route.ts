import type { NextRequest } from "next/server";
import { handle, ok, notFound, readJson, noContent } from "@/lib/api/http";
import { getProductById, updateProduct, deleteProduct } from "@/lib/db/queries/products";
import type { Product } from "@/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const product = await getProductById(id);
    return product ? ok(product) : notFound("Product not found");
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Product>>(request);
    const updated = await updateProduct(id, patch);
    return updated ? ok(updated) : notFound("Product not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return (await deleteProduct(id)) ? noContent() : notFound("Product not found");
  });
}
