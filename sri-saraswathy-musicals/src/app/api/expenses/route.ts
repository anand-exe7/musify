import type { NextRequest } from "next/server";
import { handle, ok, created, badRequest, readJson } from "@/lib/api/http";
import { getExpenses, createExpense } from "@/lib/db/queries/expenses";
import { requireAdminAccess, requireAdminUser, scopeByBranch } from "@/lib/auth/server";
import type { Expense } from "@/lib/store/expenses";

export const dynamic = "force-dynamic";

/** Expense ledger — admin or branch staff (scoped to their branch). */
export function GET() {
  return handle(async () => {
    const access = await requireAdminAccess();
    return ok(scopeByBranch(await getExpenses(), access));
  });
}

export function POST(request: NextRequest) {
  return handle(async () => {
    const { access } = await requireAdminUser();
    const body = await readJson<Expense>(request);
    if (!body?.id || !body?.title) return badRequest("Expense requires `id` and `title`");
    // Branch users can only record expenses against their own branch.
    if (access !== "all") body.branch = access;
    return created(await createExpense(body));
  });
}
