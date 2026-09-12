import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { inquiries } from "@/lib/db/schema";
import type { Inquiry } from "@/lib/store/inquiry";
import { row, rows, definedOnly } from "./_util";

export async function getInquiries(): Promise<Inquiry[]> {
  return rows<Inquiry>(await db.select().from(inquiries).orderBy(desc(inquiries.createdAt)));
}

export async function getInquiry(id: string): Promise<Inquiry | undefined> {
  const [r] = await db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1);
  return r ? row<Inquiry>(r) : undefined;
}

export async function createInquiry(i: Inquiry): Promise<Inquiry> {
  const [r] = await db.insert(inquiries).values(i).returning();
  return row<Inquiry>(r);
}

export async function updateInquiry(
  id: string,
  patch: Partial<Inquiry>,
): Promise<Inquiry | undefined> {
  const set = definedOnly(patch) as Partial<typeof inquiries.$inferInsert>;
  if (Object.keys(set).length === 0) return getInquiry(id);
  const [r] = await db.update(inquiries).set(set).where(eq(inquiries.id, id)).returning();
  return r ? row<Inquiry>(r) : undefined;
}

export async function deleteInquiry(id: string): Promise<boolean> {
  const r = await db.delete(inquiries).where(eq(inquiries.id, id)).returning({ id: inquiries.id });
  return r.length > 0;
}
