import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson } from "@/lib/api/http";
import { getInvoice, updateInvoice, cancelInvoice } from "@/lib/db/queries/invoices";
import { HttpError } from "@/lib/api/errors";
import type { Invoice } from "@/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    const inv = await getInvoice(id);
    return inv ? ok(inv) : notFound("Invoice not found");
  });
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Invoice>>(request);
    const current = await getInvoice(id);
    if (!current) return notFound("Invoice not found");
    // A cancelled invoice's sale has been undone (stock back, out of revenue) — it can't be switched back on.
    if (current.status === "cancelled" && patch.status !== undefined && patch.status !== "cancelled") {
      throw new HttpError(409, "A cancelled invoice can't be made active again. Raise a new bill instead.");
    }
    // Choosing "Cancelled" in the editor goes through the same cancel as the Cancel button, so the stock comes back.
    if (current.status !== "cancelled" && patch.status === "cancelled") {
      const rest: Partial<Invoice> = { ...patch };
      delete rest.status;
      await cancelInvoice(id);
      const inv = Object.keys(rest).length > 0 ? await updateInvoice(id, rest) : await getInvoice(id);
      return inv ? ok(inv) : notFound("Invoice not found");
    }
    const inv = await updateInvoice(id, patch);
    return inv ? ok(inv) : notFound("Invoice not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    // An invoice is never erased (its number would leave a gap); "delete" cancels it.
    const inv = await cancelInvoice(id);
    return inv ? ok(inv) : notFound("Invoice not found");
  });
}
