/**
 * Branch-wise invoice references (INV-2026-P0001, 0002…) run per branch and year,
 * independently of the GST tax-invoice number (SSM/2026-27/0021), which stays one
 * sequence across all branches.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@/lib/db/schema");
  const root = path.resolve(import.meta.dirname, "../../../drizzle");
  const pg = new PGlite();
  const journal = JSON.parse(fs.readFileSync(path.join(root, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    for (const stmt of fs.readFileSync(path.join(root, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
  return { db: drizzle(pg, { schema }), ...schema };
});

import { db } from "@/lib/db";
import { branches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createInvoice, nextBranchReference } from "@/lib/db/queries/invoices";
import type { Invoice } from "@/types";

const inv = (id: string, branch: string, number: string, date = "2026-10-01T10:00:00.000Z"): Invoice => ({
  id, number, date, customer: "C", branch, items: [], subtotal: 0, cgst: 0, sgst: 0, igst: 0, total: 0, paymentMode: "cash", status: "paid",
});

beforeAll(async () => {
  await db.select().from(branches); // wait for the mocked db + migrations
}, 60_000);

describe("branch-wise invoice reference", () => {
  it("counts up per branch, using the branch's own code", async () => {
    // Branch 2 (Porur) carries the code P.
    expect(await nextBranchReference("Branch 2", "2026-10-01T10:00:00.000Z")).toBe("INV-2026-P0001");
    expect(await nextBranchReference("Branch 2", "2026-10-02T10:00:00.000Z")).toBe("INV-2026-P0002");
    // Another branch has its own sequence.
    expect(await nextBranchReference("Branch 1", "2026-10-01T10:00:00.000Z")).toBe("INV-2026-V0001");
  });

  it("starts again at 001 in a new year", async () => {
    expect(await nextBranchReference("Branch 2", "2027-01-05T10:00:00.000Z")).toBe("INV-2027-P0001");
  });

  it("follows an edited branch code", async () => {
    await db.update(branches).set({ code: "ZZ" }).where(eq(branches.id, "Branch 3"));
    expect(await nextBranchReference("Branch 3", "2026-10-01T10:00:00.000Z")).toBe("INV-2026-ZZ0001");
  });

  it("two invoices created at once never share a reference", async () => {
    const made = await Promise.all([1, 2, 3, 4].map((n) => createInvoice(inv(`race-${n}`, "Branch 1", `SSM/2026-27/${9000 + n}`))));
    expect(new Set(made.map((m) => m.reference)).size).toBe(4);
  });

  it("keeps the tax number and the reference independent", async () => {
    const a = await createInvoice(inv("ind-a", "Branch 1", "SSM/2026-27/9101"));
    const b = await createInvoice(inv("ind-b", "Branch 2", "SSM/2026-27/9102"));
    expect(a.number).toBe("SSM/2026-27/9101");
    expect(b.number).toBe("SSM/2026-27/9102");
    expect(a.reference).toMatch(/^INV-2026-V\d{4}$/);
    expect(b.reference).toMatch(/^INV-2026-P\d{4}$/);
  });
});
