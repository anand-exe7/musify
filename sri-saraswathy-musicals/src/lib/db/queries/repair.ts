import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { repairTickets, counters } from "@/lib/db/schema";
import type { RepairTicket } from "@/lib/store/repair";
import { row, rows, definedOnly } from "./_util";

const SEQ_KEY = "service_invoice_seq";

export async function getTickets(): Promise<RepairTicket[]> {
  return rows<RepairTicket>(await db.select().from(repairTickets).orderBy(desc(repairTickets.createdAt)));
}

export async function getTicket(id: string): Promise<RepairTicket | undefined> {
  const [r] = await db.select().from(repairTickets).where(eq(repairTickets.id, id)).limit(1);
  return r ? row<RepairTicket>(r) : undefined;
}

export async function createTicket(t: RepairTicket): Promise<RepairTicket> {
  const [r] = await db.insert(repairTickets).values(t).returning();
  return row<RepairTicket>(r);
}

export async function updateTicket(
  id: string,
  patch: Partial<RepairTicket>,
  eventLabel?: string,
): Promise<RepairTicket | undefined> {
  const current = await getTicket(id);
  if (!current) return undefined;

  const set = definedOnly(patch) as Partial<typeof repairTickets.$inferInsert>;
  set.updatedAt = new Date().toISOString();
  if (eventLabel) {
    set.events = [...current.events, { at: new Date().toISOString(), label: eventLabel }];
  }
  const [r] = await db.update(repairTickets).set(set).where(eq(repairTickets.id, id)).returning();
  return r ? row<RepairTicket>(r) : undefined;
}

export async function deleteTicket(id: string): Promise<boolean> {
  const r = await db
    .delete(repairTickets)
    .where(eq(repairTickets.id, id))
    .returning({ id: repairTickets.id });
  return r.length > 0;
}

/**
 * Atomically claim the next service-invoice serial, e.g. `SVC/26-27/0009`.
 * Uses an upsert with `value = counters.value + 1` so concurrent callers can't
 * collide on the same number.
 */
export async function nextServiceInvoiceNo(): Promise<string> {
  const [r] = await db
    .insert(counters)
    .values({ key: SEQ_KEY, value: 10 }) // seed starts at 9 → first claim returns 9, stores 10
    .onConflictDoUpdate({
      target: counters.key,
      set: { value: sql`${counters.value} + 1` },
    })
    .returning({ value: counters.value });
  const seq = r.value - 1;
  return `SVC/26-27/${String(seq).padStart(4, "0")}`;
}
