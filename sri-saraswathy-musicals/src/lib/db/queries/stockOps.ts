/**
 * Safe stock writes. Stock lives one row per (variant, branch) in `variant_stock`
 * and every change is a single atomic `UPDATE … qty = qty + n` (see `bumpStock`),
 * guarded so a balance can never go below zero — the CHECK constraint backs that
 * up in the database. Concurrent sales therefore can't overwrite each other, and
 * nothing is ever silently floored: a shortfall throws a 409.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, type ProductRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/api/errors";
import { isBranch, type StockDelta, branchLabel } from "@/lib/stock";
import { bumpStock, selectProduct, setVariantPrice as setPrice } from "./variants";

export { setPrice as setVariantPrice };

export interface StockWriteOptions {
  /** Clamp at zero instead of throwing — for goods that are already paid for. */
  allowShort?: boolean;
  /** Also set the product's unit cost in the same write (stock-inward). */
  cost?: number;
}

/**
 * Apply deltas to one product. Returns the product as it was before the change
 * (for names/labels). Throws HttpError(404) for an unknown product and
 * HttpError(409) for a shortfall.
 *
 * Deltas to the same bucket are netted first, take-outs run before put-ins, and
 * if a later step fails the earlier ones are reversed, so a transfer is judged on
 * its net effect and never half-applies.
 */
export async function adjustProductStock(
  productId: string,
  deltas: StockDelta[],
  opts: StockWriteOptions = {},
): Promise<ProductRow> {
  const prod = await selectProduct(productId);
  if (!prod) throw new HttpError(404, `Unknown product: ${productId}`);

  const net = new Map<string, StockDelta>();
  for (const d of deltas) {
    if (!isBranch(d.branch)) throw new HttpError(400, `Unknown branch: ${String(d.branch)}`);
    if (!Number.isInteger(d.delta)) throw new HttpError(400, "Stock quantity must be a whole number");
    const k = `${d.variantIndex}|${d.branch}`;
    net.set(k, { ...d, delta: (net.get(k)?.delta ?? 0) + d.delta });
  }
  const steps = [...net.values()].filter((d) => d.delta !== 0).sort((a, b) => a.delta - b.delta);

  const applied: StockDelta[] = [];
  const reverse = async () => {
    for (const d of applied.splice(0).reverse()) {
      try {
        await bumpStock(productId, d.variantIndex, d.branch, -d.delta, true);
      } catch (err) {
        console.error("[stock] failed to reverse", d, err);
      }
    }
  };

  try {
    for (const d of steps) {
      const r = await bumpStock(productId, d.variantIndex, d.branch, d.delta, !!opts.allowShort);
      if (r === undefined) throw new HttpError(400, "Unknown variant on this product");
      if (r === null) {
        const v = prod.variants[d.variantIndex];
        const onHand = v?.stockByBranch[d.branch] ?? 0;
        throw new HttpError(409, `${prod.name} — only ${onHand} in stock at ${branchLabel(d.branch)}, ${-d.delta} needed`);
      }
      applied.push(d);
    }
    if (opts.cost !== undefined) await db.update(products).set({ cost: opts.cost }).where(eq(products.id, productId));
  } catch (err) {
    await reverse();
    throw err;
  }
  return prod;
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
        await bumpStock(l.productId, l.variantIndex, branch, l.quantity, true);
      } catch (err) {
        console.error("[stock] failed to restore stock for", l, err);
      }
    }
  };
  try {
    for (const l of lines) {
      if (l.quantity <= 0) continue;
      const r = await bumpStock(l.productId, l.variantIndex, branch, -l.quantity, !!opts.allowShort);
      if (r === undefined) {
        const exists = await selectProduct(l.productId);
        throw new HttpError(exists ? 400 : 404, exists ? "Unknown variant on this product" : `Unknown product: ${l.productId}`);
      }
      if (r === null) {
        const prod = await selectProduct(l.productId);
        const onHand = prod?.variants[l.variantIndex]?.stockByBranch[branch] ?? 0;
        throw new HttpError(409, `${prod?.name ?? l.productId} — only ${onHand} in stock at ${branchLabel(branch)}, ${l.quantity} needed`);
      }
      // `before` is the balance this very write started from, so a clamped line
      // took only what was there.
      const taken = Math.min(l.quantity, r.before);
      if (taken > 0) done.push({ ...l, quantity: taken });
      if (r.before < l.quantity) shortfalls.push({ ...l, onHand: r.before });
    }
  } catch (err) {
    await undo();
    throw err;
  }
  return { undo, shortfalls };
}
