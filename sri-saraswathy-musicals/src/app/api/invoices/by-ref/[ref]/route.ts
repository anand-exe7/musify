import type { NextRequest } from "next/server";
import { handle, ok, notFound } from "@/lib/api/http";
import { getInvoiceByRefId } from "@/lib/db/queries/invoices";
import { getBill } from "@/lib/db/queries/pos";
import { recordBillInvoice } from "@/lib/billing/ledger";
import { branchAllowed } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ ref: string }> };

/**
 * The tax invoice of a counter bill, by the bill's id — used by the billing screen to print / share the bill it
 * just saved without opening another page. Records the invoice first if it isn't written yet.
 */
export function GET(_request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ access }) => {
    const { ref } = await ctx.params;
    let inv = await getInvoiceByRefId(ref);
    if (!inv) {
      const bill = await getBill(ref);
      if (bill) {
        await recordBillInvoice(bill);
        inv = await getInvoiceByRefId(ref);
      }
    }
    if (!inv || !branchAllowed(access, inv.branch)) return notFound("Invoice not found");
    return ok(inv);
  });
}
