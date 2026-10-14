/**
 * The closed vocabularies behind the app's literal unions. The columns are plain
 * `text`, so without a CHECK an out-of-vocabulary value (bad PATCH body, Studio
 * edit, hand-written SQL) is cast straight into the union on read and silently
 * falls out of reports. `schema.ts` turns each list into a CHECK constraint.
 */
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { BUSINESS } from "@/lib/data/business";
import { branchManagerRole } from "@/lib/stock";

/** Every branch key — derived from the business profile, the single list. */
export const BRANCHES: readonly string[] = BUSINESS.branches.map((b) => b.key);
/** Inquiries may also be addressed to either branch. */
export const INQUIRY_BRANCHES: readonly string[] = [...BRANCHES, "Any"];

export const USER_ROLES: readonly string[] = ["admin", ...BRANCHES.map(branchManagerRole), "cashier", "customer"];
export const STAFF_ROLES = ["Admin", "Manager", "Cashier", "Staff"] as const;
export const ORDER_STATUSES = ["delivered", "shipped", "processing", "cancelled"] as const;
export const INVOICE_STATUSES = ["paid", "pending", "cancelled"] as const;
export const INVOICE_SOURCES = ["web", "pos", "service", "manual"] as const;
export const BILL_STATUSES = ["completed", "pending"] as const;
export const BILL_SOURCES = ["offline", "online", "service"] as const;
export const REPAIR_STATUSES = [
  "received",
  "in-progress",
  "ready",
  "completed",
  "cancelled",
] as const;
export const REPAIR_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK", "OTHER"] as const;
export const INQUIRY_STATUSES = ["new", "contacted", "resolved"] as const;

/** `col IN ('a', 'b', …)` with literals inlined (CHECKs can't take parameters). */
export function oneOf(col: AnyPgColumn, values: readonly string[]): SQL {
  const list = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
  return sql`${col} in (${sql.raw(list)})`;
}
