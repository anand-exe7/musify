/**
 * Branch-only users no longer get purchases, vendor bills, vendors or stock transfers: the APIs refuse them
 * (403) while a full admin still gets in, and the admin menu / page guard agree.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const cookieJar = vi.hoisted(() => ({ token: undefined as string | undefined }));
const dbUsers = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "ssm_session" && cookieJar.token ? { value: cookieJar.token } : undefined) }),
}));
vi.mock("@/lib/db/queries/users", () => ({ getUser: async (id: string) => dbUsers.get(id) }));
// The routes import query modules that need a db; a refused call never reaches it.
vi.mock("@/lib/db", async () => ({ db: {}, ...(await import("@/lib/db/schema")) }));

import { createSessionToken } from "@/lib/auth/session";
import { branchStaffMayOpen } from "@/components/admin/AdminSidebar";
import * as purchases from "@/app/api/purchases/route";
import * as purchase from "@/app/api/purchases/[id]/route";
import * as vendorBills from "@/app/api/vendor-bills/route";
import * as transfers from "@/app/api/stock-transfers/route";
import * as inward from "@/app/api/stock-inward/route";
import * as vendors from "@/app/api/vendors/route";
import * as vendorPayments from "@/app/api/vendor-payments/route";
import * as outstandings from "@/app/api/vendor-outstandings/route";
import * as purchaseAnalytics from "@/app/api/analytics/purchases/route";

const dbUser = (over: Record<string, unknown> = {}) => ({
  id: "u1", name: "U", email: "u@x.com", active: true, isAdmin: false, branch: null, avatar: null, ...over,
});
const req = (method = "GET") => new NextRequest("http://localhost/api/x", { method });
const ctx = { params: Promise.resolve({ id: "p1" }) };

const routes: [string, () => Promise<Response>][] = [
  ["GET /api/purchases", async () => purchases.GET(req())],
  ["POST /api/purchases", async () => purchases.POST(req("POST"))],
  ["GET /api/purchases/:id", async () => purchase.GET(req(), ctx)],
  ["GET /api/vendor-bills", async () => vendorBills.GET(req())],
  ["GET /api/stock-transfers", async () => transfers.GET()],
  ["POST /api/stock-transfers", async () => transfers.POST(req("POST"))],
  ["GET /api/stock-inward", async () => inward.GET()],
  ["GET /api/vendors", async () => vendors.GET()],
  ["POST /api/vendors", async () => vendors.POST(req("POST"))],
  ["GET /api/vendor-payments", async () => vendorPayments.GET(req())],
  ["GET /api/vendor-outstandings", async () => outstandings.GET()],
  ["GET /api/analytics/purchases", async () => purchaseAnalytics.GET(req())],
];

beforeEach(async () => {
  process.env.AUTH_SECRET = "test-secret-for-vitest-only-0123456789";
  dbUsers.clear();
  cookieJar.token = await createSessionToken({ id: "u1", name: "U", email: "u@x.com", isAdmin: false, branch: "Branch 1" });
});

describe("procurement APIs", () => {
  it.each(routes)("%s refuses a branch-only user", async (_name, call) => {
    dbUsers.set("u1", dbUser({ branch: "Branch 1" }));
    expect((await call()).status).toBe(403);
  });

  it.each(routes)("%s still lets a full admin through the access check", async (_name, call) => {
    dbUsers.set("u1", dbUser({ isAdmin: true }));
    // Past the guard it may fail on the empty test db (500), but never 401/403.
    expect([401, 403]).not.toContain((await call()).status);
  });
});

describe("admin menu and page guard for branch users", () => {
  it.each(["/admin", "/admin/billing", "/admin/orders", "/admin/invoices/INV-1", "/admin/quotations/new", "/admin/service/R1", "/admin/inquiries", "/admin/expenses", "/admin/customers"])(
    "may open %s", (path) => expect(branchStaffMayOpen(path)).toBe(true),
  );
  it.each(["/admin/stock-transfers", "/admin/purchases", "/admin/purchases/invoices", "/admin/stock-inward", "/admin/vendors", "/admin/analytics", "/admin/users"])(
    "may not open %s", (path) => expect(branchStaffMayOpen(path)).toBe(false),
  );
});
