import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { getTicket, updateTicket, deleteTicket } from "@/lib/db/queries/repair";
import { recordServiceInvoice } from "@/lib/billing/ledger";
import type { RepairTicket } from "@/lib/store/repair";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH body: { patch: Partial<RepairTicket>, eventLabel?: string }
type PatchBody = { patch?: Partial<RepairTicket>; eventLabel?: string } | Partial<RepairTicket>;

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const t = await getTicket(id);
    return t ? ok(t) : notFound("Ticket not found");
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson<PatchBody>(request);
    // Accept either a bare patch or `{ patch, eventLabel }`.
    const patch = "patch" in body && body.patch ? body.patch : (body as Partial<RepairTicket>);
    const eventLabel = "eventLabel" in body ? body.eventLabel : undefined;
    const t = await updateTicket(id, patch, eventLabel);
    // Once a repair is billable, mirror it into the sequential GST tax ledger
    // (best-effort & idempotent — never blocks the update).
    if (t) await recordServiceInvoice(t);
    return t ? ok(t) : notFound("Ticket not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    return (await deleteTicket(id)) ? noContent() : notFound("Ticket not found");
  });
}
