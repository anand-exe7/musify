import { and, asc, desc, eq, exists, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, invoices } from "@/lib/db/schema";
import type { Invoice } from "@/types";
import { normalizePhone } from "@/lib/customers/phone";
import { rows } from "./_util";

/** `null` = every branch (a full admin); otherwise only invoices in these branches are counted or listed. */
export type BranchScope = string[] | null;

export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  gstin: string | null;
  createdAt: string;
  /** Invoices (not cancelled) in the branches the viewer may see. */
  bills: number;
  /** Paise, same scope as `bills`. */
  total: number;
  lastPurchase: string | null;
}

export interface CustomersPage {
  items: CustomerRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
}

const likeOf = (q: string) => `%${q.replace(/[\%_]/g, "\$&")}%`;
const isWalkIn = (name: string) => ["", "walk-in"].includes(name.trim().toLowerCase());

/**
 * File a customer under their mobile number: created the first time, after that the name and GSTIN follow the latest
 * bill that gave them (a blank or "Walk-in" never wipes a real name). Returns the customer's id, or null when the
 * number isn't a valid mobile.
 */
export async function upsertCustomer(input: { phone: string | null | undefined; name?: string | null; gstin?: string | null }, at = new Date().toISOString()): Promise<string | null> {
  const phone = normalizePhone(input.phone);
  if (!phone) return null;
  const name = isWalkIn(input.name ?? "") ? "" : (input.name ?? "").trim();
  const gstin = (input.gstin ?? "").trim() || null;
  const [r] = await db
    .insert(customers)
    .values({ id: crypto.randomUUID(), phone, name, gstin, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: customers.phone,
      set: {
        name: sql`case when ${name} <> '' then ${name} else ${customers.name} end`,
        gstin: sql`coalesce(${gstin}, ${customers.gstin})`,
        updatedAt: at,
      },
    })
    .returning({ id: customers.id });
  return r?.id ?? null;
}

/** For the billing counter: is this number a known customer, and have they bought before? Not branch-limited. */
export async function lookupCustomer(rawPhone: string): Promise<{ id: string; name: string; phone: string; gstin: string | null; bills: number; lastPurchase: string | null } | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const [c] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  if (!c) return null;
  const [s] = await db
    .select({
      bills: sql<number>`count(*)`.mapWith(Number),
      last: sql<string | null>`max(${invoices.date})`,
    })
    .from(invoices)
    .where(and(eq(invoices.customerId, c.id), sql`${invoices.status} <> 'cancelled'`));
  return { id: c.id, name: c.name, phone: c.phone, gstin: c.gstin, bills: s?.bills ?? 0, lastPurchase: s?.last ?? null };
}

/** A customer is visible to a branch user only when one of their branches has billed them. */
const visibleIn = (scope: BranchScope): SQL | undefined =>
  scope === null ? undefined : exists(db.select({ one: sql`1` }).from(invoices).where(and(eq(invoices.customerId, customers.id), inArray(invoices.branch, scope))));

export async function getCustomersPage(f: { q?: string; page?: number; pageSize?: number; scope: BranchScope }): Promise<CustomersPage> {
  const q = (f.q ?? "").trim();
  // Text is searched as a name; something that looks like a phone number (digits, spaces, + - ( )) as a number too.
  const digits = /^[\d\s+\-()]+$/.test(q) ? q.replace(/\D/g, "") : "";
  const search = q
    ? or(ilike(customers.name, likeOf(q)), digits ? ilike(customers.phone, likeOf(digits)) : undefined)
    : undefined;
  const where = and(search, visibleIn(f.scope));
  const pageSize = Math.min(5000, Math.max(1, Math.floor(f.pageSize ?? 10) || 10));

  const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(customers).where(where);
  const pages = Math.max(1, Math.ceil(n / pageSize));
  const page = Math.min(Math.max(1, Math.floor(f.page ?? 1) || 1), pages);

  const counted = sql`${invoices.status} <> 'cancelled'`;
  const lastPurchase = sql<string | null>`max(${invoices.date}) filter (where ${counted})`;
  const joinOn = and(eq(invoices.customerId, customers.id), f.scope === null ? undefined : inArray(invoices.branch, f.scope));
  const list = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      gstin: customers.gstin,
      createdAt: customers.createdAt,
      bills: sql<number>`count(${invoices.id}) filter (where ${counted})`.mapWith(Number),
      total: sql<number>`coalesce(sum(${invoices.total}) filter (where ${counted}), 0)`.mapWith(Number),
      lastPurchase,
    })
    .from(customers)
    .leftJoin(invoices, joinOn)
    .where(where)
    .groupBy(customers.id)
    .orderBy(sql`${lastPurchase} desc nulls last`, desc(customers.createdAt), asc(customers.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { items: list, total: n, page, pages, pageSize };
}

/** One customer with their invoices (newest first), limited to the viewer's branches. Undefined when unknown or not visible. */
export async function getCustomerDetail(id: string, scope: BranchScope): Promise<{ customer: Omit<CustomerRow, "bills" | "total" | "lastPurchase">; invoices: Invoice[] } | undefined> {
  const [c] = await db.select().from(customers).where(and(eq(customers.id, id), visibleIn(scope))).limit(1);
  if (!c) return undefined;
  const list = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.customerId, id), scope === null ? undefined : inArray(invoices.branch, scope)))
    .orderBy(desc(invoices.date), desc(invoices.number));
  return {
    customer: { id: c.id, name: c.name, phone: c.phone, gstin: c.gstin, createdAt: c.createdAt },
    invoices: rows<Invoice>(list),
  };
}

