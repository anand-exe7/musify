/**
 * Safe stock writes. The Neon HTTP driver can't run multi-statement
 * transactions, so a plain read → compute → write loses updates when two sales
 * race. Instead each write is a compare-and-swap on the whole `variants` value:
 *
 *   UPDATE products SET variants = <next> WHERE id = ? AND variants = <what we read>
 *
 * If another writer got in first the WHERE matches nothing, and we re-read and
 * retry. Nothing is ever silently floored: a shortfall throws a 409.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { HttpError } from "@/lib/api/errors";
import { applyStockDeltas, StockShortfallError, variantStockAt, type StockDelta, type Variant } from "@/lib/stock";

const MAX_ATTEMPTS = 6;

type ProductRow = typeof products.$inferSelect;

export interface StockWriteOptions {
  /** Clamp at zero instead of throwing — for goods that are already paid for. */
  allowShort?: boolean;
  /** Also set the product's unit cost in the same write (stock-inward). */
  cost?: number;
}

/**
 * Apply deltas to one product atomically. Returns the product as it was before
 * the change (for names/labels). Throws HttpError(404) for an unknown product
 * and HttpError(409) for a shortfall or sustained contention.
 */
export async function adjustProductStock(
  productId: string,
  deltas: StockDelta[],
  opts: StockWriteOptions = {},
): Promise<ProductRow> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [prod] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!prod) throw new HttpError(404, `Unknown product: ${productId}`);
    const prev = (prod.variants ?? []) as Variant[];

    let next: Variant[];
    try {
      next = applyStockDeltas(prev, deltas, { allowShort: opts.allowShort, label: prod.name });
    } catch (e) {
      if (e instanceof StockShortfallError) throw new HttpError(409, e.message);
      throw new HttpError(400, e instanceof Error ? e.message : "Invalid stock change");
    }

    const set: Partial<typeof products.$inferInsert> = { variants: next as ProductRow["variants"] };
    if (opts.cost !== undefined) set.cost = opts.cost;

    const updated = await db
      .update(products)
      .set(set)
      .where(and(eq(products.id, productId), sql`${products.variants} = ${JSON.stringify(prev)}::jsonb`))
      .returning({ id: products.id });
    if (updated.length > 0) return prod;
    // Someone else changed this product's stock between our read and write — retry.
  }
  throw new HttpError(409, "Stock is being updated by someone else — please try again.");
}

/** One catalogue line to take out of (or put back into) stock. */
export interface StockLine {
  productId: string;
  variantIndex: number;
  quantity: number;
}

export interface TakeStockResult {
  /** Put back exactly what was taken (use if a later step of the sale fails).
   *  When `allowShort` clamped a line, only the units actually taken go back. */
  undo: () => Promise<void>;
  /** Lines that were clamped at zero because `allowShort` let them oversell. */
  shortfalls: (StockLine & { onHand: number })[];
}

/**
 * Take several lines out of stock at a branch. All-or-nothing in effect: if a
 * later line fails, the earlier ones are put back before the error propagates.
 */
export async function takeStock(
  lines: StockLine[],
  branch: StockDelta["branch"],
  opts: Pick<StockWriteOptions, "allowShort"> = {},
): Promise<TakeStockResult> {
  const done: StockLine[] = [];
  const shortfalls: TakeStockResult["shortfalls"] = [];
  const undo = async () => {
    for (const l of done.splice(0)) {
      try {
        await adjustProductStock(l.productId, [{ variantIndex: l.variantIndex, branch, delta: l.quantity }]);
      } catch (err) {
        console.error("[stock] failed to restore stock for", l, err);
      }
    }
  };
  try {
    for (const l of lines) {
      if (l.quantity <= 0) continue;
      const before = await adjustProductStock(
        l.productId,
        [{ variantIndex: l.variantIndex, branch, delta: -l.quantity }],
        opts,
      );
      const v = (before.variants ?? [])[l.variantIndex] as Variant | undefined;
      const onHand = v ? variantStockAt(v, branch) : 0;
      // `before` is the row this write was computed from, so a clamped line took
      // only what was there.
      const taken = Math.min(l.quantity, onHand);
      if (taken > 0) done.push({ ...l, quantity: taken });
      if (onHand < l.quantity) shortfalls.push({ ...l, onHand });
    }
  } catch (err) {
    await undo();
    throw err;
  }
  return { undo, shortfalls };
}
