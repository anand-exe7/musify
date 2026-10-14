"use client";
/**
 * Admin branch scope — the single source of truth for "which branch am I acting
 * as right now". Hydrated from the signed-in session:
 *   • Full admins ("all") may switch between All / any single branch.
 *   • Staff with several branches may switch between them (or "all" = all of theirs).
 *   • Staff with one branch are pinned to it and cannot switch.
 *
 * The admin topbar renders the switcher from this store; the POS billing screen
 * (and, incrementally, other admin surfaces) reads it to scope what they show
 * and which branch new records attach to.
 */
import { create } from "zustand";
import { BRANCH_KEYS, DEFAULT_BRANCH } from "@/lib/stock";
import { adminAccessOf, type AdminAccess, type BranchKey, type SessionUser } from "./auth";

export type BranchScope = "all" | BranchKey;

export const BRANCHES: BranchKey[] = [...BRANCH_KEYS];

interface BranchScopeState {
  /** Resolved admin reach: "all", the list of assigned branches, or null (not yet known / none). */
  access: AdminAccess;
  isAdmin: boolean;
  /** Branches this user may work in: every branch for a full admin, else their assigned ones. */
  allowed: BranchKey[];
  /** True when there is more than one branch to choose between. */
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
  allowed: [],
  canSwitch: false,
  selected: "all",
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = res.ok ? ((await res.json()) as { user: SessionUser | null }) : { user: null };
      const access = adminAccessOf(data.user);
      const allowed: BranchKey[] = access === "all" ? [...BRANCH_KEYS] : access ?? [];
      const canSwitch = allowed.length > 1;
      // Anyone with a choice keeps their last pick (if still theirs); a single-branch user is pinned.
      const prev = get().selected;
      const selected: BranchScope = canSwitch ? (prev === "all" || allowed.includes(prev) ? prev : "all") : allowed[0] ?? "all";
      set({ access, isAdmin: Boolean(data.user?.isAdmin), allowed, canSwitch, selected, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setSelected: (s) => {
    if (!get().canSwitch) return; // locked for single-branch users
    if (s !== "all" && !get().allowed.includes(s)) return;
    set({ selected: s });
  },
}));

if (typeof window !== "undefined") {
  void useBranchScope.getState().hydrate();
}

/** The branches the signed-in user may pick for a new record. */
export function useAllowedBranches(): BranchKey[] {
  return useBranchScope((st) => st.allowed);
}

/**
 * The concrete branch a new bill/record attaches to under the current scope —
 * an admin viewing "all" defaults to the first branch.
 */
export function effectiveBranch(selected: BranchScope): BranchKey {
  if (selected !== "all") return selected;
  return useBranchScope.getState().allowed[0] ?? DEFAULT_BRANCH;
}
