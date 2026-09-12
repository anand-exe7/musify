"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CartItem {
  productId: string;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  /** Buyer's state — drives place-of-supply GST (CGST+SGST vs IGST). */
  shipState: string;
  setShipState: (state: string) => void;
  addItem: (productId: string, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
  getCount: () => number;
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      shipState: "Tamil Nadu",
      setShipState: (state) => set({ shipState: state }),
      addItem: (productId, quantity = 1) =>
        set((s) => {
          const existing = s.items.find((i) => i.productId === productId);
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.productId === productId ? { ...i, quantity: i.quantity + quantity } : i,
              ),
            };
          }
          return { items: [...s.items, { productId, quantity }] };
        }),
      removeItem: (productId) =>
        set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
      updateQuantity: (productId, quantity) =>
        set((s) => ({
          items: quantity <= 0
            ? s.items.filter((i) => i.productId !== productId)
            : s.items.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
        })),
      clear: () => set({ items: [] }),
      getCount: () => get().items.reduce((n, i) => n + i.quantity, 0),
    }),
    { name: "ssm-cart" },
  ),
);
