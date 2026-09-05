"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingBag, Search, Heart, User } from "lucide-react";
import { useCart } from "@/lib/store/cart";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const tabs = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/shop", icon: Search, label: "Shop" },
  { href: "/cart", icon: ShoppingBag, label: "Cart" },
  { href: "/profile", icon: User, label: "Profile" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const count = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));

  useEffect(() => setMounted(true), []);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-ivory-50/95 backdrop-blur-md safe-bottom md:hidden">
      <div className="grid grid-cols-4">
        {tabs.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname?.startsWith(t.href);
          const Icon = t.icon;
          const isCart = t.href === "/cart";
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "relative flex flex-col items-center gap-1 py-3 text-[10px] uppercase tracking-[0.14em] transition-colors",
                active ? "text-gold-600" : "text-ink-500",
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.6} />
                {isCart && mounted && count > 0 && (
                  <span className="absolute -right-2 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-gold-500 text-[9px] font-semibold text-ink-900">
                    {count}
                  </span>
                )}
              </span>
              {t.label}
              {active && <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 bg-gold-500" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
