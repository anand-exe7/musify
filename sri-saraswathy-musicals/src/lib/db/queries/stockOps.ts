/**
 * Safe stock writes. Stock lives one row per (variant, branch) in `variant_stock`
 * and every change is a single atomic `UPDATE … qty = qty + n` (see `bumpStock`),
 * guarded so a balance can never go below zero — the CHECK constraint backs that
 * up in the database. Concurrent sales therefore can't overwrite each other, and
 * nothing is ever silently floored: a shortfall throws a 409.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, stockMovements, type ProductRow } from "@/lib/db/schema";
import { HttpError } from "@/lib/api/errors";
import { isBranch, type StockDelta, branchLabel, BRANCH_KEYS } from "@/lib/stock";
import { bumpStock, selectProduct, setVariantPrice as setPrice } from "./variants";

export { setPrice as setVariantPrice };

export interface StockWriteOptions {
  /** Clamp at zero instead of throwing — for goods that are already paid for. */
  allowShort?: boolean;
  /** Also set the product's unit cost in the same write (stock-inward). */
  cost?: number;
  /** LED-04: record each applied change in the stock movement log under this reason. */
  log?: StockLogEntry;
}

/** Why a stock change happened, for the movement log (`stock_movements`). */
export interface StockLogEntry {
  reason: "bill_cancelled" | "order_cancelled" | "invoice_cancelled" | "transfer" | "purchase" | "purchase_deleted" | "repair" | "adjustment";
  /** The document behind it (bill / order / transfer / ticket id). */
  ref?: string;
  note?: string;
}

/** Best-effort append to the movement log — never lets a logging failure undo a stock change that already happened. */
async function logMovements(prod: ProductRow, applied: StockDelta[], log: StockLogEntry): Promise<void> {
  if (applied.length === 0) return;
  try {
    const at = new Date().toISOString();
    await db.insert(stockMovements).values(
      applied.map((d) => {
        const v = prod.variants[d.variantIndex];
        return {
          id: crypto.randomUUID(),
          at,
          productId: prod.id,
          productName: prod.name,
          variant: v ? `${v.attr}${v.finish ? ` · ${v.finish}` : ""}` : "",
          branch: d.branch,
          delta: d.delta,
          reason: log.reason,
          ref: log.ref ?? "",
          note: log.note ?? "",
        };
      }),
    );
  } catch (err) {
    console.error("[stock] couldn't write the movement log", log, err);
  }
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
  if (opts.log) await logMovements(prod, applied, opts.log);
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
    // Every line is its own atomic, guarded update, so they can all go to the database together; if any fails,
    // the ones that went through are put back below.
    const todo = lines.filter((l) => l.quantity > 0);
    const results = await Promise.allSettled(todo.map((l) => bumpStock(l.productId, l.variantIndex, branch, -l.quantity, !!opts.allowShort)));
    // Record what was actually taken first, so `undo` covers it whatever fails next.
    results.forEach((res, i) => {
      if (res.status === "fulfilled" && res.value) {
        const l = todo[i];
        const taken = Math.min(l.quantity, res.value.before);
        if (taken > 0) done.push({ ...l, quantity: taken });
      }
    });
    for (let i = 0; i < todo.length; i++) {
      const l = todo[i];
      const res = results[i];
      if (res.status === "rejected") throw res.reason;
      const r = res.value;
      if (r === undefined) {
        const exists = await selectProduct(l.productId);
        throw new HttpError(exists ? 400 : 404, exists ? "Unknown variant on this product" : `Unknown product: ${l.productId}`);
      }
      if (r === null) {
        const prod = await selectProduct(l.productId);
        const onHand = prod?.variants[l.variantIndex]?.stockByBranch[branch] ?? 0;
        throw new HttpError(409, `${prod?.name ?? l.productId} — only ${onHand} in stock at ${branchLabel(branch)}, ${l.quantity} needed`);
      }
      // `before` is the balance this very write started from, so a clamped line took only what was there.
      if (r.before < l.quantity) shortfalls.push({ ...l, onHand: r.before });
    }
  } catch (err) {
    await undo();
    throw err;
  }
  return { undo, shortfalls };
}

export interface TakeAnywhereResult extends TakeStockResult {
  /** The branch that supplied the most units — recorded on the order as the one that dispatches it. */
  branch: string;
}

/**
 * Take lines out of stock WITHOUT the shopper (or caller) naming a branch: each line comes from the first
 * branch that holds all of it, or — when no single branch does — is drained from the branches holding the most.
 * The web shop works this way, since customers don't pick a store; the total across the shops is what counts.
 * All-or-nothing like `takeStock`; with `allowShort` (already paid) any unavoidable remainder clamps at zero.
 */
export async function takeStockAnywhere(
  lines: StockLine[],
  opts: Pick<StockWriteOptions, "allowShort"> = {},
): Promise<TakeAnywhereResult> {
  const done: { l: StockLine; branch: string; qty: number }[] = [];
  const shortfalls: TakeStockResult["shortfalls"] = [];
  const perBranch = new Map<string, number>();
  const undo = async () => {
    for (const d of done.splice(0)) {
      try {
        await bumpStock(d.l.productId, d.l.variantIndex, d.branch, d.qty, true);
      } catch (err) {
        console.error("[stock] failed to restore stock for", d.l, err);
      }
    }
  };
  try {
    const todo = lines.filter((l) => l.quantity > 0);
    const products = new Map<string, Awaited<ReturnType<typeof selectProduct>>>();
    for (const id of new Set(todo.map((l) => l.productId))) products.set(id, await selectProduct(id));

    // Decide where each line comes from, from the stock as it is now.
    const plan: { l: StockLine; branch: string; qty: number; clamp: boolean }[] = [];
    for (const l of todo) {
      const prod = products.get(l.productId);
      if (!prod) throw new HttpError(404, `Unknown product: ${l.productId}`);
      const v = prod.variants[l.variantIndex];
      if (!v) throw new HttpError(400, "Unknown variant on this product");
      const have = (b: string) => v.stockByBranch[b] ?? 0;
      const single = BRANCH_KEYS.find((b) => have(b) >= l.quantity);
      if (single) { plan.push({ l, branch: single, qty: l.quantity, clamp: false }); continue; }
      let need = l.quantity;
      for (const b of [...BRANCH_KEYS].sort((a, c) => have(c) - have(a))) {
        const take = Math.min(need, have(b));
        if (take > 0) { plan.push({ l, branch: b, qty: take, clamp: false }); need -= take; }
      }
      if (need > 0) {
        const total = BRANCH_KEYS.reduce((n, b) => n + have(b), 0);
        if (!opts.allowShort) throw new HttpError(409, `${prod.name} — only ${total} in stock, ${l.quantity} needed`);
        const top = [...BRANCH_KEYS].sort((a, c) => have(c) - have(a))[0];
        plan.push({ l, branch: top, qty: need, clamp: true });
        shortfalls.push({ ...l, onHand: total });
      }
    }

    // Each write is atomic and guarded; if one is refused (stock moved in the meantime), the rest are put back.
    const results = await Promise.allSettled(
      plan.map((p) => bumpStock(p.l.productId, p.l.variantIndex, p.branch, -p.qty, p.clamp)),
    );
    results.forEach((res, i) => {
      if (res.status === "fulfilled" && res.value) {
        const p = plan[i];
        const taken = p.clamp ? Math.min(p.qty, res.value.before) : p.qty;
        if (taken > 0) {
          done.push({ l: p.l, branch: p.branch, qty: taken });
          perBranch.set(p.branch, (perBranch.get(p.branch) ?? 0) + taken);
        }
      }
    });
    for (let i = 0; i < plan.length; i++) {
      const res = results[i];
      if (res.status === "rejected") throw res.reason;
      if (res.value === undefined) throw new HttpError(400, "Unknown variant on this product");
      if (res.value === null) {
        const name = products.get(plan[i].l.productId)?.name ?? plan[i].l.productId;
        throw new HttpError(409, `${name} — someone just bought the last of it. Please refresh your cart.`);
      }
    }
  } catch (err) {
    await undo();
    throw err;
  }
  const branch = [...perBranch.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? BRANCH_KEYS[0];
  return { undo, shortfalls, branch };
}
