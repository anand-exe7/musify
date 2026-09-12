import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getPosCategories, addPosCategory } from "@/lib/db/queries/pos";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok(await getPosCategories()));
}

// POST { name: string }
export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<{ name?: string }>(request);
    if (!body?.name) return badRequest("Category requires `name`");
    await addPosCategory(body.name);
    return created({ name: body.name });
  });
}
