import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Back office, APIs, auth and per-customer pages have no business in search results.
        disallow: ["/admin", "/api/", "/auth/", "/cart", "/checkout", "/profile", "/invoice/", "/quotation/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
