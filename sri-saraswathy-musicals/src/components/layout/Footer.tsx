"use client";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { BUSINESS } from "@/lib/data/business";
import { useCategories } from "@/lib/client/catalog";

/** The same places the top navigation goes — one list, so the two can't drift apart. */
const explore = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Products" },
  { href: "/#play", label: "Play" },
  { href: "/#inquiry", label: "Inquiry" },
  { href: "/#visit", label: "Visit" },
];

export function Footer() {
  // Live categories, so a category added in the admin appears here without anyone editing this file.
  const { categories } = useCategories();
  const shop = categories.filter((c) => c.count > 0).slice(0, 8);

  return (
    <footer className="border-t border-ink-100 bg-ink-900 text-ivory-100">
      <div className="container-page py-14 pb-24 md:pb-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo variant="light" size="md" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-ivory-100/70">
              Instruments, set up by hand, delivered by the people who set them up. Since 1978.
            </p>
            <div className="mt-6 space-y-2 text-xs uppercase tracking-[0.2em] text-ivory-100/50">
              {BUSINESS.branches.map((b) => (
                <p key={b.key}>{b.city} · {b.area}</p>
              ))}
            </div>
            <a
              href={`mailto:${BUSINESS.email}`}
              className="mt-5 inline-block text-sm text-ivory-100/70 transition-colors hover:text-gold-400"
            >
              {BUSINESS.email}
            </a>
          </div>

          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-gold-400">Shop</h4>
            <ul className="space-y-3">
              {shop.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/shop?category=${c.id}`}
                    className="flex items-center justify-between gap-3 text-sm text-ivory-100/70 transition-colors hover:text-gold-400"
                  >
                    <span>{c.name}</span>
                    <span className="tabular text-[11px] text-ivory-100/35">{c.count}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/shop" className="text-sm text-ivory-100/70 transition-colors hover:text-gold-400">
                  All instruments
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-gold-400">Explore</h4>
            <ul className="space-y-3">
              {explore.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-ivory-100/70 transition-colors hover:text-gold-400">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 grid gap-3 border-t border-ivory-100/10 pt-8 text-[11px] uppercase tracking-[0.18em] text-ivory-100/50 md:grid-cols-3 md:items-center">
          <p className="md:justify-self-start">Sri Saraswathy Musicals</p>
          <p className="md:justify-self-center md:text-center">
            Powered by{" "}
            <a
              href="https://www.cenexasystems.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold tracking-[0.16em] text-[#7FB2FF] underline decoration-[#7FB2FF]/40 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
            >
              Cenexa Systems
            </a>{" "}
            · © 2026
          </p>
          <p className="md:justify-self-end md:text-right">Tradition · Craft · Resonance</p>
        </div>
      </div>
    </footer>
  );
}
