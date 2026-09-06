"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthStore {
  loggedIn: boolean;
  login: () => void;
  logout: () => void;
}

/**
 * Lightweight client-side session flag.
 * Persisted so a signed-in visitor is remembered across reloads and
 * navigation — the header/profile stop bouncing back to the login page.
 */
export const useAuth = create<AuthStore>()(
  persist(
    (set) => ({
      loggedIn: false,
      login: () => set({ loggedIn: true }),
      logout: () => set({ loggedIn: false }),
    }),
    { name: "ssm-auth" },
  ),
);
