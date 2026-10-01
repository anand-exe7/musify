"use client";
import { create } from "zustand";
import type { Vendor } from "@/types";
import { fetchJson, errMsg } from "@/lib/client/api";

interface VendorState {
  vendors: Vendor[];
  hydrated: boolean;
  loadError: string | null;
  hydrate: () => Promise<boolean>;
  /** Create a vendor; resolves to the saved row, or null on failure (e.g. a
   *  duplicate code). */
  addVendor: (v: Vendor) => Promise<Vendor | null>;
}

export const useVendors = create<VendorState>()((set) => ({
  vendors: [],
  hydrated: false,
  loadError: null,
  hydrate: async () => {
    try {
      const vendors = await fetchJson<Vendor[]>("/api/vendors", { cache: "no-store" });
      set({ vendors, hydrated: true, loadError: null });
      return true;
    } catch (e) {
      set({ hydrated: true, loadError: errMsg(e, "Couldn't load vendors") });
      return false;
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
