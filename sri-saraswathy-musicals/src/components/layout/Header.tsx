"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, User, ShoppingBag, Menu, X, ChevronDown } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useCart } from "@/lib/store/cart";
import { categories } from "@/lib/data/categories";
import { products } from "@/lib/data/products";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  mega?: "shop";
}

const nav: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop", mega: "shop" },
  { href: "/#featured", label: "Featured" },
  { href: "/#play", label: "Play" },
  { href: "/#visit", label: "Visit" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [openMega, setOpenMega] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [searchOpen, setSearchOpen] = useState(false);
  const count = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMenuOpen(false);
    setOpenMega(null);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setOpenMega(null);
      }
      // Cmd/Ctrl + K opens search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const overDarkHero = isHome && !scrolled && !openMega && !searchOpen;

  const results = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.tagline.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [search]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/#")) return false;
    return pathname?.startsWith(href.split("?")[0]);
  };

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 transition-all duration-300",
          overDarkHero
            ? "border-b border-transparent bg-transparent py-4"
            : "border-b border-ink-100 bg-ivory-50/95 py-2 backdrop-blur-md shadow-sm",
        )}
        onMouseLeave={() => setOpenMega(null)}
      >
        <div className="container-page flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Logo variant={overDarkHero ? "light" : "dark"} size="sm" />

            <nav className="hidden md:flex items-center gap-1">
              {nav.map((l) => {
                const active = isActive(l.href);
                return (
                  <div
                    key={l.href}
                    className="relative"
                    onMouseEnter={() => l.mega && setOpenMega(l.mega)}
                  >
                    <Link
                      href={l.href}
                      className={cn(
                        "group relative flex items-center gap-1 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors",
                        overDarkHero
                          ? "text-ivory-100/85 hover:text-gold-400"
                          : "text-ink-700 hover:text-gold-600",
                        active && (overDarkHero ? "text-gold-400" : "text-gold-700"),
                      )}
                    >
                      {l.label}
                      {l.mega && <ChevronDown className="h-3 w-3 opacity-70" />}
                      <span
                        className={cn(
                          "absolute inset-x-3 -bottom-0.5 h-px origin-left scale-x-0 bg-gold-500 transition-transform duration-300",
                          "group-hover:scale-x-100",
                          active && "scale-x-100",
                        )}
                      />
                    </Link>
                  </div>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className={cn(
                "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] transition-all sm:flex",
                overDarkHero
                  ? "border-ivory-100/25 text-ivory-100/70 hover:border-gold-400 hover:text-gold-400"
                  : "border-ink-200 text-ink-500 hover:border-gold-500 hover:text-gold-600",
              )}
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search</span>
              <span
                className={cn(
                  "ml-2 hidden rounded border px-1.5 py-0.5 text-[9px] font-mono lg:inline",
                  overDarkHero ? "border-ivory-100/25" : "border-ink-200",
                )}
              >
                ⌘K
              </span>
            </button>

            <Link
              href="/auth/login"
              aria-label="Account"
              className={cn(
                "grid h-10 w-10 place-items-center transition-colors",
                overDarkHero
                  ? "text-ivory-100/80 hover:text-gold-400"
                  : "text-ink-700 hover:text-gold-600",
              )}
            >
              <User className="h-4 w-4" />
            </Link>

            <Link
              href="/cart"
              aria-label="Cart"
              className={cn(
                "relative grid h-10 w-10 place-items-center transition-colors",
                overDarkHero
                  ? "text-ivory-100/80 hover:text-gold-400"
                  : "text-ink-700 hover:text-gold-600",
              )}
            >
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
              className={cn(
                "grid h-10 w-10 place-items-center md:hidden",
                overDarkHero ? "text-ivory-100" : "text-ink-700",
              )}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mega menu for Shop */}
        <AnimatePresence>
          {openMega === "shop" && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-x-0 top-full border-t border-ink-100 bg-ivory-50 shadow-xl"
              onMouseEnter={() => setOpenMega("shop")}
              onMouseLeave={() => setOpenMega(null)}
            >
              <div className="container-page grid gap-8 py-8 md:grid-cols-[1fr_1fr_1fr_1.3fr]">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-600">
                    Indian
                  </p>
                  <ul className="mt-4 space-y-2">
                    {categories
                      .filter((c) =>
                        ["indian-classical", "percussion"].includes(c.id),
                      )
                      .map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/shop?category=${c.id}`}
                            className="group flex items-baseline justify-between text-sm text-ink-700 hover:text-gold-600"
                          >
                            <span className="font-serif italic">{c.name}</span>
                            <span className="text-[10px] uppercase tracking-widest text-ink-400 group-hover:text-gold-500">
                              {c.count}
                            </span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-600">
                    Western
                  </p>
                  <ul className="mt-4 space-y-2">
                    {categories
                      .filter((c) => ["string", "keyboard", "wind"].includes(c.id))
                      .map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/shop?category=${c.id}`}
                            className="group flex items-baseline justify-between text-sm text-ink-700 hover:text-gold-600"
                          >
                            <span className="font-serif italic">{c.name}</span>
                            <span className="text-[10px] uppercase tracking-widest text-ink-400 group-hover:text-gold-500">
                              {c.count}
                            </span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-600">
                    Also
                  </p>
                  <ul className="mt-4 space-y-2">
                    <li>
                      <Link
                        href="/shop?category=accessories"
                        className="text-sm text-ink-700 hover:text-gold-600"
                      >
                        <span className="font-serif italic">Accessories</span>
                      </Link>
                    </li>
                    <li>
                      <Link href="/#featured" className="text-sm text-ink-700 hover:text-gold-600">
                        <span className="font-serif italic">Featured</span>
                      </Link>
                    </li>
                    <li>
                      <Link href="/#visit" className="text-sm text-ink-700 hover:text-gold-600">
                        <span className="font-serif italic">Book a fitting</span>
                      </Link>
                    </li>
                  </ul>
                </div>

                {/* Feature card */}
                <Link
                  href="/#play"
                  className="group relative overflow-hidden border border-ink-100 bg-ink-900 text-ivory-100"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-gold-400/20 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative flex h-full flex-col justify-between p-5">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-gold-400">
                      New · This week
                    </p>
                    <div>
                      <p className="heading-serif text-xl">
                        Try before you buy — <em>right here.</em>
                      </p>
                      <p className="mt-2 text-xs text-ivory-100/60">
                        Play our online keyboard.
                      </p>
                    </div>
                  </div>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 flex flex-col bg-ivory-50 pt-20 md:hidden"
          >
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
            <div className="mt-6 border-t border-ink-100 px-6 py-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-600">
                Categories
              </p>
              <ul className="mt-4 grid grid-cols-2 gap-3">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/shop?category=${c.id}`}
                      onClick={() => setMenuOpen(false)}
                      className="block border border-ink-100 px-3 py-2 text-sm text-ink-700 hover:border-gold-400 hover:text-gold-600"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-auto p-6 text-xs uppercase tracking-[0.24em] text-ink-400">
              <p>Sri Saraswathy Musicals</p>
              <p>Chennai · Bengaluru · Est. 1978</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search modal */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/70 px-4 pt-24 backdrop-blur-sm"
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl overflow-hidden border border-gold-300 bg-ivory-50 shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
                <Search className="h-4 w-4 text-gold-500" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      router.push(`/shop?q=${encodeURIComponent(search)}`);
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Search violins, veenas, pianos, brands…"
                  className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="rounded border border-ink-200 px-1.5 py-0.5 text-[10px] font-mono text-ink-500 hover:border-gold-500 hover:text-gold-600"
                >
                  ESC
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {results.length === 0 && search.trim() === "" && (
                  <div className="p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-600">
                      Popular right now
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {[
                        "Violin",
                        "Veena",
                        "Yamaha piano",
                        "Sitar",
                        "Tabla",
                        "Guitar",
                      ].map((k) => (
                        <button
                          key={k}
                          onClick={() => setSearch(k)}
                          className="border border-ink-200 px-3 py-1.5 text-xs text-ink-700 hover:border-gold-400 hover:text-gold-600"
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {search.trim() !== "" && results.length === 0 && (
                  <div className="p-6 text-sm text-ink-500">
                    No matches. Try &ldquo;violin&rdquo;, &ldquo;veena&rdquo;, or a brand.
                  </div>
                )}

                {results.length > 0 && (
                  <ul className="divide-y divide-ink-100">
                    {results.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/product/${p.slug}`}
                          onClick={() => setSearchOpen(false)}
                          className="flex items-center gap-4 px-5 py-3 hover:bg-ivory-100"
                        >
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden bg-ink-100">
                            {p.photo && (
                              <Image
                                src={p.photo}
                                alt=""
                                fill
                                sizes="56px"
                                className="object-cover"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-[0.22em] text-gold-600">
                              {p.brand}
                            </p>
                            <p className="truncate font-serif italic text-sm text-ink-900">
                              {p.name}
                            </p>
                          </div>
                          <span className="tabular text-sm text-ink-700">
                            ₹{p.price.toLocaleString("en-IN")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
