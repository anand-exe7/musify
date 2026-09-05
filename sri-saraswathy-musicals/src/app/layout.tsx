import type { Metadata } from "next";
import { Fraunces, Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";
import { SmoothScroll } from "@/components/SmoothScroll";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "opsz"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

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
    <html lang="en" className={`${fraunces.variable} ${instrumentSerif.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-ivory-50 text-ink-900 antialiased">
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
