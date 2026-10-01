"use client";
import { create } from "zustand";
import { fetchJson, errMsg, makeSender } from "@/lib/client/api";

export type StaffRole = "Admin" | "Manager" | "Cashier" | "Staff";

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  branch?: string;
}

const send = makeSender("the staff change");

interface StaffState {
  staff: Staff[];
  hydrated: boolean;
  loadError: string | null;
  hydrate: () => Promise<boolean>;
  setRole: (id: string, role: StaffRole) => void;
  toggleActive: (id: string) => void;
}

export const useStaff = create<StaffState>()((set, get) => ({
  staff: [],
  hydrated: false,
  loadError: null,
  hydrate: async () => {
    try {
      set({ staff: await fetchJson<Staff[]>("/api/staff"), hydrated: true, loadError: null });
      return true;
    } catch (e) {
      set({ loadError: errMsg(e, "Couldn't load staff") });
      return false;
    }
  },
  setRole: (id, role) => {
    const prev = get().staff;
    set((s) => ({ staff: s.staff.map((u) => (u.id === id ? { ...u, role } : u)) }));
    void send(`/api/staff/${id}`, "PATCH", { role }, get().hydrate, () => set({ staff: prev }));
  },
  toggleActive: (id) => {
    const prev = get().staff;
    const current = prev.find((u) => u.id === id);
    const next = !current?.active;
    set((s) => ({ staff: s.staff.map((u) => (u.id === id ? { ...u, active: next } : u)) }));
    void send(`/api/staff/${id}`, "PATCH", { active: next }, get().hydrate, () => set({ staff: prev }));
  },
}));

if (typeof window !== "undefined") {
  void useStaff.getState().hydrate();
}
