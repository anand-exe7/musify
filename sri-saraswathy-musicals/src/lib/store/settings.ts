"use client";
import { create } from "zustand";
import { fetchJson, errMsg, makeSender } from "@/lib/client/api";
import type { Zone, RateBand, DeliveryMethod } from "@/lib/delivery/types";

export type { Zone, RateBand, DeliveryMethod };

type Scalars = {
  freeThreshold: number;
  standardCharge: number;
  expressCharge: number;
  storePickup: boolean;
  /** ADM-04 / INV-07: show low-stock alerts & highlights when true. */
  lowStockAlerts: boolean;
  /** Whether the low-stock pop-up also rings. Off = it still opens, silently. */
  lowStockSound: boolean;
  /** EXP-01: payment modes whose linked expenses / vendor payments are subtracted in analytics. */
  expenseDeductModes: string[];
  /** EXP-04: managed expense categories. */
  expenseCategories: { name: string; active: boolean }[];
};

interface SettingsState extends Scalars {
  zones: Zone[];
  methods: DeliveryMethod[];
  hydrated: boolean;
  loadError: string | null;
  hydrate: () => Promise<boolean>;
  set: (patch: Partial<Scalars>) => void;
  addZone: (z: Zone) => void;
  updateZone: (id: string, patch: Partial<Zone>) => void;
  removeZone: (id: string) => void;
  addRate: (zoneId: string, r: RateBand) => void;
  updateRate: (zoneId: string, id: string, patch: Partial<RateBand>) => void;
  removeRate: (zoneId: string, id: string) => void;
  addMethod: (m: DeliveryMethod) => void;
  updateMethod: (id: string, patch: Partial<DeliveryMethod>) => void;
  removeMethod: (id: string) => void;
}

const DEFAULTS: Scalars = {
  // Money in paise: ₹25,000 free-shipping threshold, ₹250 standard, ₹600 express.
  freeThreshold: 2500000,
  standardCharge: 25000,
  expressCharge: 60000,
  storePickup: true,
  lowStockAlerts: true,
  lowStockSound: true,
  expenseDeductModes: ["CASH", "CARD", "UPI"],
  expenseCategories: [],
};

const send = makeSender("delivery settings");

export const useSettings = create<SettingsState>()((set, get) => ({
  ...DEFAULTS,
  zones: [],
  methods: [],
  hydrated: false,
  loadError: null,
  hydrate: async () => {
    try {
      const data = await fetchJson<Scalars & { zones: Zone[]; methods: DeliveryMethod[] }>("/api/settings/delivery");
      set({ ...data, hydrated: true, loadError: null });
      return true;
    } catch (e) {
      set({ loadError: errMsg(e, "Couldn't load delivery settings") });
      return false;
    }
  },
  set: (patch) => {
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, get()[k as keyof Scalars]]));
    set(patch);
    void send("/api/settings/delivery", "PATCH", patch, get().hydrate, () => set(prev));
  },
  addZone: (z) => {
    const prev = get().zones;
    set((s) => ({ zones: [...s.zones, z] }));
    void send("/api/settings/delivery/zones", "POST", z, get().hydrate, () => set({ zones: prev }));
  },
  updateZone: (id, patch) => {
    const prev = get().zones;
    set((s) => ({ zones: s.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) }));
    void send(`/api/settings/delivery/zones/${id}`, "PATCH", patch, get().hydrate, () => set({ zones: prev }));
  },
  removeZone: (id) => {
    const prev = get().zones;
    set((s) => ({ zones: s.zones.filter((z) => z.id !== id) }));
    void send(`/api/settings/delivery/zones/${id}`, "DELETE", null, get().hydrate, () => set({ zones: prev }));
  },

  /* Weight bands. A band belongs to a zone, so every change edits that zone's `rates`. */
  addRate: (zoneId, r) => {
    const prev = get().zones;
    set((s) => ({ zones: s.zones.map((z) => (z.id === zoneId ? { ...z, rates: [...z.rates, r] } : z)) }));
    void send(`/api/settings/delivery/zones/${zoneId}/rates`, "POST", r, get().hydrate, () => set({ zones: prev }));
  },
  updateRate: (zoneId, id, patch) => {
    const prev = get().zones;
    set((s) => ({
      zones: s.zones.map((z) =>
        z.id === zoneId ? { ...z, rates: z.rates.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : z,
      ),
    }));
    void send(`/api/settings/delivery/zones/${zoneId}/rates/${id}`, "PATCH", patch, get().hydrate, () => set({ zones: prev }));
  },
  removeRate: (zoneId, id) => {
    const prev = get().zones;
    set((s) => ({ zones: s.zones.map((z) => (z.id === zoneId ? { ...z, rates: z.rates.filter((r) => r.id !== id) } : z)) }));
    void send(`/api/settings/delivery/zones/${zoneId}/rates/${id}`, "DELETE", null, get().hydrate, () => set({ zones: prev }));
  },

  /* Delivery methods — what checkout offers. */
  addMethod: (m) => {
    const prev = get().methods;
    set((s) => ({ methods: [...s.methods, m] }));
    void send("/api/settings/delivery/methods", "POST", m, get().hydrate, () => set({ methods: prev }));
  },
  updateMethod: (id, patch) => {
    const prev = get().methods;
    set((s) => ({ methods: s.methods.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
    void send(`/api/settings/delivery/methods/${id}`, "PATCH", patch, get().hydrate, () => set({ methods: prev }));
  },
  removeMethod: (id) => {
    const prev = get().methods;
    set((s) => ({ methods: s.methods.filter((m) => m.id !== id) }));
    void send(`/api/settings/delivery/methods/${id}`, "DELETE", null, get().hydrate, () => set({ methods: prev }));
  },
}));

if (typeof window !== "undefined") {
  void useSettings.getState().hydrate();
}
