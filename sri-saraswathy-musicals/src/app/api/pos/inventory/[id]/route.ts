import type { NextRequest } from "next/server";
import { handle, ok, notFound, noContent, readJson, badRequest } from "@/lib/api/http";
import { updateInventoryProduct, deleteInventoryProduct, type StockChange } from "@/lib/db/queries/pos";
import { isBranch } from "@/lib/stock";
import type { InvProduct, Variant } from "@/lib/store/pos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Phase 7 staff price lock: strip price-shaped fields from a non-admin patch.
 *
 * `basePrice` and `mrp` are dropped outright. For `variants`, we look up the
 * DB's current variants and rewrite each incoming variant's `price` to the DB
 * value at the same index — so a stale UI editing variant stock/attr can't
 * accidentally overwrite the price. Adding or removing variants stays admin-only.
 */
async function sanitizeForStaff(id: string, raw: Partial<InvProduct>): Promise<Partial<InvProduct>> {
  const { basePrice: _b, mrp: _m, variants, ...rest } = raw;
  void _b;
  void _m;
  const clean: Partial<InvProduct> = { ...rest };
  if (!variants) return clean;
  const { getInventory } = await import("@/lib/db/queries/pos");
  const existing = (await getInventory()).find((p) => p.id === id);
  if (!existing) return clean;
  if (variants.length !== existing.variants.length) {
    throw new Error("Only admins can add or remove variants");
  }
  clean.variants = variants.map((v, i) => ({ ...v, price: existing.variants[i].price } as Variant));
  return clean;
}

export function PATCH(request: NextRequest, ctx: Ctx) {
  return handle("staff", async ({ user, access }) => {
    const { id } = await ctx.params;
    const { stockChanges: rawChanges, ...raw } = await readJson<Partial<InvProduct> & { stockChanges?: unknown }>(request);
    // Stock figures the editor changed. A branch user may only change their own
    // branch's stock — anything for the other branch is refused, not ignored.
    const stockChanges: StockChange[] = [];
    for (const c of Array.isArray(rawChanges) ? (rawChanges as Partial<StockChange>[]) : []) {
      if (!c || !isBranch(c.branch) || !Number.isInteger(c.variantIndex) || (c.variantIndex as number) < 0 || !Number.isInteger(c.from) || !Number.isInteger(c.to) || (c.to as number) < 0) {
        return badRequest("Invalid stock change");
      }
      if (access !== "all" && c.branch !== access) return badRequest("You can only change stock at your own branch");
      stockChanges.push(c as StockChange);
    }
    let patch: Partial<InvProduct>;
    try {
      patch = user.isAdmin ? raw : await sanitizeForStaff(id, raw);
    } catch (e) {
      return badRequest(e instanceof Error ? e.message : "Invalid patch");
    }
    const p = await updateInventoryProduct(id, patch, stockChanges);
    return p ? ok(p) : notFound("Inventory product not found");
  });
}

export function DELETE(_request: NextRequest, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    return (await deleteInventoryProduct(id)) ? noContent() : notFound("Inventory product not found");
  });
}
