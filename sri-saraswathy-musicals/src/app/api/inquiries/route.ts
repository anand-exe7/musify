import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getInquiries, createInquiry } from "@/lib/db/queries/inquiries";
import type { Inquiry } from "@/lib/store/inquiry";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok(await getInquiries()));
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<Inquiry>(request);
    if (!body?.id || !body?.name) return badRequest("Inquiry requires `id` and `name`");
    return created(await createInquiry(body));
  });
}
