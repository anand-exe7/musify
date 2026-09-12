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

/**
 * Find-or-create a user from a verified Google profile, keyed by email.
 *
 * Admin status is owned entirely by the database `is_admin` column — sign-in
 * NEVER changes it:
 * - Existing user: refresh name/avatar/googleId/lastLogin only; `is_admin` is
 *   left exactly as the DB has it.
 * - New user: created as a non-admin `customer`. Grant admin later in the DB
 *   (e.g. `npm run admin:set -- their@email`, or Drizzle Studio).
 */
export async function upsertGoogleUser(profile: {
  googleId: string;
  email: string;
  name: string;
  avatar?: string | null;
}): Promise<User> {
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const existing = await getUserByEmail(profile.email);

  if (existing) {
    const [r] = await db
      .update(users)
      .set({
        name: profile.name,
        googleId: profile.googleId,
        avatar: profile.avatar ?? null,
        lastLogin: now,
        // isAdmin intentionally omitted — the DB column is authoritative.
      })
      .where(eq(users.id, existing.id))
      .returning();
    return row<User>(r);
  }

  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const [r] = await db
    .insert(users)
    .values({
      id,
      name: profile.name,
      email: profile.email,
      phone: "",
      role: "customer",
      active: true,
      isAdmin: false,
      googleId: profile.googleId,
      avatar: profile.avatar ?? null,
      lastLogin: now,
      permissions: { billing: false, inventory: false, analytics: false, users: false },
    })
    .returning();
  return row<User>(r);
}
