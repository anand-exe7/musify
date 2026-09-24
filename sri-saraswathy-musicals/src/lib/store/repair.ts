"use client";
import { create } from "zustand";
import type { Branch } from "@/lib/store/pos";
import { genDocId } from "@/lib/ids";

/* ─────────────────────────────  Types  ───────────────────────────── */

export type RepairStatus =
  | "received"
  | "diagnosing"
  | "in-progress"
  | "awaiting-parts"
  | "ready"
  | "completed"
  | "cancelled";

export type RepairPriority = "low" | "normal" | "high" | "urgent";

export interface RepairEvent {
  at: string; // ISO
  label: string;
}

export interface RepairTicket {
  id: string; // REP-2026-XXXXX
  createdAt: string; // ISO
  updatedAt: string; // ISO
  // Customer
  customerName: string;
  phone: string; // WhatsApp
  email?: string;
  // Product
  productName: string;
  category: string; // display label e.g. "Strings"
  brand?: string;
  serial?: string;
  refInvoice?: string; // original purchase bill / invoice
  // Problem
  problem: string;
  accessories?: string; // what was handed in
  // Service
  status: RepairStatus;
  priority: RepairPriority;
  branch: Branch;
  technician?: string;
  deadline: string; // ISO — promised-by date
  // Money (pre-GST service charge)
  estimate: number;
  finalCost: number;
  advance: number;
  gstRate: number; // %
  // Audit
  events: RepairEvent[];
  whatsappSentAt?: string;
  completedAt?: string;
  invoiceNo?: string;
}

/* ─────────────────────────────  Meta  ───────────────────────────── */

export const REPAIR_STATUS: { key: RepairStatus; label: string; tone: string }[] = [
  { key: "received", label: "Received", tone: "bg-ink-100 text-ink-600" },
  { key: "diagnosing", label: "Diagnosing", tone: "bg-info/15 text-info" },
  { key: "in-progress", label: "In Progress", tone: "bg-gold-100 text-gold-700" },
  { key: "awaiting-parts", label: "Awaiting Parts", tone: "bg-warning/20 text-[#8a6a1f]" },
  { key: "ready", label: "Ready", tone: "bg-success/15 text-success" },
  { key: "completed", label: "Completed", tone: "bg-ink-900 text-ivory-50" },
  { key: "cancelled", label: "Cancelled", tone: "bg-danger/15 text-danger" },
];

export const PRIORITY_META: Record<RepairPriority, { label: string; tone: string }> = {
  low: { label: "Low", tone: "bg-ink-100 text-ink-500" },
  normal: { label: "Normal", tone: "bg-info/15 text-info" },
  high: { label: "High", tone: "bg-gold-100 text-gold-700" },
  urgent: { label: "Urgent", tone: "bg-danger/15 text-danger" },
};

export const REPAIR_CATEGORIES = [
  "Strings",
  "Keyboards",
  "Percussion",
  "Wind",
  "Indian Classical",
  "Accessories",
  "Other",
];

export const TECHNICIANS = ["Ravi Shankar", "Deepa Iyer", "Karthik M", "Suresh Babu", "Unassigned"];

export function statusMeta(key: RepairStatus) {
  return REPAIR_STATUS.find((s) => s.key === key) ?? REPAIR_STATUS[0];
}

export function statusLabel(key: RepairStatus) {
  return statusMeta(key).label;
}

/** Terminal statuses no longer count toward deadline alerts. */
export function isClosed(s: RepairStatus) {
  return s === "completed" || s === "cancelled";
}

export function isFixed(s: RepairStatus) {
  return s === "ready" || s === "completed";
}

/* ─────────────────────────  Derived helpers  ─────────────────────── */

export type AlertLevel = "overdue" | "due-soon" | "on-track" | "closed";

/** Whole-day difference between the deadline and `now` (negative = past). */
export function daysUntil(iso: string, now = new Date()): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / 86400000);
}

/** DUE_SOON_DAYS-day horizon flags a ticket as "due soon". */
export const DUE_SOON_DAYS = 2;

export function alertLevel(t: RepairTicket, now = new Date()): AlertLevel {
  if (isClosed(t.status)) return "closed";
  const d = daysUntil(t.deadline, now);
  if (d < 0) return "overdue";
  if (d <= DUE_SOON_DAYS) return "due-soon";
  return "on-track";
}

/** Balance still owed on a ticket (GST-inclusive; cancelled tickets owe nothing). */
export function balanceDue(t: RepairTicket): number {
  if (t.status === "cancelled") return 0;
  const gross = grossTotal(t);
  return Math.max(0, gross - (t.advance || 0));
}

/** Service charge the customer pays. Prices are **GST-inclusive**, so the entered
 *  finalCost/estimate already contains the tax — the gross is the charge itself. */
export function grossTotal(t: RepairTicket): number {
  return t.finalCost > 0 ? t.finalCost : t.estimate;
}

export function chargeBase(t: RepairTicket): number {
  return t.finalCost > 0 ? t.finalCost : t.estimate;
}

export function turnaroundDays(t: RepairTicket): number | null {
  if (!t.completedAt) return null;
  return Math.max(0, Math.round((+new Date(t.completedAt) - +new Date(t.createdAt)) / 86400000));
}

export function genRepairId(): string {
  return genDocId("REP");
}

/* ─────────────────────────────  Store  ───────────────────────────── */

const now = () => new Date().toISOString();

async function send(url: string, method: string, body: unknown, onError: () => void) {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error("save failed");
  } catch {
    alert("Couldn't save the repair change. Reverting to the saved values.");
    onError();
  }
}

interface RepairState {
  tickets: RepairTicket[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addTicket: (t: RepairTicket) => void;
  updateTicket: (id: string, patch: Partial<RepairTicket>, eventLabel?: string) => void;
  deleteTicket: (id: string) => void;
  logEvent: (id: string, label: string) => void;
  nextInvoiceNo: () => Promise<string>;
  resetDemo: () => void;
}

export const useRepair = create<RepairState>()((set, get) => ({
  tickets: [],
  hydrated: false,
  hydrate: async () => {
    try {
      const res = await fetch("/api/repair");
      if (!res.ok) return;
      set({ tickets: (await res.json()) as RepairTicket[], hydrated: true });
    } catch {
      /* keep empty */
    }
  },
  addTicket: (t) => {
    set((s) => ({ tickets: [t, ...s.tickets] }));
    void send("/api/repair", "POST", t, get().hydrate);
  },
  updateTicket: (id, patch, eventLabel) => {
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === id
          ? {
              ...t,
              ...patch,
              updatedAt: now(),
              events: eventLabel ? [...t.events, { at: now(), label: eventLabel }] : t.events,
            }
          : t,
      ),
    }));
    void send(`/api/repair/${id}`, "PATCH", { patch, eventLabel }, get().hydrate);
  },
  deleteTicket: (id) => {
    set((s) => ({ tickets: s.tickets.filter((t) => t.id !== id) }));
    void send(`/api/repair/${id}`, "DELETE", null, get().hydrate);
  },
  logEvent: (id, label) => {
    set((s) => ({
      tickets: s.tickets.map((t) =>
        t.id === id ? { ...t, updatedAt: now(), events: [...t.events, { at: now(), label }] } : t,
      ),
    }));
    void send(`/api/repair/${id}`, "PATCH", { patch: {}, eventLabel: label }, get().hydrate);
  },
  // Ask the server for the next service-invoice number — it checks the DB for
  // a free `SER-<year>-XXXXX` code, which an in-memory scan of loaded tickets
  // can't guarantee (and can't see tickets other staff/tabs have created).
  nextInvoiceNo: async () => {
    const res = await fetch("/api/repair/next-invoice", { method: "POST" });
    if (!res.ok) throw new Error("Couldn't generate a service invoice number");
    const { invoiceNo } = (await res.json()) as { invoiceNo: string };
    return invoiceNo;
  },
  resetDemo: () => void get().hydrate(),
}));

if (typeof window !== "undefined") {
  void useRepair.getState().hydrate();
}
