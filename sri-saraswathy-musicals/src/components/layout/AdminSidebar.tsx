"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, Boxes, Users, TrendingUp, LogOut, Store, Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import { useState } from "react";

const items = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/billing", label: "Billing & GST", icon: Receipt },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes },
  { href: "/admin/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/admin/users", label: "Users & Access", icon: Users },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((i) => {
        const active = i.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(i.href);
        const Icon = i.icon;
        return (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "group flex items-center gap-3 border-l-2 px-4 py-3 text-sm transition-all",
              active
                ? "border-l-gold-500 bg-gold-50/60 text-ink-900"
                : "border-l-transparent text-ink-600 hover:border-l-ink-200 hover:bg-ivory-100 hover:text-ink-900",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.7} />
            <span className="font-medium">{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile top-bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-100 bg-ivory-50 px-4 py-3 md:hidden">
        <Logo size="sm" />
        <button onClick={() => setMobileOpen(!mobileOpen)} className="grid h-9 w-9 place-items-center">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-100 bg-ivory-50 md:flex">
        <div className="border-b border-ink-100 px-4 py-5">
          <Logo size="sm" />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-600">Admin panel</p>
        </div>
        <div className="flex-1 overflow-y-auto py-4">{nav}</div>
        <div className="border-t border-ink-100 p-4">
          <div className="mb-3 flex items-center gap-3 text-sm">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-ink-900 text-gold-400">RK</div>
            <div className="min-w-0">
              <p className="truncate text-sm text-ink-900">Ravi Krishnan</p>
              <p className="truncate text-[10px] uppercase tracking-widest text-ink-400">Owner · Full access</p>
            </div>
          </div>
          <Link href="/" className="flex w-full items-center gap-2 border border-ink-200 px-3 py-2 text-xs uppercase tracking-widest text-ink-600 hover:border-gold-400 hover:text-gold-600">
            <Store className="h-3.5 w-3.5" /> Back to shop
          </Link>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-72 border-r border-ink-100 bg-ivory-50">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-5">
              <Logo size="sm" />
              <button onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="py-4">{nav}</div>
          </div>
        </div>
      )}
    </>
  );
}
