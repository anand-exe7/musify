import { and, asc, eq, ne } from "drizzle-orm";
import { HttpError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { branches } from "@/lib/db/schema";
import { BUSINESS } from "@/lib/data/business";
import { row, rows, definedOnly } from "./_util";

export interface BranchProfile {
  id: string; // "Branch 1" | "Branch 2"
  name: string;
  city: string;
  address: string;
  gstin: string;
  phone: string;
  /** Letters used in this branch's invoice references (e.g. "V", "1MH"). */
  code: string;
  active: boolean;
}

/** Seed the two known branches from the business profile, once, idempotently. */
async function seedDefaults(): Promise<void> {
  await db
    .insert(branches)
    .values(
      BUSINESS.branches.map((b) => ({
        id: b.key,
        name: b.area,
        city: b.city,
        address: `${b.street}, ${b.zip}`,
        gstin: BUSINESS.gstin,
        phone: b.phone,
        active: true,
      })),
    )
    .onConflictDoNothing();
}

/**
 * All branches, ordered by key. Self-seeds from the business profile the first
 * time it is read against an empty table, so the branches list is never blank.
 */
export async function getBranches(): Promise<BranchProfile[]> {
  let r = await db.select().from(branches).orderBy(asc(branches.id));
  if (r.length === 0) {
    await seedDefaults();
    r = await db.select().from(branches).orderBy(asc(branches.id));
  }
  return rows<BranchProfile>(r);
}

export async function updateBranch(id: string, patch: Partial<BranchProfile>): Promise<BranchProfile | undefined> {
  if (patch.code !== undefined) {
    const code = patch.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,6}$/.test(code)) throw new HttpError(400, "Invoice code must be 1–6 letters or digits.");
    const [clash] = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.code, code), ne(branches.id, id))).limit(1);
    if (clash) throw new HttpError(400, `The code ${code} is already used by another branch.`);
    patch = { ...patch, code };
  }
  const set = definedOnly(patch) as Partial<typeof branches.$inferInsert>;
  if (Object.keys(set).length === 0) {
    const [r] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
    return r ? row<BranchProfile>(r) : undefined;
  }
  const [r] = await db.update(branches).set(set).where(eq(branches.id, id)).returning();
  return r ? row<BranchProfile>(r) : undefined;
}
