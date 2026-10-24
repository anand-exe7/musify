import type { NextRequest } from "next/server";
import { handle, ok, badRequest } from "@/lib/api/http";
import { lookupCustomer } from "@/lib/db/queries/customers";
import { normalizePhone } from "@/lib/customers/phone";

export const dynamic = "force-dynamic";

/**
 * Billing counter: `?phone=` → the customer on that number (name, GSTIN, how many earlier bills, last purchase date),
 * or `{ customer: null }`. One indexed read per press of the Lookup button. Not limited to the staff member's branch —
 * the point is to recognise a customer who bought elsewhere — and it shares no amounts.
 */
export function GET(request: NextRequest) {
  return handle("staff", async () => {
    const phone = request.nextUrl.searchParams.get("phone") ?? "";
    if (!normalizePhone(phone)) return badRequest("Enter a valid 10-digit mobile number.");
    return ok({ customer: await lookupCustomer(phone) });
  });
}
