"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WishlistStore {
  items: string[]; // product IDs
  toggle: (productId: string) => void;
  add: (productId: string) => void;
  remove: (productId: string) => void;
  has: (productId: string) => boolean;
  clear: () => void;
}

export const useWishlist = create<WishlistStore>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (productId) => {
        set((s) =>
          s.items.includes(productId)
            ? { items: s.items.filter((id) => id !== productId) }
            : { items: [...s.items, productId] },
        );
      },
      add: (productId) => {
        if (!get().items.includes(productId)) {
          set((s) => ({ items: [...s.items, productId] }));
        }
      },
      remove: (productId) => {
        set((s) => ({ items: s.items.filter((id) => id !== productId) }));
      },
      has: (productId) => get().items.includes(productId),
      clear: () => set({ items: [] }),
    }),
    { name: "ssm-wishlist" },
  ),
);
