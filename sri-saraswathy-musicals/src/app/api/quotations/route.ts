import type { NextRequest } from "next/server";
import { handle, ok, created, readJson } from "@/lib/api/http";
import { getQuotations, createQuotation, type QuotationInput } from "@/lib/db/queries/quotations";
import { scopeByBranch } from "@/lib/auth/server";
import { branchAllowed, primaryBranchOf } from "@/lib/auth/session";
import { DEFAULT_BRANCH } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** Quotations — admin or branch staff (scoped to their branches). */
export function GET() {
  return handle("staff", async ({ access }) => ok(scopeByBranch(await getQuotations(), access)));
}

export function POST(request: NextRequest) {
  return handle("staff", async ({ access }) => {
    const body = await readJson<QuotationInput>(request);
    // A branch user can only quote for one of their own branches.
    if (access !== "all" && !branchAllowed(access, body.branch)) body.branch = primaryBranchOf(access, DEFAULT_BRANCH);
    return created(await createQuotation(body));
  });
}
