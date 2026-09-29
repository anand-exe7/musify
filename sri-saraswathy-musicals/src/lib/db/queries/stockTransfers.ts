import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, stockTransfers } from "@/lib/db/schema";
import { setVariantStockAt, variantStockAt, type Branch } from "@/lib/stock";
import { genDocId } from "@/lib/ids";
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

/* ───────────────────────────  Multi-line batch  ─────────────────────────── */

export interface TransferBatchLine {
  productId: string;
  variantIndex: number;
  quantity: number;
}

export class TransferValidationError extends Error {}

/**
 * Move several products in one go. Everything is validated first — including the
 * *combined* demand when the same product/variant appears on more than one
 * line — so a shortfall rejects the whole batch instead of leaving it
 * half-applied (the Neon HTTP driver has no multi-statement transactions).
 */
export async function createTransferBatch(
  lines: TransferBatchLine[],
  fromBranch: Branch,
  toBranch: Branch,
  note: string,
  createdBy: string,
): Promise<StockTransferRecord[]> {
  if (!Array.isArray(lines) || lines.length === 0) throw new TransferValidationError("Add at least one line.");
  if (!["Branch 1", "Branch 2"].includes(fromBranch) || !["Branch 1", "Branch 2"].includes(toBranch)) {
    throw new TransferValidationError("Unknown branch.");
  }
  if (fromBranch === toBranch) throw new TransferValidationError("Source and destination branches must differ.");

  const demand = new Map<string, { need: number; at: number }>();
  for (const [n, l] of lines.entries()) {
    const at = n + 1;
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new TransferValidationError(`Line ${at}: quantity must be a whole number ≥ 1.`);
    if (!Number.isInteger(l.variantIndex) || l.variantIndex < 0) throw new TransferValidationError(`Line ${at}: invalid variant.`);
    const k = `${l.productId}#${l.variantIndex}`;
    const d = demand.get(k);
    demand.set(k, { need: (d?.need ?? 0) + l.quantity, at: d?.at ?? at });
  }
  for (const [k, { need, at }] of demand) {
    const [productId, idx] = k.split("#");
    const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!prod) throw new TransferValidationError(`Line ${at}: product not found.`);
    const v = prod.variants?.[Number(idx)];
    if (!v) throw new TransferValidationError(`Line ${at}: variant not found.`);
    const onHand = variantStockAt(v, fromBranch);
    if (onHand < need) throw new TransferValidationError(`Line ${at}: ${prod.name} — only ${onHand} at ${fromBranch}, ${need} requested.`);
  }

  const saved: StockTransferRecord[] = [];
  for (const l of lines) {
    saved.push(
      await createTransfer({
        id: genDocId("TRF"),
        productId: l.productId,
        variantIndex: l.variantIndex,
        quantity: l.quantity,
        fromBranch,
        toBranch,
        note,
        createdBy,
      }),
    );
  }
  return saved;
}
