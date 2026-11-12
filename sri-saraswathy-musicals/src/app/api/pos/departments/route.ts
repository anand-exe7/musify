import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getPosDepartments, getPosDepartmentRows, addPosDepartment } from "@/lib/db/queries/pos";

export const dynamic = "force-dynamic";

/** `?view=full` lists each department with its enabled flag; the plain list is just names. */
export function GET(request: NextRequest) {
  return handle("staff", async () =>
    ok(request.nextUrl.searchParams.get("view") === "full" ? await getPosDepartmentRows() : await getPosDepartments()),
  );
}

// POST { name: string }
export function POST(request: NextRequest) {
  return handle("admin", async () => {
    const body = await readJson<{ name?: string }>(request);
    const name = body?.name?.trim();
    if (!name) return badRequest("Department requires `name`");
    await addPosDepartment(name);
    return created({ name });
  });
}
