/**
 * Emails are built as HTML from text people typed (their name, address) and text the shop typed (courier, tracking
 * number). None of it may ever be read as markup.
 */
import { describe, expect, it, vi } from "vitest";

// The email module only needs the catalogue to look up product names; these tests don't touch the database.
vi.mock("@/lib/db/queries/products", () => ({ getAllProducts: async () => [] }));

import { esc, renderShippedEmail } from "@/lib/email/resend";
import type { Order } from "@/types";

describe("email escaping", () => {
  it("turns markup characters into text", () => {
    expect(esc(`<img src=x onerror="alert(1)"> & 'quotes'`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quotes&#39;");
    expect(esc(null)).toBe("");
    expect(esc(42)).toBe("42");
  });

  it("the shipped email shows a hostile name, address, courier and tracking number as plain text", () => {
    const html = renderShippedEmail({
      id: "ORD-1", date: "2026-10-19", status: "shipped", customerName: `<script>alert("n")</script>`, email: "a@b.c", phone: "1",
      branch: "Branch 1", items: [], subtotal: 0, gst: 0, shipping: 0, total: 0,
      address: `1 <b>Main</b> St\nChennai "600001"`,
      courier: `<a href="https://evil.example">DTDC</a>`, trackingNo: `X"><img src=x>`,
    } as Order);
    expect(html).not.toMatch(/<script|<img|<a href|<b>/i);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;DTDC&lt;/a&gt;");
    expect(html).toContain("1 &lt;b&gt;Main&lt;/b&gt; St<br>Chennai &quot;600001&quot;"); // line breaks survive, markup doesn't
  });

  it("an ordinary shipped email still reads normally", () => {
    const html = renderShippedEmail({
      id: "ORD-2", date: "2026-10-19", status: "shipped", customerName: "Asha", email: "a@b.c", phone: "1", branch: "Branch 1",
      items: [], subtotal: 0, gst: 0, shipping: 0, total: 0, address: "12 Test Street, Chennai", courier: "DTDC", trackingNo: "AWB123",
    } as Order);
    expect(html).toContain("Good news, Asha");
    expect(html).toContain("DTDC · AWB123");
    expect(html).toContain("12 Test Street, Chennai");
  });
});
