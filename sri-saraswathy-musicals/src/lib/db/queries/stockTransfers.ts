import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, stockTransfers } from "@/lib/db/schema";
import { setVariantStockAt, variantStockAt, type Branch } from "@/lib/store/pos";
import { row, rows } from "./_util";

export interface StockTransferRecord {
  id: string;
  productId: string;
  productName: string;
  variant: string;
  quantity: number;
  fromBranch: string;
  toBranch: string;
  note: string;
  createdBy: string;
  transferredAt: string;
}

export interface StockTransferInput {
  id: string;
  productId: string;
  variantIndex: number;
  quantity: number;
  fromBranch: Branch;
  toBranch: Branch;
  note?: string;
  createdBy?: string;
}

export async function getTransfers(): Promise<StockTransferRecord[]> {
  return rows<StockTransferRecord>(
    await db.select().from(stockTransfers).orderBy(desc(stockTransfers.transferredAt)),
  );
}

/**
 * Move `quantity` units of one variant from `fromBranch` to `toBranch`, in a
 * single update: the source bucket drops, the destination bucket rises, and the
 * transfer row is recorded. Throws if source doesn't hold enough on hand.
 */
export async function createTransfer(input: StockTransferInput): Promise<StockTransferRecord> {
  if (input.fromBranch === input.toBranch) {
    throw new Error("Source and destination branches must differ");
  }
  if (input.quantity <= 0) {
    throw new Error("Transfer quantity must be at least 1");
  }

  const [prod] = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);
  if (!prod) throw new Error(`Unknown product: ${input.productId}`);

  const variants = prod.variants ?? [];
  const v = variants[input.variantIndex];
  if (!v) throw new Error("Unknown variant on this product");

  const sourceOnHand = variantStockAt(v, input.fromBranch);
  if (sourceOnHand < input.quantity) {
    throw new Error(`Not enough stock at ${input.fromBranch} — only ${sourceOnHand} on hand`);
  }
  const destOnHand = variantStockAt(v, input.toBranch);

  const nextVariants = variants.map((x, i) => {
    if (i !== input.variantIndex) return x;
    const afterOut = setVariantStockAt(x, input.fromBranch, sourceOnHand - input.quantity);
    return setVariantStockAt(afterOut, input.toBranch, destOnHand + input.quantity);
  });
  await db.update(products).set({ variants: nextVariants }).where(eq(products.id, input.productId));

  const variantLabel = `${v.attr}${v.finish ? ` · ${v.finish}` : ""}`;
  const record = {
    id: input.id,
    productId: input.productId,
    productName: prod.name,
    variant: variantLabel,
    quantity: input.quantity,
    fromBranch: input.fromBranch,
    toBranch: input.toBranch,
    note: (input.note ?? "").trim(),
    createdBy: input.createdBy ?? "",
    transferredAt: new Date().toISOString(),
  };
  const [saved] = await db.insert(stockTransfers).values(record).returning();
  return row<StockTransferRecord>(saved);
}
