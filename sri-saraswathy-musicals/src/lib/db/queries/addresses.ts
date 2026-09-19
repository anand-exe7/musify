import { eq, and, sql as rawSql } from "drizzle-orm";
import { db } from "@/lib/db";
import { userAddresses } from "@/lib/db/schema";
import type { UserAddress } from "@/types";
import { row, rows } from "./_util";

// Bootstrap the table the first time it's needed (idempotent).
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  try {
    await db.execute(rawSql`
      CREATE TABLE IF NOT EXISTS "user_addresses" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "name" text NOT NULL,
        "phone" text DEFAULT '' NOT NULL,
        "type" text DEFAULT 'home' NOT NULL,
        "line1" text DEFAULT '' NOT NULL,
        "line2" text DEFAULT '' NOT NULL,
        "city" text DEFAULT '' NOT NULL,
        "state" text DEFAULT 'Tamil Nadu' NOT NULL,
        "pincode" text DEFAULT '' NOT NULL,
        "is_default" boolean DEFAULT false NOT NULL,
        "created_at" text DEFAULT '' NOT NULL
      )
    `);
    tableReady = true;
  } catch {
    /* table already exists — ignore */
    tableReady = true;
  }
}


export async function getUserAddresses(userId: string): Promise<UserAddress[]> {
  await ensureTable();
  return rows<UserAddress>(
    await db.select().from(userAddresses).where(eq(userAddresses.userId, userId)),
  );
}

export async function getUserAddress(id: string): Promise<UserAddress | undefined> {
  await ensureTable();
  const [r] = await db.select().from(userAddresses).where(eq(userAddresses.id, id)).limit(1);
  return r ? row<UserAddress>(r) : undefined;
}

export async function createUserAddress(addr: UserAddress): Promise<UserAddress> {
  await ensureTable();
  // If this address is marked as default, clear other defaults first.
  if (addr.isDefault) {
    await db
      .update(userAddresses)
      .set({ isDefault: false })
      .where(eq(userAddresses.userId, addr.userId));
  }
  const [r] = await db.insert(userAddresses).values(addr).returning();
  return row<UserAddress>(r);
}

export async function updateUserAddress(
  id: string,
  userId: string,
  patch: Partial<UserAddress>,
): Promise<UserAddress | undefined> {
  await ensureTable();
  // If setting as default, clear others first.
  if (patch.isDefault) {
    await db
      .update(userAddresses)
      .set({ isDefault: false })
      .where(eq(userAddresses.userId, userId));
  }
  // Only allow updates to the owner's own address.
  const [r] = await db
    .update(userAddresses)
    .set(patch as Partial<typeof userAddresses.$inferInsert>)
    .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
    .returning();
  return r ? row<UserAddress>(r) : undefined;
}

export async function deleteUserAddress(id: string, userId: string): Promise<boolean> {
  await ensureTable();
  const r = await db
    .delete(userAddresses)
    .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
    .returning({ id: userAddresses.id });
  return r.length > 0;
}

export async function setDefaultAddress(id: string, userId: string): Promise<UserAddress | undefined> {
  await ensureTable();
  // Clear all defaults for this user.
  await db
    .update(userAddresses)
    .set({ isDefault: false })
    .where(eq(userAddresses.userId, userId));
  // Set the new default.
  const [r] = await db
    .update(userAddresses)
    .set({ isDefault: true })
    .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
    .returning();
  return r ? row<UserAddress>(r) : undefined;
}
