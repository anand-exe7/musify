"use client";
import { useEffect, useState } from "react";
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
  Wrench,
  MessageSquare,
  Receipt,
  FileText,
  Building2,
  PackagePlus,
  ArrowRightLeft,
  Handshake,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRepair, alertLevel } from "@/lib/store/repair";
import { useInquiry } from "@/lib/store/inquiry";
import { useAuth } from "@/lib/store/auth";

// `staff: true` marks the operational pages a branch-scoped user may open. The
// rest (analytics, catalog config, users, branches) stay full-admin only.
// Items are grouped into sections rendered with small header labels so the
// 19-entry list stops reading as a wall.
interface Item { href: string; label: string; icon: typeof CreditCard; staff?: boolean }
interface Section { title: string; items: Item[] }

const sections: Section[] = [
  {
    title: "Sales",
    items: [
      { href: "/admin/billing", label: "Billing", icon: CreditCard, staff: true },
      { href: "/admin/orders", label: "Orders", icon: ShoppingCart, staff: true },
      { href: "/admin/invoices", label: "Invoices", icon: FileText, staff: true },
      { href: "/admin/service", label: "Service / Repairs", icon: Wrench, staff: true },
      { href: "/admin/inquiries", label: "Inquiries", icon: MessageSquare, staff: true },
    ],
  },
  {
    title: "Inventory",
    items: [
      { href: "/admin/inventory", label: "Inventory", icon: Package },
      { href: "/admin/categories", label: "Categories", icon: Tags },
      { href: "/admin/stock-transfers", label: "Stock Transfers", icon: ArrowRightLeft, staff: true },
    ],
  },
  {
    title: "Procurement",
    items: [
      { href: "/admin/purchases", label: "Purchases", icon: PackagePlus, staff: true },
      { href: "/admin/vendors", label: "Vendors", icon: Handshake },
      { href: "/admin/vendors/outstandings", label: "Vendor Outstandings", icon: Wallet, staff: true },
    ],
  },
  {
    title: "Reports",
    items: [
      { href: "/admin/analytics", label: "Sales Analytics", icon: BarChart3 },
      { href: "/admin/analytics/purchases", label: "Purchase Analytics", icon: BarChart3 },
      { href: "/admin/gst", label: "GST & Tax", icon: Receipt },
      { href: "/admin/expenses", label: "Expenses", icon: Wallet, staff: true },
    ],
  },
  {
    title: "Setup",
    items: [
      { href: "/admin/coupons", label: "Coupons", icon: Ticket },
      { href: "/admin/delivery", label: "Delivery", icon: Truck },
      { href: "/admin/branches", label: "Branches", icon: Building2 },
      { href: "/admin/users", label: "Users", icon: Users },
    ],
  },
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
  const tickets = useRepair((s) => s.tickets);
  const inquiries = useInquiry((s) => s.inquiries);
  const adminAccess = useAuth((s) => s.adminAccess);
  const authHydrated = useAuth((s) => s.hydrated);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Branch-scoped staff get the trimmed operational menu; admins get everything.
  const branchStaff = authHydrated && adminAccess !== "all" && adminAccess !== null;
  const visibleSections = sections
    .map((s) => ({ ...s, items: branchStaff ? s.items.filter((i) => i.staff) : s.items }))
    .filter((s) => s.items.length > 0);

  const repairAlerts = mounted
    ? tickets.filter((t) => {
        const lv = alertLevel(t);
        return lv === "overdue" || lv === "due-soon";
      }).length
    : 0;
  const newInquiries = mounted ? inquiries.filter((i) => i.status === "new").length : 0;

  const badgeFor = (href: string): { n: number; danger?: boolean } | null => {
    if (href === "/admin/service" && repairAlerts > 0) return { n: repairAlerts, danger: true };
    if (href === "/admin/inquiries" && newInquiries > 0) return { n: newInquiries };
    return null;
  };

  // Match the longest-prefixed route first, so e.g. /admin/analytics/purchases
  // doesn't light up the plain /admin/analytics item.
  const activeHref = (() => {
    if (!pathname) return null;
    const flat = visibleSections.flatMap((s) => s.items);
    let best: string | null = null;
    for (const i of flat) {
      if (pathname === i.href || pathname.startsWith(i.href + "/")) {
        if (!best || i.href.length > best.length) best = i.href;
      }
    }
    return best;
  })();

  return (
    <nav className="flex flex-col gap-4 px-3">
      {visibleSections.map((s, idx) => (
        <div key={s.title} className="flex flex-col gap-0.5">
          <p className={cn("px-3.5 pb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-ink-400", idx === 0 ? "pt-0" : "pt-1")}>
            {s.title}
          </p>
          {s.items.map((i) => {
            const active = activeHref === i.href;
            const Icon = i.icon;
            const badge = badgeFor(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-ink-900 text-ivory-50 shadow-sm"
                    : "text-ink-600 hover:bg-ink-900/[0.05] hover:text-ink-900",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                <span className="flex-1">{i.label}</span>
                {badge && (
                  <span
                    className={cn(
                      "grid h-5 min-w-[1.25rem] place-items-center rounded-full px-1.5 text-[10px] font-bold",
                      badge.danger ? "bg-danger text-white" : "bg-gold-500 text-ink-900",
                    )}
                  >
                    {badge.n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
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
