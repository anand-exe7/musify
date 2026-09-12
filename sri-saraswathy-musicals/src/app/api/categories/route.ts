import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getCategories, upsertCategory, type CategoryItem } from "@/lib/db/queries/categories";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok(await getCategories()));
}

// POST upserts by `id`.
export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<CategoryItem>(request);
    if (!body?.id) return badRequest("Category requires `id`");
    return created(await upsertCategory(body));
  });
}
