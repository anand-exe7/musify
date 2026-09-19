"use client";
import { useEffect, useState } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";
import { AdminFooter } from "./AdminFooter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/store/auth";
import { useRouter } from "next/navigation";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const hydrate = useAuth((s) => s.hydrate);
  const adminAccess = useAuth((s) => s.adminAccess);
  const hydrated = useAuth((s) => s.hydrated);
  const router = useRouter();

  // Re-check the session from the DB on every admin page mount.
  // This ensures is_admin / branch changes are reflected immediately
  // without requiring a logout → login cycle.
  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once we know access level: redirect if no admin rights.
  useEffect(() => {
    if (hydrated && adminAccess === null) {
      router.replace("/?denied=admin");
    }
  }, [hydrated, adminAccess, router]);

  const onMenu = () => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) setCollapsed((c) => !c);
    else setMobileOpen(true);
  };

  // ── Loading gate — show spinner until DB check is done ──────────────────
  // This prevents the page content from flashing before access is confirmed,
  // whether you navigate to /admin or type the URL directly.
  if (!hydrated || adminAccess === null) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-[#F4F1EA]">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-ink-200 border-t-gold-500" />
          <div className="absolute inset-[6px] animate-spin rounded-full border-2 border-ink-100 border-b-gold-300 [animation-direction:reverse] [animation-duration:600ms]" />
        </div>
        <p className="text-[11px] uppercase tracking-[0.24em] text-ink-400">Verifying access…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F4F1EA] text-ink-900">
      <AdminSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} collapsed={collapsed} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AdminTopbar onMenu={onMenu} />
        <main className="flex-1">
          <div className={cn("w-full transition-all", collapsed && "mx-auto max-w-[1500px]")}>
            {children}
          </div>
        </main>
        <AdminFooter />
      </div>
    </div>
  );
}
