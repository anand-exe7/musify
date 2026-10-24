import type { NextRequest } from "next/server";
import { handle, ok, notFound } from "@/lib/api/http";
import { getCustomerDetail } from "@/lib/db/queries/customers";

export const dynamic = "force-dynamic";

/** One customer and their invoices (a branch user sees only their branch's invoices). */
export function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle("staff", async ({ access }) => {
    const { id } = await params;
    const d = await getCustomerDetail(id, access === "all" ? null : access);
    return d ? ok(d) : notFound("Customer not found");
  });
}
