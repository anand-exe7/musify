"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/* ─────────────────────────────  Types  ───────────────────────────── */

export type InquiryStatus = "new" | "contacted" | "resolved";

export const INQUIRY_TOPICS = [
  "Product enquiry",
  "Price / availability",
  "Repair & service",
  "Bulk / institutional order",
  "Trade-in / exchange",
  "Other",
];

export interface Inquiry {
  id: string; // INQ-XXXX
  createdAt: string; // ISO
  name: string;
  phone: string; // WhatsApp
  email?: string;
  topic: string;
  productInterest?: string;
  message: string;
  status: InquiryStatus;
  branch?: "Branch 1" | "Branch 2" | "Any";
}

export const INQUIRY_STATUS_META: Record<InquiryStatus, { label: string; tone: string }> = {
  new: { label: "New", tone: "bg-gold-100 text-gold-700" },
  contacted: { label: "Contacted", tone: "bg-info/15 text-info" },
  resolved: { label: "Resolved", tone: "bg-success/15 text-success" },
};

export function genInquiryId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `INQ-${s}`;
}

/* ─────────────────────────────  Seeds  ───────────────────────────── */

function seed(): Inquiry[] {
  return [
    {
      id: "INQ-7GK2P", createdAt: new Date("2026-09-10T18:22:00").toISOString(),
      name: "Anjali Suresh", phone: "9840567123", email: "anjali.s@gmail.com",
      topic: "Product enquiry", productInterest: "Saraswathi Veena",
      message: "Looking for a concert-grade veena for my daughter's arangetram. Do you have Kanailal in stock at Chennai?",
      status: "new", branch: "Branch 1",
    },
    {
      id: "INQ-3MZ9Q", createdAt: new Date("2026-09-09T11:05:00").toISOString(),
      name: "David Fernandes", phone: "9995012388", email: "",
      topic: "Repair & service", productInterest: "Acoustic guitar",
      message: "My Taylor guitar has a lifting bridge. Can you look at it and give an estimate?",
      status: "contacted", branch: "Any",
    },
    {
      id: "INQ-P1LN4", createdAt: new Date("2026-09-06T15:40:00").toISOString(),
      name: "St. Thomas School (Music Dept)", phone: "9884321000", email: "music@stthomas.edu.in",
      topic: "Bulk / institutional order", productInterest: "20 recorders + 5 keyboards",
      message: "We need a quote for our new music lab — 20 recorders and 5 entry-level keyboards. GST invoice required.",
      status: "resolved", branch: "Branch 2",
    },
  ];
}

/* ─────────────────────────────  Store  ───────────────────────────── */

interface InquiryState {
  inquiries: Inquiry[];
  addInquiry: (i: Inquiry) => void;
  updateInquiry: (id: string, patch: Partial<Inquiry>) => void;
  deleteInquiry: (id: string) => void;
  resetDemo: () => void;
}

export const useInquiry = create<InquiryState>()(
  persist(
    (set) => ({
      inquiries: seed(),
      addInquiry: (i) => set((s) => ({ inquiries: [i, ...s.inquiries] })),
      updateInquiry: (id, patch) =>
        set((s) => ({ inquiries: s.inquiries.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      deleteInquiry: (id) => set((s) => ({ inquiries: s.inquiries.filter((x) => x.id !== id) })),
      resetDemo: () => set({ inquiries: seed() }),
    }),
    { name: "ssm-inquiry-v1" },
  ),
);
