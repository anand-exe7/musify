"use client";
import { create } from "zustand";

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

/* ─────────────────────────────  Store  ───────────────────────────── */

async function send(url: string, method: string, body: unknown, onError: () => void) {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error("save failed");
  } catch {
    alert("Couldn't save the inquiry change. Reverting.");
    onError();
  }
}

interface InquiryState {
  inquiries: Inquiry[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addInquiry: (i: Inquiry) => void;
  updateInquiry: (id: string, patch: Partial<Inquiry>) => void;
  deleteInquiry: (id: string) => void;
  resetDemo: () => void;
}

export const useInquiry = create<InquiryState>()((set, get) => ({
  inquiries: [],
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/inquiries");
      if (!res.ok) return;
      set({ inquiries: (await res.json()) as Inquiry[], hydrated: true });
    } catch {
      /* keep empty */
    }
  },
  addInquiry: (i) => {
    set((s) => ({ inquiries: [i, ...s.inquiries] }));
    void send("/api/inquiries", "POST", i, get().hydrate);
  },
  updateInquiry: (id, patch) => {
    set((s) => ({ inquiries: s.inquiries.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    void send(`/api/inquiries/${id}`, "PATCH", patch, get().hydrate);
  },
  deleteInquiry: (id) => {
    set((s) => ({ inquiries: s.inquiries.filter((x) => x.id !== id) }));
    void send(`/api/inquiries/${id}`, "DELETE", null, get().hydrate);
  },
  resetDemo: () => void get().hydrate(),
}));

if (typeof window !== "undefined") {
  void useInquiry.getState().hydrate();
}
