import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { stockInward, products } from "@/lib/db/schema";
import { setVariantStockAt, variantStockAt, type Branch } from "@/lib/stock";
import { genDocId } from "@/lib/ids";
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

  // Apply to inventory: add the received qty to the target branch's bucket on
  // the chosen variant, and refresh the product's cost. Other branch buckets
  // and other variants are untouched.
  if (prod && v) {
    const branch = input.branch as Branch;
    const existing = variantStockAt(v, branch);
    const nextVariants = variants.map((x, i) =>
      i === input.variantIndex ? setVariantStockAt(x, branch, existing + input.quantity) : x,
    );
    await db
      .update(products)
      .set({ variants: nextVariants, cost: input.unitCost })
      .where(eq(products.id, input.productId));
  }

  return row<StockInwardRecord>(saved);
}

/* ───────────────────────────  Multi-line batch  ─────────────────────────── */

const BRANCHES: Branch[] = ["Branch 1", "Branch 2"];

/** One product/variant received, split across branches. */
export interface InwardBatchLine {
  productId: string;
  variantIndex: number;
  /** Purchase cost per unit, paise. */
  unitCost: number;
  quantity: number;
  /** Per-branch split; must sum to `quantity`. */
  allocations: { branch: Branch; quantity: number }[];
}

export class InwardValidationError extends Error {}

/**
 * Validate a batch against the live catalog *before* anything is written, so a
 * bad line rejects the whole batch instead of leaving it half-applied (the
 * Neon HTTP driver has no multi-statement transactions).
 */
export async function validateInwardBatch(
  lines: InwardBatchLine[],
  allowedBranch: Branch | null,
): Promise<void> {
  if (!Array.isArray(lines) || lines.length === 0) throw new InwardValidationError("Add at least one line.");
  const cache = new Map<string, (typeof products.$inferSelect) | undefined>();
  for (const [n, l] of lines.entries()) {
    const at = `Line ${n + 1}`;
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new InwardValidationError(`${at}: quantity must be a whole number ≥ 1.`);
    if (!Number.isInteger(l.unitCost) || l.unitCost < 0) throw new InwardValidationError(`${at}: invalid unit cost.`);
    if (!Array.isArray(l.allocations) || l.allocations.length === 0) throw new InwardValidationError(`${at}: no branch split.`);
    let sum = 0;
    const seen = new Set<string>();
    for (const a of l.allocations) {
      if (!BRANCHES.includes(a.branch)) throw new InwardValidationError(`${at}: unknown branch.`);
      if (seen.has(a.branch)) throw new InwardValidationError(`${at}: duplicate branch in split.`);
      seen.add(a.branch);
      if (!Number.isInteger(a.quantity) || a.quantity < 0) throw new InwardValidationError(`${at}: invalid split quantity.`);
      if (allowedBranch && a.branch !== allowedBranch && a.quantity > 0) {
        throw new InwardValidationError(`${at}: you can only receive into ${allowedBranch}.`);
      }
      sum += a.quantity;
    }
    if (sum !== l.quantity) throw new InwardValidationError(`${at}: split (${sum}) doesn't match quantity (${l.quantity}).`);
    if (!cache.has(l.productId)) {
      const [prod] = await db.select().from(products).where(eq(products.id, l.productId)).limit(1);
      cache.set(l.productId, prod);
    }
    const prod = cache.get(l.productId);
    if (!prod) throw new InwardValidationError(`${at}: product not found.`);
    if (!prod.variants?.[l.variantIndex]) throw new InwardValidationError(`${at}: variant not found.`);
  }
}

/**
 * Record a multi-product receipt. Each line becomes one `stock_inward` row per
 * branch that got a non-zero share; on-hand is bumped per branch and the
 * product cost refreshed. Lines run sequentially so repeated products read the
 * stock the previous line just wrote.
 */
export async function createInwardBatch(
  vendorId: string,
  lines: InwardBatchLine[],
  createdBy: string,
  allowedBranch: Branch | null,
): Promise<StockInwardRecord[]> {
  await validateInwardBatch(lines, allowedBranch);
  const saved: StockInwardRecord[] = [];
  for (const l of lines) {
    for (const a of l.allocations) {
      if (a.quantity <= 0) continue;
      saved.push(
        await createInward({
          id: genDocId("INW"),
          vendorId,
          productId: l.productId,
          variantIndex: l.variantIndex,
          quantity: a.quantity,
          unitCost: l.unitCost,
          branch: a.branch,
          createdBy,
        }),
      );
    }
  }
  return saved;
}
