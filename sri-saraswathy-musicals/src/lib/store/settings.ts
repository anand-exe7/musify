"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Zone {
  id: string;
  name: string;
  charge: number;
  eta: string;
}

interface SettingsState {
  freeThreshold: number;
  standardCharge: number;
  expressCharge: number;
  storePickup: boolean;
  zones: Zone[];
  set: (patch: Partial<Omit<SettingsState, "set" | "addZone" | "updateZone" | "removeZone" | "zones">>) => void;
  addZone: (z: Zone) => void;
  updateZone: (id: string, patch: Partial<Zone>) => void;
  removeZone: (id: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      freeThreshold: 25000,
      standardCharge: 250,
      expressCharge: 600,
      storePickup: true,
      zones: [
        { id: "z1", name: "Chennai (within 15 km)", charge: 0, eta: "Same day" },
        { id: "z2", name: "Bengaluru (within 15 km)", charge: 0, eta: "Same day" },
        { id: "z3", name: "Tamil Nadu · Karnataka", charge: 250, eta: "2–3 days" },
        { id: "z4", name: "Rest of India", charge: 600, eta: "4–7 days" },
      ],
      set: (patch) => set(patch),
      addZone: (z) => set((s) => ({ zones: [...s.zones, z] })),
      updateZone: (id, patch) => set((s) => ({ zones: s.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) })),
      removeZone: (id) => set((s) => ({ zones: s.zones.filter((z) => z.id !== id) })),
    }),
    { name: "ssm-settings-v1" },
  ),
);
