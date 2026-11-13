import { eq } from "drizzle-orm";
import { handle, ok } from "@/lib/api/http";
import { db } from "@/lib/db";
import { purchases, vendors } from "@/lib/db/schema";
import { getExpenses } from "@/lib/db/queries/expenses";
import { getBillDetail } from "@/lib/db/queries/purchaseBills";
import { getDeliverySettings } from "@/lib/db/queries/settings";
import { branchAllowed } from "@/lib/auth/session";
import type { Branch } from "@/lib/stock";

export const dynamic = "force-dynamic";

export interface Deduction {
  kind: "expense" | "vendor";
  id: string;
  /** yyyy-mm-dd or ISO */
  date: string;
  branch: string;
  mode: string;
  amount: number;
  label: string;
}

/**
 * ANA-04 / EXP-01: what the Analytics page subtracts from sales — expenses marked "Subtract in analytics", and
 * every payment made against vendor bills marked the same way (at purchase and later), each with its payment mode
 * and branch. `modes` is the payment-mode switch from the expense settings; the page applies it, period and branch.
 */
export function GET() {
  return handle("admin", async ({ access }) => {
    const scope = access === "all" ? null : (access as Branch[]);
    const out: Deduction[] = [];

    for (const e of await getExpenses()) {
      if (!e.inAnalytics || !branchAllowed(access, e.branch)) continue;
      out.push({ kind: "expense", id: e.id, date: e.expenseDate, branch: e.branch, mode: e.paymentMode, amount: e.amount, label: `${e.title} · ${e.category}` });
    }

    const linked = await db
      .select({ id: purchases.id, invoiceNo: purchases.invoiceNo, vendor: vendors.name })
      .from(purchases)
      .innerJoin(vendors, eq(vendors.id, purchases.vendorId))
      .where(eq(purchases.inAnalytics, true));
    for (const p of linked) {
      const d = await getBillDetail(p.id, scope);
      if (!d) continue;
      const label = `${p.vendor}${p.invoiceNo ? ` · bill ${p.invoiceNo}` : ""}`;
      const day = d.purchase.purchaseDate || d.purchase.createdAt.slice(0, 10);
      const mode = d.purchase.paymentMode && d.purchase.paymentMode !== "CREDIT" ? d.purchase.paymentMode : "OTHER";
      for (const b of d.branches) {
        if (b.paidAtPurchase > 0) out.push({ kind: "vendor", id: `${p.id}-${b.branch}`, date: day, branch: b.branch, mode, amount: b.paidAtPurchase, label });
      }
      for (const pay of d.payments) {
        out.push({ kind: "vendor", id: pay.id, date: pay.paidAt, branch: pay.branch, mode: pay.mode || "OTHER", amount: pay.amount, label });
      }
    }

    const settings = await getDeliverySettings();
    return ok({ modes: settings.expenseDeductModes ?? ["CASH", "CARD", "UPI"], entries: out });
  });
}
