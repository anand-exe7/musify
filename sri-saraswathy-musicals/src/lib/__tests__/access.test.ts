/**
 * Access-level enforcement in `handle()` and the "DB beats the cookie" rule
 * (a fired/demoted user keeps a valid 30-day token but must lose access now).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const cookieJar = vi.hoisted(() => ({ token: undefined as string | undefined }));
const dbUsers = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "ssm_session" && cookieJar.token ? { value: cookieJar.token } : undefined) }),
}));
vi.mock("@/lib/db/queries/users", () => ({ getUser: async (id: string) => dbUsers.get(id) }));

import { handle } from "@/lib/api/http";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

const dbUser = (over: Record<string, unknown> = {}) => ({
  id: "u1", name: "U", email: "u@x.com", active: true, isAdmin: false, branch: null, avatar: null, ...over,
});

async function signIn(claims: { isAdmin?: boolean; branch?: "Branch 1" | "Branch 2" | null } = {}) {
  cookieJar.token = await createSessionToken({
    id: "u1", name: "U", email: "u@x.com", isAdmin: claims.isAdmin ?? false, branch: claims.branch ?? null,
  });
}
const call = async (access: "public" | "user" | "staff" | "admin") => {
  const res = await handle(access, async () => NextResponse.json({ ok: true }));
  return res.status;
};

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-for-vitest-only-0123456789";
  cookieJar.token = undefined;
  dbUsers.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("handle(access)", () => {
  it("public: open to anonymous callers", async () => {
    expect(await call("public")).toBe(200);
  });
  it.each(["user", "staff", "admin"] as const)("%s: 401 when signed out", async (lvl) => {
    expect(await call(lvl)).toBe(401);
  });
  it("user: any active signed-in user", async () => {
    dbUsers.set("u1", dbUser());
    await signIn();
    expect(await call("user")).toBe(200);
  });
  it("staff: customer 403, branch staff 200, admin 200", async () => {
    await signIn();
    dbUsers.set("u1", dbUser());
    expect(await call("staff")).toBe(403);
    dbUsers.set("u1", dbUser({ branch: "Branch 1" }));
    expect(await call("staff")).toBe(200);
    dbUsers.set("u1", dbUser({ isAdmin: true }));
    expect(await call("staff")).toBe(200);
  });
  it("admin: branch staff 403, full admin 200", async () => {
    await signIn({ isAdmin: true });
    dbUsers.set("u1", dbUser({ branch: "Branch 1" }));
    expect(await call("admin")).toBe(403);
    dbUsers.set("u1", dbUser({ isAdmin: true }));
    expect(await call("admin")).toBe(200);
  });
  it("hands the DB-verified user and access to the handler", async () => {
    await signIn();
    dbUsers.set("u1", dbUser({ branch: "Branch 2" }));
    let seen: unknown;
    await handle("staff", async (a) => { seen = a; return NextResponse.json({}); });
    expect(seen).toMatchObject({ access: "Branch 2", user: { id: "u1", branch: "Branch 2", isAdmin: false } });
  });
});

describe("S1 — stale cookie vs. database", () => {
  it("a fired admin (cookie still says admin) loses access immediately", async () => {
    await signIn({ isAdmin: true });
    dbUsers.set("u1", dbUser({ isAdmin: true }));
    expect(await call("admin")).toBe(200);
    dbUsers.set("u1", dbUser({ isAdmin: true, active: false }));
    expect(await call("admin")).toBe(401);
    expect(await call("staff")).toBe(401);
    expect(await call("user")).toBe(401);
  });
  it("a demoted admin is downgraded to what the DB says", async () => {
    await signIn({ isAdmin: true });
    dbUsers.set("u1", dbUser({ isAdmin: false }));
    expect(await call("admin")).toBe(403);
  });
  it("a deleted user is signed out", async () => {
    await signIn({ isAdmin: true });
    expect(await call("user")).toBe(401);
  });
  it("fails closed (500) when the DB is unreachable — never trusts the cookie", async () => {
    await signIn({ isAdmin: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbUsers.get = () => { throw new Error("db down"); };
    expect(await call("admin")).toBe(500);
  });
});

describe("S4 — AUTH_SECRET", () => {
  it("throws instead of falling back to a built-in secret", async () => {
    delete process.env.AUTH_SECRET;
    await expect(createSessionToken({ id: "x", name: "", email: "", isAdmin: true })).rejects.toThrow(/AUTH_SECRET/);
    await expect(verifySessionToken("anything")).rejects.toThrow(/AUTH_SECRET/);
    await expect(verifySessionToken(undefined)).rejects.toThrow(/AUTH_SECRET/);
  });
  it("rejects a token forged with the old public dev secret", async () => {
    const { SignJWT } = await import("jose");
    const forged = await new SignJWT({ isAdmin: true, email: "a@x.com", name: "A" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("dev-insecure-secret-change-me"));
    expect(await verifySessionToken(forged)).toBeNull();
  });
});

