"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PanelLeft, ArrowLeft, MapPin, Lock } from "lucide-react";
import { useBranchScope, BRANCHES, type BranchScope } from "@/lib/store/branch";
import { branchLabel } from "@/lib/stock";

export function AdminTopbar({ onMenu }: { onMenu: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-100 bg-ivory-50/85 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          aria-label="Toggle menu"
          className="grid h-9 w-9 place-items-center rounded-xl text-ink-700 transition-colors hover:bg-ink-900/[0.06]"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
        <span className="text-[17px] font-bold tracking-tight text-ink-900">Dashboard</span>
        {mounted && <BranchSwitcher />}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500 transition-colors hover:bg-ink-900/[0.04] hover:text-gold-700"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">View Store</span>
        </Link>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-ink-800 to-ink-950 text-sm font-bold text-gold-400 ring-1 ring-gold-500/30">
          A
        </div>
      </div>
    </header>
  );
}

/** Branch selector — a live dropdown for full admins, a locked chip otherwise. */
function BranchSwitcher() {
  const access = useBranchScope((s) => s.access);
  const allowed = useBranchScope((s) => s.allowed);
  const canSwitch = useBranchScope((s) => s.canSwitch);
  const selected = useBranchScope((s) => s.selected);
  const setSelected = useBranchScope((s) => s.setSelected);

  if (access === null) return null; // not signed into an admin-capable account

  if (!canSwitch) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-ink-200 bg-ivory-50 px-3 py-1.5 text-[11px] font-semibold text-ink-700 sm:inline-flex">
        <Lock className="h-3 w-3 text-ink-400" />
        {allowed.map(branchLabel).join(" · ")}
      </span>
    );
  }

  return (
    <label className="hidden items-center gap-1.5 rounded-full border border-ink-200 bg-ivory-50 px-2.5 py-1 text-[11px] font-semibold text-ink-700 transition-colors focus-within:border-gold-500 focus-within:ring-2 focus-within:ring-gold-500/15 hover:border-gold-400 sm:inline-flex">
      <MapPin className="h-3.5 w-3.5 text-gold-600" />
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value as BranchScope)}
        aria-label="Branch"
        className="cursor-pointer bg-transparent pr-1 text-[11px] font-semibold text-ink-900 focus:outline-none"
      >
        <option value="all">All Branches</option>
        {BRANCHES.map((b) => (
          <option key={b} value={b}>{branchLabel(b)}</option>
        ))}
      </select>
    </label>
  );
}
