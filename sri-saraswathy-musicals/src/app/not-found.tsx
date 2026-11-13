import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ivory-50 px-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-600">Error 404</p>
      <h1 className="heading-serif text-3xl text-ink-900 sm:text-4xl">We couldn&apos;t find that page</h1>
      <p className="max-w-md text-sm text-ink-500">The link may be old, or the instrument may have found a new home.</p>
      <div className="actions justify-center">
        <Link href="/" className="btn-gold">Back to home</Link>
        <Link href="/shop" className="btn-ghost">Browse instruments</Link>
      </div>
    </main>
  );
}
