"use client";
/**
 * Admin branch scope — the single source of truth for "which branch am I acting
 * as right now". Hydrated from the signed-in session:
 *   • Full admins ("all") may switch between All / Branch 1 / Branch 2.
 *   • Branch-scoped staff are pinned to their own branch and cannot switch.
 *
 * The admin topbar renders the switcher from this store; the POS billing screen
 * (and, incrementally, other admin surfaces) reads it to scope what they show
 * and which branch new records attach to.
 */
import { create } from "zustand";
import { adminAccessOf, type AdminAccess, type BranchKey, type SessionUser } from "./auth";

export type BranchScope = "all" | BranchKey;

export const BRANCHES: BranchKey[] = ["Branch 1", "Branch 2"];

interface BranchScopeState {
  /** Resolved admin reach: "all", a branch key, or null (not yet known / none). */
  access: AdminAccess;
  isAdmin: boolean;
  /** Only full admins may change the selection. */
  canSwitch: boolean;
  /** Current selection driving scoped views. */
  selected: BranchScope;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSelected: (s: BranchScope) => void;
}

export const useBranchScope = create<BranchScopeState>()((set, get) => ({
  access: null,
  isAdmin: false,
  canSwitch: false,
  selected: "all",
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = res.ok ? ((await res.json()) as { user: SessionUser | null }) : { user: null };
      const access = adminAccessOf(data.user);
      const canSwitch = access === "all";
      // Admins keep whatever they last picked; branch users are pinned.
      const selected: BranchScope = canSwitch ? get().selected : access ?? "all";
      set({ access, isAdmin: Boolean(data.user?.isAdmin), canSwitch, selected, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setSelected: (s) => {
    if (!get().canSwitch) return; // locked for branch-scoped users
    set({ selected: s });
  },
}));

if (typeof window !== "undefined") {
  void useBranchScope.getState().hydrate();
}

/**
 * The concrete branch a new bill/record attaches to under the current scope —
 * an admin viewing "all" defaults to Branch 1.
 */
export function effectiveBranch(selected: BranchScope): BranchKey {
  return selected === "all" ? "Branch 1" : selected;
}
