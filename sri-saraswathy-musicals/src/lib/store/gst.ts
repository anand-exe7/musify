"use client";
import { create } from "zustand";

/* ─────────────────────────────  States  ───────────────────────────── */

export const IN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Puducherry",
  "Jammu & Kashmir", "Ladakh", "Chandigarh", "Andaman & Nicobar",
];

/* ─────────────────────────────  Helpers  ───────────────────────────── */

/** Same-state supply → CGST+SGST; different state → IGST. */
export function isIntraState(buyerState: string, homeState: string): boolean {
  return buyerState.trim().toLowerCase() === homeState.trim().toLowerCase();
}

export interface GstBreakup {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/**
 * Split GST across taxable lines. `intra` (same state) yields CGST+SGST
 * (each half the line's rate); inter-state yields a single IGST at full rate.
 */
export function gstBreakup(lines: { amount: number; rate: number }[], intra: boolean): GstBreakup {
  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  for (const l of lines) {
    const g = (l.amount * l.rate) / 100;
    taxable += l.amount;
    if (intra) { cgst += g / 2; sgst += g / 2; } else { igst += g; }
  }
  const r = (n: number) => Math.round(n);
  return { taxable: r(taxable), cgst: r(cgst), sgst: r(sgst), igst: r(igst), total: r(cgst + sgst + igst) };
}

/** Extract the GST already baked into a GST-inclusive amount. */
export function extractGst(grossInclusive: number, rate: number): { gst: number; net: number } {
  const gst = (grossInclusive * rate) / (100 + rate);
  return { gst: Math.round(gst), net: Math.round(grossInclusive - gst) };
}

/* ─────────────────────────────  Store  ───────────────────────────── */

interface GstState {
  /** Seller's registered state — supplies to this state are intra-state. */
  homeState: string;
  cgstLabel: string;
  sgstLabel: string;
  igstLabel: string;
  /** Default slab used where a per-item rate is unavailable (e.g. POS). */
  standardRate: number;
  /** Show the place-of-supply chooser to customers. */
  placeOfSupplyEnabled: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  set: (patch: Partial<Omit<GstState, "set" | "reset" | "hydrate" | "hydrated">>) => void;
  reset: () => void;
}

const DEFAULTS = {
  homeState: "Tamil Nadu",
  cgstLabel: "CGST",
  sgstLabel: "SGST",
  igstLabel: "IGST",
  standardRate: 18,
  placeOfSupplyEnabled: true,
};

type GstConfig = typeof DEFAULTS;

/** Persist config to the backend; on failure, warn and re-hydrate to resync. */
async function persistGst(patch: Partial<GstConfig>, hydrate: () => Promise<void>) {
  try {
    const res = await fetch("/api/settings/gst", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("save failed");
  } catch {
    alert("Couldn't save GST settings. Reverting to the saved values.");
    hydrate();
  }
}

export const useGst = create<GstState>()((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/settings/gst");
      if (!res.ok) return;
      const data = (await res.json()) as GstConfig;
      set({ ...data, hydrated: true });
    } catch {
      /* leave defaults in place */
    }
  },
  // Optimistic: apply locally now, persist in the background.
  set: (patch) => {
    set(patch);
    void persistGst(patch, get().hydrate);
  },
  reset: () => {
    set(DEFAULTS);
    void persistGst(DEFAULTS, get().hydrate);
  },
}));

if (typeof window !== "undefined") {
  void useGst.getState().hydrate();
}
