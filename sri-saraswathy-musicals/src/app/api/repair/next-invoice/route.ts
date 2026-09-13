import { handle, ok } from "@/lib/api/http";
import { nextServiceInvoiceNo } from "@/lib/db/queries/repair";

export const dynamic = "force-dynamic";

// POST /api/repair/next-invoice → { invoiceNo: "SER-2026-7QK3M" }
// POST (not GET) because it mutates the counter.
export function POST() {
  return handle(async () => ok({ invoiceNo: await nextServiceInvoiceNo() }));
}
