import type { NextRequest } from "next/server";
import { handle, ok, readJson, badRequest } from "@/lib/api/http";
import { renameExpenseCategory } from "@/lib/db/queries/expenses";
import { getDeliverySettings, updateDeliverySettings } from "@/lib/db/queries/settings";

export const dynamic = "force-dynamic";

/**
 * EXP-04: rename an expense category — every expense filed under it moves to the new name, and the managed list
 * (settings.expenseCategories) follows. Admin only.
 */
export function PATCH(request: NextRequest) {
  return handle("admin", async () => {
    const body = await readJson<{ from?: string; to?: string }>(request);
    const from = (body.from ?? "").trim();
    const to = (body.to ?? "").trim();
    if (!from || !to) return badRequest("Give the current and the new category name.");
    if (to.length > 60) return badRequest("Keep the category name under 60 characters.");
    const changed = from === to ? 0 : await renameExpenseCategory(from, to);
    const settings = await getDeliverySettings();
    const list = settings.expenseCategories ?? [];
    const existing = list.find((c) => c.name === from);
    const next = list.filter((c) => c.name !== from && c.name !== to);
    next.push({ name: to, active: existing?.active ?? true });
    next.sort((a, b) => a.name.localeCompare(b.name));
    await updateDeliverySettings({ expenseCategories: next });
    return ok({ changed, expenseCategories: next });
  });
}
