import type { NextRequest } from "next/server";
import { handle, noContent, notFound, HttpError } from "@/lib/api/http";
import { getExpense, deleteExpense } from "@/lib/db/queries/expenses";
import { branchAllowed } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ access }) => {
    const { id } = await ctx.params;
    const exp = await getExpense(id);
    if (!exp) return notFound("Expense not found");
    // A branch user may only delete their own branch's expenses.
    if (!branchAllowed(access, exp.branch)) throw new HttpError(403, "Not your branch");
    return (await deleteExpense(id)) ? noContent() : notFound("Expense not found");
  });
}
