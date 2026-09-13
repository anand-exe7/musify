import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { repairTickets } from "@/lib/db/schema";
import type { RepairTicket } from "@/lib/store/repair";
import { row, rows, definedOnly } from "./_util";
import { genDocId } from "@/lib/ids";

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
 * Generate the next service-invoice number, e.g. `SER-2026-7QK3M`. Checks the
 * DB for a free code before returning it, retrying on the rare clash.
 */
export async function nextServiceInvoiceNo(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = genDocId("SER");
    const [existing] = await db
      .select({ id: repairTickets.id })
      .from(repairTickets)
      .where(eq(repairTickets.invoiceNo, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique service invoice number");
}
