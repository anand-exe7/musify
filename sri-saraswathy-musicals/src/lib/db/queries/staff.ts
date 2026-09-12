import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import type { Staff } from "@/lib/store/staff";
import { row, rows, definedOnly } from "./_util";

export async function getStaff(): Promise<Staff[]> {
  return rows<Staff>(await db.select().from(staff));
}

export async function createStaff(s: Staff): Promise<Staff> {
  const [r] = await db.insert(staff).values(s).returning();
  return row<Staff>(r);
}

export async function updateStaff(id: string, patch: Partial<Staff>): Promise<Staff | undefined> {
  const set = definedOnly(patch) as Partial<typeof staff.$inferInsert>;
  if (Object.keys(set).length === 0) {
    const [r] = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
    return r ? row<Staff>(r) : undefined;
  }
  const [r] = await db.update(staff).set(set).where(eq(staff.id, id)).returning();
  return r ? row<Staff>(r) : undefined;
}

export async function deleteStaff(id: string): Promise<boolean> {
  const r = await db.delete(staff).where(eq(staff.id, id)).returning({ id: staff.id });
  return r.length > 0;
}
