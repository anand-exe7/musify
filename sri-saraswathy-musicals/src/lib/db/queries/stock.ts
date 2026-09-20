import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { stockInward, products } from "@/lib/db/schema";
import { row, rows } from "./_util";

export interface StockInwardRecord {
  id: string;
  vendorId: string;
  productId: string;
  productName: string;
  variant: string;
  quantity: number;
  unitCost: number;
  branch: string;
  createdBy: string;
  inwardAt: string;
}

/** Input for a new inward — the client sends indices/ids; the server resolves
 *  the product, snapshots names, bumps stock and records the row. */
export interface StockInwardInput {
  id: string;
  vendorId: string;
  productId: string;
  variantIndex: number;
  quantity: number;
  unitCost: number;
  branch: string;
  createdBy: string;
}

export async function getInwards(): Promise<StockInwardRecord[]> {
  return rows<StockInwardRecord>(await db.select().from(stockInward).orderBy(desc(stockInward.inwardAt)));
}

/**
 * Record a stock-inward line and apply its effect to inventory: the received
 * quantity is added to the chosen variant's on-hand, and the product's `cost`
 * is refreshed to the unit cost just paid. Returns the saved inward row.
 */
export async function createInward(input: StockInwardInput): Promise<StockInwardRecord> {
  const [prod] = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);

  const variants = prod?.variants ?? [];
  const v = variants[input.variantIndex];
  const variantLabel = v ? `${v.attr}${v.finish ? ` · ${v.finish}` : ""}` : "";

  const record = {
    id: input.id,
    vendorId: input.vendorId,
    productId: input.productId,
    productName: prod?.name ?? input.productId,
    variant: variantLabel,
    quantity: input.quantity,
    unitCost: input.unitCost,
    branch: input.branch,
    createdBy: input.createdBy,
    inwardAt: new Date().toISOString(),
  };

  const [saved] = await db.insert(stockInward).values(record).returning();

  // Apply to inventory: bump the variant's on-hand and refresh the product cost.
  if (prod && v) {
    const nextVariants = variants.map((x, i) =>
      i === input.variantIndex ? { ...x, stock: (Number(x.stock) || 0) + input.quantity } : x,
    );
    await db
      .update(products)
      .set({ variants: nextVariants, cost: input.unitCost })
      .where(eq(products.id, input.productId));
  }

  return row<StockInwardRecord>(saved);
}
