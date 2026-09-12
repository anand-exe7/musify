"use client";
import { create } from "zustand";

export type StaffRole = "Admin" | "Manager" | "Cashier" | "Staff";

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  branch?: string;
}

async function patchStaff(id: string, patch: Partial<Staff>, onError: () => void) {
  try {
    const res = await fetch(`/api/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("save failed");
  } catch {
    alert("Couldn't save staff change. Reverting.");
    onError();
  }
}

interface StaffState {
  staff: Staff[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setRole: (id: string, role: StaffRole) => void;
  toggleActive: (id: string) => void;
}

export const useStaff = create<StaffState>()((set, get) => ({
  staff: [],
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/staff");
      if (!res.ok) return;
      set({ staff: (await res.json()) as Staff[], hydrated: true });
    } catch {
      /* keep empty */
    }
  },
  setRole: (id, role) => {
    set((s) => ({ staff: s.staff.map((u) => (u.id === id ? { ...u, role } : u)) }));
    void patchStaff(id, { role }, get().hydrate);
  },
  toggleActive: (id) => {
    const current = get().staff.find((u) => u.id === id);
    const next = !current?.active;
    set((s) => ({ staff: s.staff.map((u) => (u.id === id ? { ...u, active: next } : u)) }));
    void patchStaff(id, { active: next }, get().hydrate);
  },
}));

if (typeof window !== "undefined") {
  void useStaff.getState().hydrate();
}
