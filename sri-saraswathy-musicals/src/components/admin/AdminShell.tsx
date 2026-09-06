"use client";
import { useEffect, useState } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";
import { AdminFooter } from "./AdminFooter";
import { cn } from "@/lib/utils";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const onMenu = () => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) setCollapsed((c) => !c);
    else setMobileOpen(true);
  };

  return (
    <div className="flex min-h-screen bg-[#F4F1EA] text-ink-900">
      <AdminSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} collapsed={collapsed} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AdminTopbar onMenu={onMenu} />
        <main className="flex-1">
          <div className={cn("w-full transition-all", collapsed && "mx-auto max-w-[1500px]")}>
            {mounted ? (
              children
            ) : (
              <div className="grid h-[60vh] place-items-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-gold-500" />
              </div>
            )}
          </div>
        </main>
        <AdminFooter />
      </div>
    </div>
  );
}
