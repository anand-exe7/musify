import { asc, eq } from "drizzle-orm";
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
  const set = definedOnly(patch) as Partial<typeof branches.$inferInsert>;
  if (Object.keys(set).length === 0) {
    const [r] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
    return r ? row<BranchProfile>(r) : undefined;
  }
  const [r] = await db.update(branches).set(set).where(eq(branches.id, id)).returning();
  return r ? row<BranchProfile>(r) : undefined;
}
