import type { NextRequest } from "next/server";
import { handle, ok } from "@/lib/api/http";
import { getInventoryPage, getInventoryIds, getStockAlerts, type InvFilter, type InvSort, type InvStatus } from "@/lib/db/queries/inventoryPage";

export const dynamic = "force-dynamic";

const STATUSES: readonly InvStatus[] = ["all", "low", "out"];
const SORTS: readonly InvSort[] = ["name", "price", "stock"];

/**
 * GET /api/inventory?page=&pageSize=&q=&category=&department=&status=&sort=   → one page of light rows
 * GET /api/inventory?view=ids&…filters                                         → ids of every match (for CSV export)
 * GET /api/inventory?view=alerts                                               → variants that are out / running low
 * The page never carries variants; a row's variants come from /api/inventory/{id}/variants when it is opened.
 */
export function GET(request: NextRequest) {
  return handle("staff", async () => {
    const sp = request.nextUrl.searchParams;
    if (sp.get("view") === "alerts") return ok(await getStockAlerts());
    const filter: InvFilter = {
      q: sp.get("q") || undefined,
      category: sp.get("category") || undefined,
      department: sp.get("department") || undefined,
      status: STATUSES.find((s) => s === sp.get("status")),
      sort: SORTS.find((s) => s === sp.get("sort")),
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || 10,
    };
    if (sp.get("view") === "ids") return ok(await getInventoryIds(filter));
    return ok(await getInventoryPage(filter));
  });
}
