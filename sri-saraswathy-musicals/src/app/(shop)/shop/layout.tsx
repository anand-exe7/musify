import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/seo";

const description =
  "Browse violins, veenas, sitars, guitars, keyboards, tablas, flutes and accessories — Indian classical and Western instruments from Sri Saraswathy Musicals, Chennai.";

export const metadata: Metadata = {
  title: "Shop Musical Instruments",
  description,
  // Filters/sorts/pages are query strings of this one page — they all canonicalise to /shop.
  alternates: { canonical: "/shop" },
  openGraph: { type: "website", url: "/shop", title: `Shop Musical Instruments | ${SITE_NAME}`, description },
  twitter: { card: "summary_large_image", title: `Shop Musical Instruments | ${SITE_NAME}`, description },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
