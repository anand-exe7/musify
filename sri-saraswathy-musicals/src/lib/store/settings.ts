"use client";
import { create } from "zustand";
import { fetchJson, errMsg, makeSender } from "@/lib/client/api";

export interface Zone {
  id: string;
  name: string;
  /** Indian states this zone covers. Empty = fallback for anywhere unlisted. */
  states: string[];
  /** Legacy flat rate — ignored when the tier fields are set. */
  charge: number;
  eta: string;
  /** Surface-transit slabs (₹, GST-inclusive) mirroring Professional Couriers. */
  uptoGm250: number;
  uptoGm500: number;
  perAddl500: number;
  above5kgPerKg: number;
  above10kgPerKg: number;
}

type Scalars = {
  freeThreshold: number;
  standardCharge: number;
  expressCharge: number;
  storePickup: boolean;
};

interface SettingsState extends Scalars {
  zones: Zone[];
  hydrated: boolean;
  loadError: string | null;
  hydrate: () => Promise<boolean>;
  set: (patch: Partial<Scalars>) => void;
  addZone: (z: Zone) => void;
  updateZone: (id: string, patch: Partial<Zone>) => void;
  removeZone: (id: string) => void;
}

const DEFAULTS: Scalars = {
  // Money in paise: ₹25,000 free-shipping threshold, ₹250 standard, ₹600 express.
  freeThreshold: 2500000,
  standardCharge: 25000,
  expressCharge: 60000,
  storePickup: true,
};

const send = makeSender("delivery settings");

export const useSettings = create<SettingsState>()((set, get) => ({
  ...DEFAULTS,
  zones: [],
  hydrated: false,
  loadError: null,
  hydrate: async () => {
    try {
      const data = await fetchJson<Scalars & { zones: Zone[] }>("/api/settings/delivery");
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
}));

if (typeof window !== "undefined") {
  void useSettings.getState().hydrate();
}
