import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getBills, createBill } from "@/lib/db/queries/pos";
import type { Bill } from "@/lib/store/pos";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok(await getBills()));
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<Bill>(request);
    if (!body?.id) return badRequest("Bill requires `id`");
    return created(await createBill(body));
  });
}
