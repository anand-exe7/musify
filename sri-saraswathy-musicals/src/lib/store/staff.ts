"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StaffRole = "Admin" | "Manager" | "Cashier" | "Staff";

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  branch?: string;
}

const seed: Staff[] = [
  { id: "s1", name: "Cenexa Systems", email: "cenexasystems@gmail.com", role: "Admin", active: true },
  { id: "s2", name: "R. Krishnan Naidu", email: "ravi@sarasvathymusicals.com", role: "Admin", active: true },
  { id: "s3", name: "Lakshmi Menon", email: "lakshmi.b1@sarasvathymusicals.com", role: "Manager", active: true, branch: "Branch 1" },
  { id: "s4", name: "Suresh Iyer", email: "suresh.b2@sarasvathymusicals.com", role: "Manager", active: true, branch: "Branch 2" },
  { id: "s5", name: "Priya Sundaram", email: "priya.cash@sarasvathymusicals.com", role: "Cashier", active: true, branch: "Branch 1" },
];

interface StaffState {
  staff: Staff[];
  setRole: (id: string, role: StaffRole) => void;
  toggleActive: (id: string) => void;
}

export const useStaff = create<StaffState>()(
  persist(
    (set) => ({
      staff: seed,
      setRole: (id, role) => set((s) => ({ staff: s.staff.map((u) => (u.id === id ? { ...u, role } : u)) })),
      toggleActive: (id) => set((s) => ({ staff: s.staff.map((u) => (u.id === id ? { ...u, active: !u.active } : u)) })),
    }),
    { name: "ssm-staff-v1" },
  ),
);
