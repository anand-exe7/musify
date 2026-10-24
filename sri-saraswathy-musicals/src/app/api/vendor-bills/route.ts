import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api/http";
import { getBillsPage, type BillFilter } from "@/lib/db/queries/purchaseBills";
import { getVendorRollup } from "@/lib/db/queries/purchaseViews";
import type { Branch } from "@/lib/stock";

export const dynamic = "force-dynamic";

const STATUSES = ["all", "open", "unpaid", "part", "paid"] as const;
const SORTS = ["newest", "oldest", "balance", "amount"] as const;

/**
 * GET /api/vendor-bills?page=&pageSize=&vendor=&branch=&status=&from=&to=&q=&sort=
 * One page of vendor bills, each with what every branch took, has to pay, has paid and still owes, plus
 * totals for the whole filter. Branch staff only ever see their own branches' part.
 */
export function GET(request: NextRequest) {
  return handle("admin", async ({ access }) => {
    const sp = request.nextUrl.searchParams;
    const scope = access === "all" ? null : (access as Branch[]);
    // ?view=vendors → one row per vendor instead of one per bill
    if (sp.get("view") === "vendors") {
      return ok(await getVendorRollup({
        q: sp.get("q") || undefined,
        branch: sp.get("branch") || undefined,
        openOnly: sp.get("status") === "open",
        page: Number(sp.get("page")) || 1,
        pageSize: Number(sp.get("pageSize")) || 10,
      }, scope));
    }
    const pick = <T extends string>(v: string | null, allowed: readonly T[]): T | undefined => (v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);
    const filter: BillFilter = {
      vendorId: sp.get("vendor") || undefined,
      branch: sp.get("branch") || undefined,
      status: pick(sp.get("status"), STATUSES),
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      q: sp.get("q") || undefined,
      sort: pick(sp.get("sort"), SORTS),
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || 10,
    };
    return ok(await getBillsPage(filter, scope));
  });
}
