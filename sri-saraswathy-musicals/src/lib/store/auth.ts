"use client";
import { create } from "zustand";

export type BranchKey = "Branch 1" | "Branch 2";
export type AdminAccess = "all" | BranchKey | null;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  branch?: BranchKey | null;
  avatar?: string | null;
}

/** Full admins reach every branch; a user with a branch is scoped to it. */
export function adminAccessOf(u: SessionUser | null): AdminAccess {
  if (!u) return null;
  if (u.isAdmin) return "all";
  return u.branch ?? null;
}

interface AuthStore {
  user: SessionUser | null;
  /** Convenience booleans derived from `user`. */
  loggedIn: boolean;
  isAdmin: boolean;
  /** Admin-area reach: "all", a branch key, or null (no admin access). */
  adminAccess: AdminAccess;
  /** True once the first session fetch has resolved (so the UI can avoid
   *  flashing signed-out state before we know). */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Real session state, sourced from the httpOnly session cookie via
 * `/api/auth/session`. The cookie is the source of truth — this store just
 * mirrors it for the client UI (header, profile). Sign-in happens through the
 * Google OAuth redirect flow, not here.
 */
export const useAuth = create<AuthStore>()((set) => ({
  user: null,
  loggedIn: false,
  isAdmin: false,
  adminAccess: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = res.ok ? ((await res.json()) as { user: SessionUser | null }) : { user: null };
      set({
        user: data.user,
        loggedIn: Boolean(data.user),
        isAdmin: Boolean(data.user?.isAdmin),
        adminAccess: adminAccessOf(data.user),
        hydrated: true,
      });
    } catch {
      set({ user: null, loggedIn: false, isAdmin: false, adminAccess: null, hydrated: true });
    }
  },
  logout: async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore — clear locally regardless */
    }
    set({ user: null, loggedIn: false, isAdmin: false, adminAccess: null });
  },
}));

// Self-hydrate on first client import, mirroring the other stores.
if (typeof window !== "undefined") {
  void useAuth.getState().hydrate();
}
