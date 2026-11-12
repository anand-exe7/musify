import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { gstSettings, deliverySettings, deliveryZones, deliveryRates, deliveryMethods } from "@/lib/db/schema";
import type { Zone, RateBand, DeliveryMethod } from "@/lib/delivery/types";
import { row, rows, definedOnly } from "./_util";

const DEFAULT = "default";

export type GstSettings = Omit<typeof gstSettings.$inferSelect, "id">;
export type DeliverySettings = Omit<typeof deliverySettings.$inferSelect, "id"> & {
  zones: Zone[];
  /** What checkout may offer — entirely admin-defined. */
  methods: DeliveryMethod[];
};

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
  const [zones, methods] = await Promise.all([getZones(), getDeliveryMethods()]);
  return { ...rest, zones, methods };
}

export async function updateDeliverySettings(
  patch: Partial<Omit<DeliverySettings, "zones" | "methods">>,
): Promise<Omit<DeliverySettings, "zones" | "methods">> {
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

/** Zones with their weight ladders, lightest band first. Two reads, joined in memory. */
export async function getZones(): Promise<Zone[]> {
  const [zs, rs] = await Promise.all([
    db.select({ id: deliveryZones.id, name: deliveryZones.name, states: deliveryZones.states, eta: deliveryZones.eta }).from(deliveryZones),
    db.select().from(deliveryRates).orderBy(asc(deliveryRates.position), asc(deliveryRates.minG)),
  ]);
  const byZone = new Map<string, RateBand[]>();
  for (const r of rs) {
    const list = byZone.get(r.zoneId) ?? [];
    // Rows written before bands were required could carry a null top; read it as the ceiling.
    list.push({ id: r.id, minG: r.minG, maxG: r.maxG ?? OPEN_BAND_CEILING_G, price: r.price, position: r.position });
    byZone.set(r.zoneId, list);
  }
  // The fallback ("Rest of India") sorts last, so the admin reads the named zones first.
  return zs
    .map((z) => ({ ...z, rates: byZone.get(z.id) ?? [] }))
    .sort((a, b) =>
      a.states.length === 0 && b.states.length > 0 ? 1 : b.states.length === 0 && a.states.length > 0 ? -1 : a.name.localeCompare(b.name),
    );
}

export async function createZone(z: Pick<Zone, "id" | "name"> & Partial<Zone>): Promise<Zone> {
  await db.insert(deliveryZones).values({ id: z.id, name: z.name, states: z.states ?? [], eta: z.eta ?? "" });
  if (z.rates?.length) await db.insert(deliveryRates).values(z.rates.map((r, i) => ({ ...r, zoneId: z.id, position: r.position ?? i })));
  return { id: z.id, name: z.name, states: z.states ?? [], eta: z.eta ?? "", rates: z.rates ?? [] };
}

/** Patch a zone's own fields. The weight bands have their own endpoints — `rates` here is ignored. */
export async function updateZone(id: string, patch: Partial<Zone>): Promise<Zone | undefined> {
  const { rates: _rates, id: _id, ...fields } = patch;
  void _rates;
  void _id;
  const set = definedOnly(fields) as Partial<typeof deliveryZones.$inferInsert>;
  if (Object.keys(set).length > 0) await db.update(deliveryZones).set(set).where(eq(deliveryZones.id, id));
  return (await getZones()).find((z) => z.id === id);
}

export async function deleteZone(id: string): Promise<boolean> {
  const r = await db.delete(deliveryZones).where(eq(deliveryZones.id, id)).returning({ id: deliveryZones.id });
  return r.length > 0;
}

/* ─────────────────────  Weight bands inside a zone  ───────────────────── */

/** What a legacy open-ended band ("501 g and above") is read as: 50 kg, past anything a shop posts. */
const OPEN_BAND_CEILING_G = 50_000;

export async function createRate(zoneId: string, r: RateBand): Promise<RateBand> {
  const [out] = await db
    .insert(deliveryRates)
    .values({ id: r.id, zoneId, minG: r.minG, maxG: r.maxG, price: r.price, position: r.position })
    .returning();
  return { id: out.id, minG: out.minG, maxG: out.maxG ?? OPEN_BAND_CEILING_G, price: out.price, position: out.position };
}

export async function updateRate(id: string, patch: Partial<RateBand>): Promise<RateBand | undefined> {
  // `maxG: null` is a real value here (the open-ended top band), so it must not be dropped.
  const set: Partial<typeof deliveryRates.$inferInsert> = {};
  if (patch.minG !== undefined) set.minG = patch.minG;
  if (patch.maxG !== undefined) set.maxG = patch.maxG;
  if (patch.price !== undefined) set.price = patch.price;
  if (patch.position !== undefined) set.position = patch.position;
  const [out] =
    Object.keys(set).length > 0
      ? await db.update(deliveryRates).set(set).where(eq(deliveryRates.id, id)).returning()
      : await db.select().from(deliveryRates).where(eq(deliveryRates.id, id)).limit(1);
  return out ? { id: out.id, minG: out.minG, maxG: out.maxG ?? OPEN_BAND_CEILING_G, price: out.price, position: out.position } : undefined;
}

export async function deleteRate(id: string): Promise<boolean> {
  const r = await db.delete(deliveryRates).where(eq(deliveryRates.id, id)).returning({ id: deliveryRates.id });
  return r.length > 0;
}

/* ─────────────────────────  Delivery methods  ───────────────────────── */

export async function getDeliveryMethods(): Promise<DeliveryMethod[]> {
  const rs = await db.select().from(deliveryMethods).orderBy(asc(deliveryMethods.position), asc(deliveryMethods.name));
  return rs.map((m) => ({ ...m, pricing: m.pricing as DeliveryMethod["pricing"] }));
}

export async function createDeliveryMethod(m: DeliveryMethod): Promise<DeliveryMethod> {
  const [out] = await db.insert(deliveryMethods).values(m).returning();
  return { ...out, pricing: out.pricing as DeliveryMethod["pricing"] };
}

export async function updateDeliveryMethod(id: string, patch: Partial<DeliveryMethod>): Promise<DeliveryMethod | undefined> {
  const { id: _id, ...fields } = patch;
  void _id;
  const set = definedOnly(fields) as Partial<typeof deliveryMethods.$inferInsert>;
  const [out] =
    Object.keys(set).length > 0
      ? await db.update(deliveryMethods).set(set).where(eq(deliveryMethods.id, id)).returning()
      : await db.select().from(deliveryMethods).where(eq(deliveryMethods.id, id)).limit(1);
  return out ? { ...out, pricing: out.pricing as DeliveryMethod["pricing"] } : undefined;
}

export async function deleteDeliveryMethod(id: string): Promise<boolean> {
  const r = await db.delete(deliveryMethods).where(eq(deliveryMethods.id, id)).returning({ id: deliveryMethods.id });
  return r.length > 0;
}

