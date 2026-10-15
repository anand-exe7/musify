import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { repairTickets } from "@/lib/db/schema";
import type { RepairTicket } from "@/lib/store/repair";
import { row, rows, definedOnly } from "./_util";
import { genDocId } from "@/lib/ids";
import { HttpError } from "@/lib/api/errors";
import { adjustProductStock } from "./stockOps";
import type { ServicePart } from "@/lib/billing/serviceInvoice";

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

/** Check a parts list from the client; returns it cleaned. */
export function cleanParts(parts: unknown): ServicePart[] {
  if (!Array.isArray(parts)) throw new HttpError(400, "Parts must be a list.");
  return parts.map((raw) => {
    const p = raw as Partial<ServicePart>;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    if (!name) throw new HttpError(400, "Each part needs a name.");
    if (!Number.isInteger(p.qty) || (p.qty as number) <= 0) throw new HttpError(400, `${name}: quantity must be a whole number above 0.`);
    if (!Number.isInteger(p.price) || (p.price as number) < 0) throw new HttpError(400, `${name}: price must be a whole number of paise.`);
    const gst = Number(p.gst ?? 0);
    if (!Number.isInteger(gst) || gst < 0 || gst > 100) throw new HttpError(400, `${name}: GST % must be a whole number from 0 to 100.`);
    const productId = typeof p.productId === "string" && p.productId ? p.productId : undefined;
    return {
      id: typeof p.id === "string" && p.id ? p.id : crypto.randomUUID(),
      ...(productId ? { productId, variantIndex: Number.isInteger(p.variantIndex) ? (p.variantIndex as number) : 0 } : {}),
      name, hsn: typeof p.hsn === "string" ? p.hsn : undefined, qty: p.qty as number, price: p.price as number, gst,
    };
  });
}

/**
 * Move stock to match a change in a ticket's parts: units added to the list leave
 * the ticket's branch, units removed go back. Returns a function that undoes it, for
 * when the ticket write that follows fails. Throws 409 if the branch is short.
 */
export async function applyPartsStock(branch: string, before: ServicePart[], after: ServicePart[]): Promise<() => Promise<void>> {
  const net = new Map<string, { productId: string; variantIndex: number; delta: number }>();
  const add = (p: ServicePart, sign: 1 | -1) => {
    if (!p.productId) return;
    const vi = p.variantIndex ?? 0;
    const k = `${p.productId}#${vi}`;
    const cur = net.get(k) ?? { productId: p.productId, variantIndex: vi, delta: 0 };
    cur.delta += sign * p.qty;
    net.set(k, cur);
  };
  before.forEach((p) => add(p, 1)); // old parts go back…
  after.forEach((p) => add(p, -1)); // …new parts come out
  const done: { productId: string; variantIndex: number; delta: number }[] = [];
  const undo = async () => {
    for (const d of done.splice(0).reverse()) {
      try {
        await adjustProductStock(d.productId, [{ variantIndex: d.variantIndex, branch, delta: -d.delta }], { allowShort: true });
      } catch (e) {
        console.error("[repair] couldn't undo parts stock", d, e);
      }
    }
  };
  try {
    // Take-outs first so a shortfall fails before anything is put back.
    for (const d of [...net.values()].filter((x) => x.delta !== 0).sort((a, b) => a.delta - b.delta)) {
      await adjustProductStock(d.productId, [{ variantIndex: d.variantIndex, branch, delta: d.delta }]);
      done.push(d);
    }
  } catch (e) {
    await undo();
    throw e;
  }
  return undo;
}
