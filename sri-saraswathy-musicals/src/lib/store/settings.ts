"use client";
import { create } from "zustand";

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
  hydrate: () => Promise<void>;
  set: (patch: Partial<Scalars>) => void;
  addZone: (z: Zone) => void;
  updateZone: (id: string, patch: Partial<Zone>) => void;
  removeZone: (id: string) => void;
}

const DEFAULTS: Scalars = {
  freeThreshold: 25000,
  standardCharge: 250,
  expressCharge: 600,
  storePickup: true,
};

async function send(url: string, method: string, body: unknown, onError: () => void) {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error("save failed");
  } catch {
    alert("Couldn't save delivery settings. Reverting to the saved values.");
    onError();
  }
}

export const useSettings = create<SettingsState>()((set, get) => ({
  ...DEFAULTS,
  zones: [],
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/settings/delivery");
      if (!res.ok) return;
      const data = (await res.json()) as Scalars & { zones: Zone[] };
      set({ ...data, hydrated: true });
    } catch {
      /* keep defaults */
    }
  },
  set: (patch) => {
    set(patch);
    void send("/api/settings/delivery", "PATCH", patch, get().hydrate);
  },
  addZone: (z) => {
    set((s) => ({ zones: [...s.zones, z] }));
    void send("/api/settings/delivery/zones", "POST", z, get().hydrate);
  },
  updateZone: (id, patch) => {
    set((s) => ({ zones: s.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) }));
    void send(`/api/settings/delivery/zones/${id}`, "PATCH", patch, get().hydrate);
  },
  removeZone: (id) => {
    set((s) => ({ zones: s.zones.filter((z) => z.id !== id) }));
    void send(`/api/settings/delivery/zones/${id}`, "DELETE", null, get().hydrate);
  },
}));

if (typeof window !== "undefined") {
  void useSettings.getState().hydrate();
}
