"use client";
import Link from "next/link";
import { PanelLeft, ArrowLeft } from "lucide-react";

export function AdminTopbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-100 bg-ivory-50/90 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          aria-label="Toggle menu"
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-900/5"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
        <span className="text-lg font-bold text-ink-900">Dashboard</span>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-ink-500 transition-colors hover:text-gold-600"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">View Store</span>
        </Link>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-ink-900 text-sm font-semibold text-gold-400">
          A
        </div>
      </div>
    </header>
  );
}
