"use client";
import { create } from "zustand";
import type { Vendor } from "@/types";

interface VendorState {
  vendors: Vendor[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Create a vendor; resolves to the saved row, or null on failure (e.g. a
   *  duplicate code). */
  addVendor: (v: Vendor) => Promise<Vendor | null>;
}

export const useVendors = create<VendorState>()((set) => ({
  vendors: [],
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/vendors", { cache: "no-store" });
      set({ vendors: res.ok ? ((await res.json()) as Vendor[]) : [], hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  addVendor: async (v) => {
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) return null;
      const saved = (await res.json()) as Vendor;
      set((s) => ({ vendors: [saved, ...s.vendors] }));
      return saved;
    } catch {
      return null;
    }
  },
}));

/** Match a vendor against a free-text term across name, code and phone. */
export function vendorMatches(v: Vendor, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return (
    v.name.toLowerCase().includes(t) ||
    (v.code ?? "").toLowerCase().includes(t) ||
    v.phone.toLowerCase().includes(t)
  );
}
