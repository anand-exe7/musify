import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api/http";
import { getCustomersPage } from "@/lib/db/queries/customers";

export const dynamic = "force-dynamic";

/** Customer list, one page at a time. Branch users only see customers their branch has billed, counted on their branch's invoices. */
export function GET(request: NextRequest) {
  return handle("staff", async ({ access }) => {
    const p = request.nextUrl.searchParams;
    return ok(await getCustomersPage({
      q: p.get("q") ?? "",
      page: Number(p.get("page")) || 1,
      pageSize: Number(p.get("pageSize")) || 10,
      scope: access === "all" ? null : access,
    }));
  });
}
