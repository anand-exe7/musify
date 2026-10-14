import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getExpenses, createExpense } from "@/lib/db/queries/expenses";
import { scopeByBranch } from "@/lib/auth/server";
import type { Expense } from "@/lib/store/expenses";
import { branchAllowed, primaryBranchOf } from "@/lib/auth/session";
import { DEFAULT_BRANCH } from "@/lib/stock";

export const dynamic = "force-dynamic";

/** Expense ledger — admin or branch staff (scoped to their branch). */
export function GET() {
  return handle("staff", async ({ access }) => {
    return ok(scopeByBranch(await getExpenses(), access));
  });
}

export function POST(request: NextRequest) {
  return handle("staff", async ({ access }) => {
    const body = await readJson<Expense>(request);
    if (!body?.id || !body?.title) return badRequest("Expense requires `id` and `title`");
    // Branch users can only record expenses against one of their branches.
    if (access !== "all" && !branchAllowed(access, body.branch)) body.branch = primaryBranchOf(access, DEFAULT_BRANCH);
    return created(await createExpense(body));
  });
}
