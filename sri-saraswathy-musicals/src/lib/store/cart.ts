"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Cart line identity is (productId, variantKey). A product with two selected
 * variants shows up as two lines; adding the same product+variant twice merges.
 * `variantKey` is `"attr|finish"` — see `lib/catalog/variants.ts`.
 */
interface CartItem {
  productId: string;
  variantKey: string;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  /** Buyer's state — drives place-of-supply GST (CGST+SGST vs IGST). */
  shipState: string;
  setShipState: (state: string) => void;
  addItem: (productId: string, variantKey: string, quantity?: number) => void;
  removeItem: (productId: string, variantKey: string) => void;
  updateQuantity: (productId: string, variantKey: string, quantity: number) => void;
  clear: () => void;
  getCount: () => number;
}

const sameLine = (a: CartItem, productId: string, variantKey: string) =>
  a.productId === productId && a.variantKey === variantKey;

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      shipState: "Tamil Nadu",
      setShipState: (state) => set({ shipState: state }),
      addItem: (productId, variantKey, quantity = 1) =>
        set((s) => {
          const existing = s.items.find((i) => sameLine(i, productId, variantKey));
          if (existing) {
            return {
              items: s.items.map((i) =>
                sameLine(i, productId, variantKey) ? { ...i, quantity: i.quantity + quantity } : i,
              ),
            };
          }
          return { items: [...s.items, { productId, variantKey, quantity }] };
        }),
      removeItem: (productId, variantKey) =>
        set((s) => ({ items: s.items.filter((i) => !sameLine(i, productId, variantKey)) })),
      updateQuantity: (productId, variantKey, quantity) =>
        set((s) => ({
          items:
            quantity <= 0
              ? s.items.filter((i) => !sameLine(i, productId, variantKey))
              : s.items.map((i) =>
                  sameLine(i, productId, variantKey) ? { ...i, quantity } : i,
                ),
        })),
      clear: () => set({ items: [] }),
      getCount: () => get().items.reduce((n, i) => n + i.quantity, 0),
    }),
    {
      name: "ssm-cart",
      version: 2,
      // v1 items lacked variantKey — drop any stale lines rather than guess.
      migrate: (persisted, from) => {
        if (from < 2 && persisted && typeof persisted === "object") {
          return { ...(persisted as object), items: [] } as unknown as CartStore;
        }
        return persisted as CartStore;
      },
    },
  ),
);
