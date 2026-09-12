import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { User } from "@/types";
import { row, rows, definedOnly } from "./_util";

export async function getUsers(): Promise<User[]> {
  return rows<User>(await db.select().from(users));
}

export async function getUser(id: string): Promise<User | undefined> {
  const [r] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return r ? row<User>(r) : undefined;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [r] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return r ? row<User>(r) : undefined;
}

export async function createUser(u: User): Promise<User> {
  const [r] = await db.insert(users).values(u).returning();
  return row<User>(r);
}

export async function updateUser(id: string, patch: Partial<User>): Promise<User | undefined> {
  const set = definedOnly(patch) as Partial<typeof users.$inferInsert>;
  if (Object.keys(set).length === 0) return getUser(id);
  const [r] = await db.update(users).set(set).where(eq(users.id, id)).returning();
  return r ? row<User>(r) : undefined;
}

export async function deleteUser(id: string): Promise<boolean> {
  const r = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  return r.length > 0;
}
