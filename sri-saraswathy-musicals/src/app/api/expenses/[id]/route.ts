import type { NextRequest } from "next/server";
import { handle, noContent, notFound, HttpError, ok, readJson, badRequest } from "@/lib/api/http";
import { getExpense, deleteExpense, updateExpense } from "@/lib/db/queries/expenses";
import type { Expense } from "@/lib/store/expenses";
import { PAYMENT_MODES } from "@/lib/db/vocab";
import { branchAllowed } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** EXP-03 / EXP-01: edit an expense, including whether it is subtracted in analytics. */
export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ access }) => {
    const { id } = await ctx.params;
    const exp = await getExpense(id);
    if (!exp) return notFound("Expense not found");
    if (!branchAllowed(access, exp.branch)) throw new HttpError(403, "Not your branch");
    const body = await readJson<Partial<Expense>>(request);
    const patch: Partial<Expense> = {};
    if (typeof body.title === "string") {
      if (!body.title.trim()) return badRequest("Enter what the expense is for.");
      patch.title = body.title.trim();
    }
    if (body.amount !== undefined) {
      const amount = Math.round(Number(body.amount));
      if (!(amount > 0)) return badRequest("Amount must be more than zero.");
      patch.amount = amount;
    }
    if (typeof body.category === "string") patch.category = body.category.trim() || "Miscellaneous";
    if (body.paymentMode !== undefined) {
      if (!(PAYMENT_MODES as readonly string[]).includes(body.paymentMode)) return badRequest("Unknown payment mode.");
      patch.paymentMode = body.paymentMode;
    }
    if (typeof body.expenseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.expenseDate)) patch.expenseDate = body.expenseDate;
    if (body.notes !== undefined) patch.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
    if (typeof body.inAnalytics === "boolean") patch.inAnalytics = body.inAnalytics;
    if (typeof body.branch === "string" && body.branch !== exp.branch) {
      if (!branchAllowed(access, body.branch)) throw new HttpError(403, "Not your branch");
      patch.branch = body.branch;
    }
    const saved = await updateExpense(id, patch);
    return saved ? ok(saved) : notFound("Expense not found");
  });
}

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
