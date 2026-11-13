import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { getStorefrontProducts } from "@/lib/db/queries/products";

// Rebuilt at most hourly so new products show up without a redeploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/shop"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
  ];

  try {
    const products = await getStorefrontProducts();
    for (const p of products) {
      entries.push({
        url: absoluteUrl(`/product/${p.slug}`),
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch (err) {
    // A database hiccup must not break the sitemap: ship the static pages and retry next window.
    console.error("[sitemap] product list unavailable:", err);
  }
  return entries;
}
