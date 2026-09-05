"use client";
import { useEffect, useState } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";
import { AdminFooter } from "./AdminFooter";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex min-h-screen bg-[#F4F1EA] text-ink-900">
      <AdminSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AdminTopbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1">
          {mounted ? (
            children
          ) : (
            <div className="grid h-[60vh] place-items-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-gold-500" />
            </div>
          )}
        </main>
        <AdminFooter />
      </div>
    </div>
  );
}
