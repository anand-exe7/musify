import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";
import type { Vendor } from "@/types";
import { row, rows, definedOnly, isForeignKeyViolation } from "./_util";
import { HttpError } from "@/lib/api/errors";

export async function getVendors(): Promise<Vendor[]> {
  return rows<Vendor>(await db.select().from(vendors));
}

export async function getVendor(id: string): Promise<Vendor | undefined> {
  const [r] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  return r ? row<Vendor>(r) : undefined;
}

export async function createVendor(v: Vendor): Promise<Vendor> {
  const [r] = await db.insert(vendors).values(v).returning();
  return row<Vendor>(r);
}

export async function updateVendor(id: string, patch: Partial<Vendor>): Promise<Vendor | undefined> {
  const set = definedOnly(patch) as Partial<typeof vendors.$inferInsert>;
  if (Object.keys(set).length === 0) return getVendor(id);
  const [r] = await db.update(vendors).set(set).where(eq(vendors.id, id)).returning();
  return r ? row<Vendor>(r) : undefined;
}

export async function deleteVendor(id: string): Promise<boolean> {
  try {
    const r = await db.delete(vendors).where(eq(vendors.id, id)).returning({ id: vendors.id });
    return r.length > 0;
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new HttpError(409, "This vendor has stock receipts on record, so it can't be deleted.");
    }
    throw err;
  }
}
