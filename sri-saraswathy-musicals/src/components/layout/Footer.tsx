"use client";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { BUSINESS } from "@/lib/data/business";

/** The same places the top navigation goes — one list, so the two can't drift apart. */
const explore = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Products" },
  { href: "/#play", label: "Play" },
  { href: "/#inquiry", label: "Inquiry" },
  { href: "/#visit", label: "Visit" },
];

export function Footer() {
  return (
    <footer className="border-t border-ink-100 bg-ink-900 text-ivory-100">
      <div className="container-page py-14 pb-24 md:pb-14">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <Logo variant="light" size="md" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-ivory-100/70">
              Instruments, set up by hand, delivered by the people who set them up. Since 1965.
            </p>
            <a
              href={`mailto:${BUSINESS.email}`}
              className="mt-6 inline-block text-sm text-ivory-100/70 transition-colors hover:text-gold-400"
            >
              {BUSINESS.email}
            </a>
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
          <div>
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-gold-400">Visit us</h4>
            <ul className="space-y-4 text-sm text-ivory-100/70">
              {BUSINESS.branches.map((b) => (
                <li key={b.key}>
                  <p className="font-medium text-ivory-100">{b.area}</p>
                  <p className="mt-0.5 leading-relaxed">{b.street}, {b.zip}</p>
                  <p className="mt-0.5 text-ivory-100/50">{b.phone}</p>
                </li>
              ))}
              <li className="border-t border-ivory-100/10 pt-3 text-xs uppercase tracking-[0.16em] text-ivory-100/50">
                {BUSINESS.branches[0]?.hours}
              </li>
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
