import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SmoothScroll } from "@/components/SmoothScroll";
import { Splash } from "@/components/Splash";

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

export const metadata: Metadata = {
  title: "Sri Saraswathy Musicals — Instruments, curated by hand.",
  description:
    "A house for professional-grade musical instruments — Indian classical and Western. Set up by luthiers, delivered with care. Since 1978.",
  keywords: ["musical instruments", "violin", "veena", "sitar", "guitar", "tabla", "Sri Saraswathy"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-ivory-50 text-ink-900 antialiased">
        <SmoothScroll />
        <Splash />
        {children}
      </body>
    </html>
  );
}
