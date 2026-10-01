import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, stockTransfers } from "@/lib/db/schema";
import { variantStockAt, isBranch, type Branch } from "@/lib/stock";
import { HttpError } from "@/lib/api/errors";
import { adjustProductStock } from "@/lib/db/queries/stockOps";
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
  if (!isBranch(input.fromBranch) || !isBranch(input.toBranch)) {
    throw new HttpError(400, "Unknown branch");
  }
  if (input.fromBranch === input.toBranch) {
    throw new HttpError(400, "Source and destination branches must differ");
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new HttpError(400, "Transfer quantity must be a whole number ≥ 1");
  }

  const [prod] = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);
  if (!prod) throw new HttpError(404, `Unknown product: ${input.productId}`);

  const variants = prod.variants ?? [];
  const v = variants[input.variantIndex];
  if (!v) throw new HttpError(400, "Unknown variant on this product");

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
  // Record first, keyed by the caller's id. A retried or double-clicked request
  // hits the primary key and returns the original transfer instead of moving the
  // stock a second time. If the move then fails, the record is withdrawn.
  const [saved] = await db.insert(stockTransfers).values(record).onConflictDoNothing().returning();
  if (!saved) {
    const [existing] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, input.id)).limit(1);
    return row<StockTransferRecord>(existing);
  }

  try {
    // Source down and destination up in ONE write, so the two buckets can never
    // disagree and a shortfall at the source rejects the whole move.
    await adjustProductStock(input.productId, [
      { variantIndex: input.variantIndex, branch: input.fromBranch, delta: -input.quantity },
      { variantIndex: input.variantIndex, branch: input.toBranch, delta: input.quantity },
    ]);
  } catch (err) {
    await db.delete(stockTransfers).where(eq(stockTransfers.id, input.id));
    throw err;
  }
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
  /** Client-generated id for the whole submission. Resubmitting the same one is
   *  a no-op that returns the original transfers (double-click / retry safe). */
  batchId?: string,
): Promise<StockTransferRecord[]> {
  if (!Array.isArray(lines) || lines.length === 0) throw new TransferValidationError("Add at least one line.");
  if (batchId !== undefined && !/^[\w-]{1,64}$/.test(batchId)) throw new TransferValidationError("Invalid batch id.");

  // Resubmitting the same batch (double-click, retry after a failure) must finish
  // it, not stop at whatever the first attempt managed. Each line has a fixed id
  // `<batchId>-<n>`, so lines already saved are recognised, left out of the stock
  // check (their stock has already moved) and returned as they were.
  const already = new Set<string>();
  if (batchId) {
    const ids = lines.map((_, n) => `${batchId}-${n + 1}`);
    for (const d of await db.select({ id: stockTransfers.id }).from(stockTransfers).where(inArray(stockTransfers.id, ids))) already.add(d.id);
  }
  if (!isBranch(fromBranch) || !isBranch(toBranch)) {
    throw new TransferValidationError("Unknown branch.");
  }
  if (fromBranch === toBranch) throw new TransferValidationError("Source and destination branches must differ.");

  const demand = new Map<string, { need: number; at: number }>();
  for (const [n, l] of lines.entries()) {
    const at = n + 1;
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new TransferValidationError(`Line ${at}: quantity must be a whole number ≥ 1.`);
    if (!Number.isInteger(l.variantIndex) || l.variantIndex < 0) throw new TransferValidationError(`Line ${at}: invalid variant.`);
    if (batchId && already.has(`${batchId}-${at}`)) continue;
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
  for (const [n, l] of lines.entries()) {
    saved.push(
      await createTransfer({
        id: batchId ? `${batchId}-${n + 1}` : genDocId("TRF"),
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
