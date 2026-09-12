import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getTickets, createTicket } from "@/lib/db/queries/repair";
import type { RepairTicket } from "@/lib/store/repair";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ok(await getTickets()));
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const body = await readJson<RepairTicket>(request);
    if (!body?.id) return badRequest("Repair ticket requires `id`");
    return created(await createTicket(body));
  });
}
