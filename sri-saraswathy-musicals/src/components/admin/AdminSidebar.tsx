"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  BarChart3,
  ShoppingCart,
  Package,
  Tags,
  Ticket,
  Truck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/analytics", label: "POS Analytics", icon: BarChart3 },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/inventory", label: "Inventory", icon: Package },
  { href: "/admin/categories", label: "Categories", icon: Tags },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket },
  { href: "/admin/delivery", label: "Delivery", icon: Truck },
  { href: "/admin/users", label: "Users", icon: Users },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink-900">
        <Image src="/LOGO2.png" alt="" width={28} height={28} className="object-contain" />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate font-display text-lg font-bold text-ink-900">Saraswathy</p>
        <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-gold-600">Admin</p>
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((i) => {
        const active = pathname?.startsWith(i.href);
        const Icon = i.icon;
        return (
          <Link
            key={i.href}
            href={i.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-all",
              active
                ? "bg-ink-900 text-ivory-50 shadow-sm"
                : "text-ink-600 hover:bg-ink-900/[0.05] hover:text-ink-900",
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
            <span>{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSidebar({
  mobileOpen,
  setMobileOpen,
  collapsed,
}: {
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  collapsed?: boolean;
}) {
  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-100 bg-ivory-50 lg:flex",
          collapsed && "lg:hidden",
        )}
      >
        <Brand />
        <div className="mt-2 flex-1 overflow-y-auto pb-6">
          <NavList />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-ink-100 bg-ivory-50">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-900/5">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 flex-1 overflow-y-auto pb-6">
              <NavList onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
