"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  User,
  ShoppingBag,
  Menu,
  X,
  ChevronDown,
  ArrowRight,
  Package,
  MapPin,
  LogOut,
  Settings,
  CornerDownLeft,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useCart } from "@/lib/store/cart";
import { useAuth } from "@/lib/store/auth";
import { useCategories, searchProducts } from "@/lib/client/catalog";
import type { Product } from "@/types";
import { cn, formatINR } from "@/lib/utils";
import { BUSINESS } from "@/lib/data/business";

interface NavItem {
  href: string;
  label: string;
  mega?: boolean;
}

const nav: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Products", mega: true },
  { href: "/#play", label: "Play" },
  { href: "/#inquiry", label: "Inquiry" },
  { href: "/#visit", label: "Visit" },
];

const POPULAR = ["Violin", "Veena", "Yamaha piano", "Sitar", "Tabla", "Guitar"];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const count = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const user = useAuth((s) => s.user);
  const loggedIn = useAuth((s) => s.loggedIn);
  const isAdmin = useAuth((s) => s.isAdmin);
  const authHydrated = useAuth((s) => s.hydrated);
  const signOut = useAuth((s) => s.logout);
  const signedIn = mounted && authHydrated && loggedIn;
  const { categories } = useCategories();
  const shopCats = categories.filter((c) => c.count > 0);
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const megaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close everything on a route change.
  useEffect(() => {
    setMenuOpen(false);
    setMegaOpen(false);
    setSearchOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  // The body must not scroll behind a full-screen panel.
  useEffect(() => {
    const lock = menuOpen || searchOpen;
    if (!lock) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen, searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setMegaOpen(false);
        setAccountOpen(false);
        setMenuOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  // Search asks the server for the first few matches once typing pauses — the catalogue is never downloaded for it.
  useEffect(() => {
    const term = search.trim();
    if (!term) { setResults([]); setSearching(false); return; }
    const ctl = new AbortController();
    setSearching(true);
    const t = setTimeout(() => {
      searchProducts(term, ctl.signal, 6)
        .then((r) => { setResults(r); setSearching(false); })
        .catch(() => { if (!ctl.signal.aborted) { setResults([]); setSearching(false); } });
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [search]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/#")) return false;
    return pathname?.startsWith(href.split("?")[0]);
  };

  /* The mega menu opens on hover but closes on a short delay, so crossing the gap between the
     link and the panel doesn't snap it shut; a click toggles it, which is what touch needs. */
  const openMega = () => { if (megaTimer.current) clearTimeout(megaTimer.current); setMegaOpen(true); };
  const closeMega = () => {
    if (megaTimer.current) clearTimeout(megaTimer.current);
    megaTimer.current = setTimeout(() => setMegaOpen(false), 140);
  };

  const runSearch = (term: string) => {
    const q = term.trim();
    if (!q) return;
    router.push(`/shop?q=${encodeURIComponent(q)}`);
    setSearchOpen(false);
  };

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 h-20 border-b bg-ivory-100/85 backdrop-blur-md transition-shadow duration-300",
          scrolled ? "border-ink-100 shadow-[0_8px_30px_-20px_rgba(10,9,8,0.5)]" : "border-ink-100/50",
        )}
      >
        <div className="container-page flex h-full items-center gap-4">
          <div className="flex flex-1 items-center">
            <Logo variant="dark" size="md" />
          </div>

          <nav className="hidden shrink-0 items-center justify-center gap-1 lg:flex">
            {nav.map((l) => {
              const active = isActive(l.href) || (l.mega && megaOpen);
              return (
                <div
                  key={l.href}
                  className="relative"
                  onMouseEnter={l.mega ? openMega : undefined}
                  onMouseLeave={l.mega ? closeMega : undefined}
                >
                  <Link
                    href={l.href}
                    onClick={(e) => {
                      if (!l.mega) return;
                      // On the Products link a click is for the menu, not navigation.
                      e.preventDefault();
                      setMegaOpen((o) => !o);
                    }}
                    aria-expanded={l.mega ? megaOpen : undefined}
                    className={cn(
                      "group relative flex items-center gap-1 rounded-full px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.2em] transition-all hover:bg-ink-900/[0.05]",
                      "text-ink-700 hover:text-gold-600",
                      active && "bg-ink-900/[0.05] text-gold-700",
                    )}
                  >
                    {l.label}
                    {l.mega && (
                      <ChevronDown className={cn("h-3 w-3 opacity-70 transition-transform duration-200", megaOpen && "rotate-180")} />
                    )}
                  </Link>
                </div>
              );
            })}
          </nav>

          <div className="flex flex-1 items-center justify-end">
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-ink-100 bg-ivory-50/70 py-1 pl-2 pr-1 sm:pl-3">
              <button
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                className="flex items-center gap-2 rounded-full px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-600 transition-colors hover:bg-ink-900/[0.05] hover:text-gold-600 sm:px-3"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Search</span>
              </button>

              <span className="hidden h-4 w-px bg-ink-200 sm:block" />

              {/* Account — a small menu rather than a bare link, so signing out and reaching
                  orders doesn't need a trip to the profile page first. */}
              <div ref={accountRef} className="relative hidden sm:block">
                <button
                  onClick={() => (signedIn ? setAccountOpen((o) => !o) : router.push("/auth/login"))}
                  aria-label="Account"
                  aria-expanded={accountOpen}
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-600 transition-colors hover:bg-ink-900/[0.05] hover:text-gold-600"
                >
                  {signedIn && user?.avatar ? (
                    <img src={user.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <User className="h-3.5 w-3.5" />
                  )}
                  <span>{signedIn ? (user?.name?.split(" ")[0] ?? "Account") : "Profile"}</span>
                </button>

                <AnimatePresence>
                  {accountOpen && signedIn && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.16 }}
                      className="absolute right-0 top-full z-50 mt-3 w-60 overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50 shadow-[0_24px_60px_-24px_rgba(10,9,8,0.45)]"
                    >
                      <div className="border-b border-ink-100 px-4 py-3">
                        <p className="truncate text-sm font-semibold text-ink-900">{user?.name}</p>
                        <p className="truncate text-xs text-ink-400">{user?.email}</p>
                      </div>
                      <nav className="p-1.5">
                        {[
                          { href: "/profile", label: "Orders", Icon: Package },
                          { href: "/profile", label: "Addresses", Icon: MapPin },
                          ...(isAdmin ? [{ href: "/admin", label: "Admin panel", Icon: Settings }] : []),
                        ].map((m, i) => (
                          <Link
                            key={`${m.label}-${i}`}
                            href={m.href}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-700 transition-colors hover:bg-ink-900/[0.05] hover:text-ink-900"
                          >
                            <m.Icon className="h-4 w-4 text-ink-400" />
                            {m.label}
                          </Link>
                        ))}
                        <button
                          onClick={() => { setAccountOpen(false); void signOut(); router.push("/"); }}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink-700 transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <LogOut className="h-4 w-4 text-ink-400" />
                          Sign out
                        </button>
                      </nav>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Link
                href="/cart"
                aria-label="Cart"
                className="relative flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ivory-50 transition-colors hover:bg-gold-500 hover:text-ink-900"
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cart</span>
                {mounted && count > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-gold-500 text-[9px] font-semibold text-ink-900">
                    {count}
                  </span>
                )}
              </Link>

              <button
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMenuOpen((o) => !o)}
                className="grid h-9 w-9 place-items-center rounded-full text-ink-700 transition-colors hover:bg-ink-900/[0.05] lg:hidden"
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Products mega menu */}
        <AnimatePresence>
          {megaOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="absolute inset-x-0 top-full hidden border-t border-ink-100 bg-ivory-50 shadow-[0_30px_60px_-30px_rgba(10,9,8,0.45)] lg:block"
              onMouseEnter={openMega}
              onMouseLeave={closeMega}
            >
              <div className="container-page grid gap-8 py-8 lg:grid-cols-[2.4fr_1fr]">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-600">
                    Shop by category
                  </p>
                  <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {shopCats.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/shop?category=${c.id}`}
                          className="group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-ink-800 transition-colors hover:bg-ink-900/[0.05] hover:text-gold-700"
                        >
                          <span>{c.name}</span>
                          <span className="tabular rounded-full bg-ink-900/[0.05] px-2 py-0.5 text-[11px] text-ink-500 group-hover:text-gold-600">
                            {c.count}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/shop"
                    className="mt-5 inline-flex items-center gap-2 rounded-full border border-ink-200 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-600 transition-colors hover:border-gold-400 hover:text-gold-700"
                  >
                    View all products
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <Link
                  href="/#play"
                  className="group relative hidden overflow-hidden rounded-2xl border border-ink-100 bg-ink-900 text-ivory-100 lg:block"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-gold-400/25 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative flex h-full flex-col justify-between p-6">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-gold-400">Try it here</p>
                    <div>
                      <p className="heading-serif text-xl">
                        Play before you buy — <em>right here.</em>
                      </p>
                      <p className="mt-2 text-xs text-ivory-100/60">Our online keyboard, on this page.</p>
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
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-30 flex flex-col overflow-y-auto overscroll-contain bg-ivory-50 pt-20 lg:hidden"
          >
            <nav className="px-4 pt-4">
              {nav.map((l, i) => (
                <motion.div
                  key={l.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 + i * 0.04, duration: 0.25 }}
                >
                  <Link
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="mb-2 flex items-center justify-between rounded-2xl border border-ink-100 bg-ivory-100/60 px-5 py-4 text-xl font-bold text-ink-900 transition-colors active:bg-ink-900/[0.05]"
                  >
                    <span>{l.label}</span>
                    <ArrowRight className="h-4 w-4 text-gold-500" />
                  </Link>
                </motion.div>
              ))}
            </nav>

            <div className="px-4 pt-4">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-600">
                Categories
              </p>
              <ul className="mt-3 grid grid-cols-2 gap-2">
                {shopCats.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/shop?category=${c.id}`}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3.5 py-3 text-sm text-ink-700 active:border-gold-400"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="tabular shrink-0 text-[11px] text-ink-400">{c.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 px-4">
              <Link
                href={signedIn ? "/profile" : "/auth/login"}
                onClick={() => setMenuOpen(false)}
                className="btn-gold-solid w-full"
              >
                <User className="h-3.5 w-3.5" />
                {signedIn ? "Your account" : "Sign in"}
              </Link>
            </div>

            <div className="mt-auto p-6 text-[11px] uppercase tracking-[0.22em] text-ink-400">
              <p>Sri Saraswathy Musicals</p>
              <p className="mt-1">{BUSINESS.branches.map((b) => b.area).join(" · ")} · Est. 1965</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 px-4 pb-10 pt-20 backdrop-blur-sm md:pt-28"
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl overflow-hidden rounded-3xl border border-ink-100 bg-ivory-50 shadow-[0_40px_90px_-30px_rgba(10,9,8,0.6)]"
            >
              <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
                <Search className="h-4 w-4 shrink-0 text-gold-500" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runSearch(search); }}
                  placeholder="Search violins, veenas, pianos, brands…"
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
                />
                {search && (
                  <button onClick={() => setSearch("")} aria-label="Clear" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-ink-900/5 hover:text-ink-900">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setSearchOpen(false)}
                  className="hidden shrink-0 rounded-lg border border-ink-200 px-2 py-1 font-mono text-[10px] text-ink-500 hover:border-gold-500 hover:text-gold-600 sm:block"
                >
                  ESC
                </button>
              </div>

              <div className="max-h-[60dvh] overflow-y-auto">
                {search.trim() === "" && (
                  <div className="p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-600">
                      Popular right now
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {POPULAR.map((k) => (
                        <button
                          key={k}
                          onClick={() => setSearch(k)}
                          className="rounded-full border border-ink-200 px-3.5 py-1.5 text-sm text-ink-700 transition-colors hover:border-gold-400 hover:bg-gold-50 hover:text-gold-700"
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                    {shopCats.length > 0 && (
                      <>
                        <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-600">
                          Browse
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {shopCats.map((c) => (
                            <Link
                              key={c.id}
                              href={`/shop?category=${c.id}`}
                              onClick={() => setSearchOpen(false)}
                              className="rounded-full bg-ink-900/[0.05] px-3.5 py-1.5 text-sm text-ink-700 transition-colors hover:bg-ink-900 hover:text-ivory-50"
                            >
                              {c.name}
                            </Link>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {search.trim() !== "" && searching && results.length === 0 && (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="flex animate-pulse items-center gap-4 rounded-2xl p-2">
                        <div className="h-14 w-14 shrink-0 rounded-xl bg-ink-100" />
                        <div className="flex-1 space-y-2">
                          <div className="h-2.5 w-20 rounded bg-ink-100" />
                          <div className="h-3.5 w-48 rounded bg-ink-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {search.trim() !== "" && !searching && results.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-sm text-ink-600">
                      Nothing matched &ldquo;{search.trim()}&rdquo;.
                    </p>
                    <p className="mt-1 text-xs text-ink-400">Try a shorter word, or a brand name.</p>
                  </div>
                )}

                {results.length > 0 && (
                  <ul className="p-2">
                    {results.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/product/${p.slug}`}
                          onClick={() => setSearchOpen(false)}
                          className="flex items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors hover:bg-ink-900/[0.04]"
                        >
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-ink-100">
                            {p.photo && (
                              <Image src={p.photo} alt="" fill unoptimized={p.photo.startsWith("/api/")} sizes="56px" className="object-contain p-1" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase tracking-[0.22em] text-gold-600">{p.brand}</p>
                            <p className="truncate text-[15px] font-medium text-ink-900">{p.name}</p>
                          </div>
                          <span className="tabular shrink-0 text-sm font-semibold text-ink-900">
                            {formatINR(p.price)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {search.trim() !== "" && (
                <button
                  onClick={() => runSearch(search)}
                  className="flex w-full items-center justify-center gap-2 border-t border-ink-100 bg-ivory-100/70 py-3.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-700 transition-colors hover:bg-ink-900 hover:text-ivory-50"
                >
                  See all results for &ldquo;{search.trim()}&rdquo;
                  <CornerDownLeft className="h-3.5 w-3.5" />
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
