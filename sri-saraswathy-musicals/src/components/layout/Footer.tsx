import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

const cols = [
  {
    title: "Shop",
    links: [
      { href: "/shop?category=indian-classical", label: "Indian Classical" },
      { href: "/shop?category=string", label: "Strings" },
      { href: "/shop?category=keyboard", label: "Keyboards" },
      { href: "/shop?category=percussion", label: "Percussion" },
      { href: "/shop?category=wind", label: "Wind" },
      { href: "/shop?category=accessories", label: "Accessories" },
    ],
  },
  {
    title: "The House",
    links: [
      { href: "#", label: "Our story" },
      { href: "#", label: "The atelier" },
      { href: "#", label: "Luthiers & makers" },
      { href: "#", label: "Press" },
      { href: "#", label: "Careers" },
    ],
  },
  {
    title: "Service",
    links: [
      { href: "#", label: "Delivery & setup" },
      { href: "#", label: "Repair & tuning" },
      { href: "#", label: "Trade-in" },
      { href: "#", label: "Warranty" },
      { href: "/inquiry", label: "Contact" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-ink-100 bg-ink-900 text-ivory-100">
      <div className="container-page py-16 pb-24 md:pb-16">
        <div className="grid gap-12 md:grid-cols-5">
          <div className="md:col-span-2">
            <Logo variant="light" size="md" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-ivory-100/70">
              Instruments, set up by hand, delivered by the people who set them up. Since 1978.
            </p>
            <div className="mt-6 space-y-2 text-xs uppercase tracking-[0.2em] text-ivory-100/50">
              <p>Chennai · Mylapore</p>
              <p>Bengaluru · Basavanagudi</p>
            </div>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-gold-400">
                {c.title}
              </h4>
              <ul className="space-y-3">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-ivory-100/70 transition-colors hover:text-gold-400">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-3 border-t border-ivory-100/10 pt-8 text-[11px] uppercase tracking-[0.18em] text-ivory-100/50 md:grid-cols-3 md:items-center">
          <p className="md:justify-self-start">Sri Saraswathy Musicals</p>
          <p className="text-gold-400 md:justify-self-center md:text-center">
            Powered by Cenexa Systems · © 2026
          </p>
          <p className="md:justify-self-end md:text-right">Tradition · Craft · Resonance</p>
        </div>
      </div>
    </footer>
  );
}
