import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getStaff, createStaff } from "@/lib/db/queries/staff";
import type { Staff } from "@/lib/store/staff";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok(await getStaff()));
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<Staff>(request);
    if (!body?.id) return badRequest("Staff requires `id`");
    return created(await createStaff(body));
  });
}
