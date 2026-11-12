import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getPosCategories, getPosCategoryRows, addPosCategory } from "@/lib/db/queries/pos";

export const dynamic = "force-dynamic";

/** `?view=full` lists each category with its enabled flag; the plain list stays a list of names. */
export function GET(request: NextRequest) {
  return handle("staff", async () =>
    ok(request.nextUrl.searchParams.get("view") === "full" ? await getPosCategoryRows() : await getPosCategories()),
  );
}

// POST { name: string }
export function POST(request: NextRequest) {
  return handle("admin", async () => {
    const body = await readJson<{ name?: string }>(request);
    if (!body?.name) return badRequest("Category requires `name`");
    await addPosCategory(body.name);
    return created({ name: body.name });
  });
}
