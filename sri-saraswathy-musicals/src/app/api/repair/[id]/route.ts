import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { getTicket, updateTicket, deleteTicket, cleanParts, applyPartsStock } from "@/lib/db/queries/repair";
import { recordServiceInvoice } from "@/lib/billing/ledger";
import { scopeByBranch } from "@/lib/auth/server";
import type { RepairTicket } from "@/lib/store/repair";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH body: { patch: Partial<RepairTicket>, eventLabel?: string }
type PatchBody = { patch?: Partial<RepairTicket>; eventLabel?: string } | Partial<RepairTicket>;

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ access }) => {
    const { id } = await ctx.params;
    const found = await getTicket(id);
    const t = found && scopeByBranch([found], access).length ? found : undefined;
    return t ? ok(t) : notFound("Ticket not found");
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ access }) => {
    const { id } = await ctx.params;
    const existing = await getTicket(id);
    if (!existing || !scopeByBranch([existing], access).length) return notFound("Ticket not found");
    const body = await readJson<PatchBody>(request);
    // Accept either a bare patch or `{ patch, eventLabel }`.
    const patch = "patch" in body && body.patch ? body.patch : (body as Partial<RepairTicket>);
    const eventLabel = "eventLabel" in body ? body.eventLabel : undefined;
    // Products sold during the service leave this branch's stock (and come back if removed).
    let undoStock: (() => Promise<void>) | undefined;
    if (patch.parts !== undefined) {
      patch.parts = cleanParts(patch.parts);
      undoStock = await applyPartsStock(existing.branch, existing.parts ?? [], patch.parts);
    }
    let t;
    try {
      t = await updateTicket(id, patch, eventLabel);
    } catch (e) {
      await undoStock?.();
      throw e;
    }
    // Once a repair is billable, mirror it into the sequential GST tax ledger
    // (best-effort & idempotent — never blocks the update).
    if (t) await recordServiceInvoice(t);
    return t ? ok(t) : notFound("Ticket not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    return (await deleteTicket(id)) ? noContent() : notFound("Ticket not found");
  });
}
