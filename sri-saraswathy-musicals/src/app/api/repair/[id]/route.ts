import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson, badRequest } from "@/lib/api/http";
import { getTicket, updateTicket, deleteTicket, cleanParts, syncPartsStock, releaseTicketStock } from "@/lib/db/queries/repair";
import { recordServiceInvoice } from "@/lib/billing/ledger";
import { scopeByBranch } from "@/lib/auth/server";
import { lockRepairParts } from "@/lib/auth/catalogLines";
import type { RepairTicket } from "@/lib/store/repair";
import { cleanPayments, paymentsTotal } from "@/lib/billing/repairPayments";

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
    // What has been taken out of stock is the server's record, never the browser's.
    delete patch.stockTaken;
    // REP-04: the payment history is the record of what was paid; `advance` (amount paid) always follows it.
    if (patch.payments !== undefined) {
      try {
        patch.payments = cleanPayments(patch.payments);
      } catch (e) {
        return badRequest(e instanceof Error ? e.message : "Invalid payments");
      }
      patch.advance = paymentsTotal(patch.payments);
    } else if (patch.advance !== undefined && (existing.payments ?? []).length > 0) {
      delete patch.advance; // once payments are itemised, the total can only change by adding / removing a payment
    }
    // Branch staff add products from inventory only, at the catalogue price.
    if (patch.parts !== undefined) patch.parts = cleanParts(await lockRepairParts(patch.parts, access, existing.parts ?? []));
    // Products used in the repair leave this branch's stock once it is marked Ready, and go back if it is moved back,
    // cancelled or its list changes. A shortfall refuses the change and nothing moves.
    let undoStock: (() => Promise<void>) | undefined;
    if (patch.parts !== undefined || patch.status !== undefined || patch.branch !== undefined) {
      const sync = await syncPartsStock(existing, {
        branch: patch.branch ?? existing.branch,
        status: patch.status ?? existing.status,
        parts: patch.parts ?? existing.parts,
      });
      undoStock = sync.undo;
      patch.stockTaken = sync.taken;
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
    const existing = await getTicket(id);
    if (!existing) return notFound("Ticket not found");
    // Anything the ticket still holds in stock goes back before it disappears.
    const undoStock = await releaseTicketStock(existing);
    try {
      return (await deleteTicket(id)) ? noContent() : notFound("Ticket not found");
    } catch (e) {
      await undoStock();
      throw e;
    }
  });
}
