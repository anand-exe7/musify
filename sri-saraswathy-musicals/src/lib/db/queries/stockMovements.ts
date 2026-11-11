import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { stockMovements } from "@/lib/db/schema";

export type StockMovement = typeof stockMovements.$inferSelect;

/** LED-04: the latest stock movements, newest first (read-only log). */
export async function getStockMovements(limit = 500): Promise<StockMovement[]> {
  return db.select().from(stockMovements).orderBy(desc(stockMovements.at)).limit(limit);
}
