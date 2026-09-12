import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { gstSettings, deliverySettings, deliveryZones } from "@/lib/db/schema";
import type { Zone } from "@/lib/store/settings";
import { row, rows, definedOnly } from "./_util";

const DEFAULT = "default";

export type GstSettings = Omit<typeof gstSettings.$inferSelect, "id">;
export type DeliverySettings = Omit<typeof deliverySettings.$inferSelect, "id"> & { zones: Zone[] };

/* ───────────────────────────────  GST  ─────────────────────────────── */

export async function getGstSettings(): Promise<GstSettings> {
  const [r] = await db.select().from(gstSettings).where(eq(gstSettings.id, DEFAULT)).limit(1);
  if (r) {
    const { id: _id, ...rest } = r;
    return rest;
  }
  // Fall back to column defaults if the row was never seeded.
  const [created] = await db.insert(gstSettings).values({ id: DEFAULT }).returning();
  const { id: _id, ...rest } = created;
  return rest;
}

export async function updateGstSettings(patch: Partial<GstSettings>): Promise<GstSettings> {
  const set = definedOnly(patch) as Partial<typeof gstSettings.$inferInsert>;
  const [r] = await db
    .insert(gstSettings)
    .values({ id: DEFAULT, ...set })
    .onConflictDoUpdate({ target: gstSettings.id, set })
    .returning();
  const { id: _id, ...rest } = r;
  return rest;
}

/* ─────────────────────────────  Delivery  ──────────────────────────── */

export async function getDeliverySettings(): Promise<DeliverySettings> {
  let [r] = await db
    .select()
    .from(deliverySettings)
    .where(eq(deliverySettings.id, DEFAULT))
    .limit(1);
  if (!r) {
    // Seed the default row from column defaults if it doesn't exist yet.
    [r] = await db.insert(deliverySettings).values({ id: DEFAULT }).returning();
  }
  const { id: _id, ...rest } = r;
  const zones = await getZones();
  return { ...rest, zones };
}

export async function updateDeliverySettings(
  patch: Partial<Omit<DeliverySettings, "zones">>,
): Promise<Omit<DeliverySettings, "zones">> {
  const set = definedOnly(patch) as Partial<typeof deliverySettings.$inferInsert>;
  const [r] = await db
    .insert(deliverySettings)
    .values({ id: DEFAULT, ...set })
    .onConflictDoUpdate({ target: deliverySettings.id, set })
    .returning();
  const { id: _id, ...rest } = r;
  return rest;
}

/* ──────────────────────────  Delivery zones  ───────────────────────── */

export async function getZones(): Promise<Zone[]> {
  return rows<Zone>(await db.select().from(deliveryZones));
}

export async function createZone(z: Zone): Promise<Zone> {
  const [r] = await db.insert(deliveryZones).values(z).returning();
  return row<Zone>(r);
}

export async function updateZone(id: string, patch: Partial<Zone>): Promise<Zone | undefined> {
  const set = definedOnly(patch) as Partial<typeof deliveryZones.$inferInsert>;
  if (Object.keys(set).length === 0) {
    const [r] = await db.select().from(deliveryZones).where(eq(deliveryZones.id, id)).limit(1);
    return r ? row<Zone>(r) : undefined;
  }
  const [r] = await db.update(deliveryZones).set(set).where(eq(deliveryZones.id, id)).returning();
  return r ? row<Zone>(r) : undefined;
}

export async function deleteZone(id: string): Promise<boolean> {
  const r = await db
    .delete(deliveryZones)
    .where(eq(deliveryZones.id, id))
    .returning({ id: deliveryZones.id });
  return r.length > 0;
}
