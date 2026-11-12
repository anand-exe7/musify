"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { genDocId } from "@/lib/ids";
import { fetchJson, errMsg, makeSender } from "@/lib/client/api";

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
  id: string; // INQ-2026-XXXXX
  createdAt: string; // ISO
  name: string;
  phone: string; // WhatsApp
  email?: string;
  topic: string;
  productInterest?: string;
  message: string;
  status: InquiryStatus;
  branch?: string;
}

export const INQUIRY_STATUS_META: Record<InquiryStatus, { label: string; tone: string }> = {
  new: { label: "New", tone: "bg-gold-100 text-gold-700" },
  contacted: { label: "Contacted", tone: "bg-info/15 text-info" },
  resolved: { label: "Resolved", tone: "bg-success/15 text-success" },
};

export function genInquiryId(): string {
  return genDocId("INQ");
}

/* ─────────────────────────────  Store  ───────────────────────────── */

const send = makeSender("the inquiry change");

interface InquiryState {
  inquiries: Inquiry[];
  hydrated: boolean;
  loadError: string | null;
  hydrate: () => Promise<boolean>;
  addInquiry: (i: Inquiry) => void;
  updateInquiry: (id: string, patch: Partial<Inquiry>) => void;
  deleteInquiry: (id: string) => void;
  resetDemo: () => void;
}

export const useInquiry = create<InquiryState>()((set, get) => ({
  inquiries: [],
  hydrated: false,
  loadError: null,
  hydrate: async () => {
    try {
      set({ inquiries: await fetchJson<Inquiry[]>("/api/inquiries"), hydrated: true, loadError: null });
      return true;
    } catch (e) {
      set({ loadError: errMsg(e, "Couldn't load inquiries") });
      return false;
    }
  },
  addInquiry: (i) => {
    const prev = get().inquiries;
    set((s) => ({ inquiries: [i, ...s.inquiries] }));
    // Reload only when this screen already had the list (staff); a visitor posting the
    // storefront form must not call the staff-only GET.
    void send("/api/inquiries", "POST", i, () => (get().hydrated ? get().hydrate() : Promise.resolve(true)), () =>
      set({ inquiries: prev }),
    );
  },
  updateInquiry: (id, patch) => {
    const prev = get().inquiries;
    set((s) => ({ inquiries: s.inquiries.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
    void send(`/api/inquiries/${id}`, "PATCH", patch, get().hydrate, () => set({ inquiries: prev }));
  },
  deleteInquiry: (id) => {
    const prev = get().inquiries;
    set((s) => ({ inquiries: s.inquiries.filter((x) => x.id !== id) }));
    void send(`/api/inquiries/${id}`, "DELETE", null, get().hydrate, () => set({ inquiries: prev }));
  },
  resetDemo: () => void get().hydrate(),
}));

/**
 * Load the inquiry list once, for the screens allowed to see it. The list is staff-only, so this
 * is NOT done on import: the storefront's own inquiry form imports this store too, and every
 * visitor was firing a GET that came back 401.
 */
let hydrating: Promise<boolean> | null = null;
export function ensureInquiriesLoaded(): Promise<boolean> {
  if (useInquiry.getState().hydrated) return Promise.resolve(true);
  hydrating ??= useInquiry
    .getState()
    .hydrate()
    .finally(() => {
      hydrating = null;
    });
  return hydrating;
}

/** Call from a staff-only screen to load the list on mount. */
export function useInquiriesLoaded(): void {
  useEffect(() => {
    void ensureInquiriesLoaded();
  }, []);
}
