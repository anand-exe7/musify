"use client";
import { create } from "zustand";
import { fetchJson, errMsg, makeSender } from "@/lib/client/api";

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

// Order tax is computed server-side (see `lib/checkout/pricing.ts`) — the
// storefront renders the server's quote and carries no tax maths of its own.

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
  /** Why the last load failed (null = fine). A failed load keeps the defaults but is never silent. */
  loadError: string | null;
  hydrate: () => Promise<boolean>;
  set: (patch: Partial<Omit<GstState, "set" | "reset" | "hydrate" | "hydrated" | "loadError">>) => void;
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

const sendGst = makeSender("GST settings");

/** The current values of just the keys `patch` touches. */
function pick(state: GstConfig, patch: Partial<GstConfig>): Partial<GstConfig> {
  return Object.fromEntries(Object.keys(patch).map((k) => [k, state[k as keyof GstConfig]])) as Partial<GstConfig>;
}

/** Persist config to the backend. On failure the user is told why, the store
 *  re-reads the saved values, and if even that fails the previous values are
 *  restored — the revert always happens. */
function persistGst(patch: Partial<GstConfig>, hydrate: () => Promise<boolean>, restore: () => void) {
  return sendGst("/api/settings/gst", "PATCH", patch, hydrate, restore);
}

export const useGst = create<GstState>()((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  loadError: null,
  hydrate: async () => {
    try {
      const data = await fetchJson<GstConfig>("/api/settings/gst");
      set({ ...data, hydrated: true, loadError: null });
      return true;
    } catch (e) {
      // Keep the defaults on screen, but say so — `hydrated` stays false so
      // nothing (e.g. the settings form) mistakes them for the saved values.
      set({ loadError: errMsg(e, "Couldn't load GST settings") });
      return false;
    }
  },
  // Optimistic: apply locally now, persist in the background; on failure the
  // previous values come straight back.
  set: (patch) => {
    const prev = pick(get(), patch);
    set(patch);
    void persistGst(patch, get().hydrate, () => set(prev));
  },
  reset: () => {
    const prev = pick(get(), DEFAULTS);
    set(DEFAULTS);
    void persistGst(DEFAULTS, get().hydrate, () => set(prev));
  },
}));

if (typeof window !== "undefined") {
  void useGst.getState().hydrate();
}
