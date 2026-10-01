import { describe, it, expect } from "vitest";
import { safeRedirect } from "@/lib/auth/redirect";

describe("safeRedirect", () => {
  it("keeps same-site relative paths, queries and hashes", () => {
    expect(safeRedirect("/checkout")).toBe("/checkout");
    expect(safeRedirect("/admin/orders?tab=web#x")).toBe("/admin/orders?tab=web#x");
  });
  it.each([
    "//evil.com",
    "/\\evil.com",
    "/\\/evil.com",
    "\\\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "/\tevil.com",
    "/\n/evil.com",
    "/%5Cevil.com/..//evil.com".replace("%5C", "\\"),
  ])("rejects %j", (bad) => {
    expect(safeRedirect(bad)).toBe("/profile");
  });
  it("falls back on empty / null", () => {
    expect(safeRedirect(null)).toBe("/profile");
    expect(safeRedirect("")).toBe("/profile");
    expect(safeRedirect(undefined, "/")).toBe("/");
  });
});
