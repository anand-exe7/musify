import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SmoothScroll } from "@/components/SmoothScroll";
import { Splash } from "@/components/Splash";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION, SITE_KEYWORDS, organizationJsonLd, websiteJsonLd } from "@/lib/seo";

// One typeface across the whole storefront. Weight — not a different family —
// carries the hierarchy: regular for body, semibold/bold/black for headings.
// `--font-display` and `--font-serif` are remapped to this same font in
// globals.css, so any stray `font-display` / `font-serif` token still renders
// in Inter.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

// Layout viewport = the device's real CSS width. `viewport-fit=cover` lets the
// layout extend under notches; safe-area insets are applied where it matters.
// Zoom is intentionally NOT restricted.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-IN" className={inter.variable}>
      <body className="min-h-dvh bg-ivory-50 text-ink-900 antialiased">
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        <SmoothScroll />
        <Splash />
        {children}
      </body>
    </html>
  );
}
