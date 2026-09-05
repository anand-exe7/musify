"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, User, ShoppingBag, Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useCart } from "@/lib/store/cart";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/shop?category=indian-classical", label: "Indian" },
  { href: "/shop?category=string", label: "Western" },
  { href: "/profile", label: "Profile" },
];

export function Header() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const count = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // On home page while at top: transparent over dark hero (light text).
  // On other pages OR when scrolled: solid ivory bg with dark text.
  const overDarkHero = isHome && !scrolled;

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 transition-all duration-300",
          overDarkHero
            ? "border-b border-transparent bg-transparent py-5"
            : "border-b border-ink-100 bg-ivory-50/90 py-3 backdrop-blur-md",
        )}
      >
        <div className="container-page flex items-center justify-between gap-4">
          <Logo variant={overDarkHero ? "light" : "dark"} size="sm" />

          <nav className="hidden md:flex items-center gap-8">
            {nav.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "text-xs font-medium uppercase tracking-[0.18em] transition-colors",
                  overDarkHero ? "text-ivory-100/80 hover:text-gold-400" : "text-ink-600 hover:text-gold-600",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <button aria-label="Search" className={cn("hidden sm:grid h-10 w-10 place-items-center transition-colors", overDarkHero ? "text-ivory-100/80 hover:text-gold-400" : "text-ink-700 hover:text-gold-600")}>
              <Search className="h-4 w-4" />
            </button>
            <Link href="/auth/login" aria-label="Account" className={cn("hidden sm:grid h-10 w-10 place-items-center transition-colors", overDarkHero ? "text-ivory-100/80 hover:text-gold-400" : "text-ink-700 hover:text-gold-600")}>
              <User className="h-4 w-4" />
            </Link>
            <Link href="/cart" aria-label="Cart" className={cn("relative grid h-10 w-10 place-items-center transition-colors", overDarkHero ? "text-ivory-100/80 hover:text-gold-400" : "text-ink-700 hover:text-gold-600")}>
              <ShoppingBag className="h-4 w-4" />
              {mounted && count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-gold-500 text-[9px] font-semibold text-ink-900">
                  {count}
                </span>
              )}
            </Link>
            <button
              aria-label="Menu"
              onClick={() => setMenuOpen((o) => !o)}
              className={cn("grid h-10 w-10 place-items-center md:hidden", overDarkHero ? "text-ivory-100" : "text-ink-700")}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-ivory-50 pt-20 md:hidden">
          <nav className="flex flex-col divide-y divide-ink-100 border-t border-ink-100">
            {nav.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between px-6 py-5 heading-serif text-2xl text-ink-900 transition-colors hover:bg-ivory-100 hover:text-gold-600"
              >
                <span>{l.label}</span>
                <span className="text-gold-500">→</span>
              </Link>
            ))}
          </nav>
          <div className="mt-auto p-6 text-xs uppercase tracking-[0.24em] text-ink-400">
            <p>Sri Saraswathy Musicals</p>
            <p>Chennai · Bengaluru · Est. 1978</p>
          </div>
        </div>
      )}
    </>
  );
}
