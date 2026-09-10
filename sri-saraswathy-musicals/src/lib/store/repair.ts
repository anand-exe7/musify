"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Branch } from "@/lib/store/pos";

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
  id: string; // RPR-2026-XXXX
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

/** Service charge inclusive of GST. */
export function grossTotal(t: RepairTicket): number {
  const base = t.finalCost > 0 ? t.finalCost : t.estimate;
  return Math.round(base * (1 + (t.gstRate || 0) / 100));
}

export function chargeBase(t: RepairTicket): number {
  return t.finalCost > 0 ? t.finalCost : t.estimate;
}

export function turnaroundDays(t: RepairTicket): number | null {
  if (!t.completedAt) return null;
  return Math.max(0, Math.round((+new Date(t.completedAt) - +new Date(t.createdAt)) / 86400000));
}

export function genRepairId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `RPR-2026-${s}`;
}

/* ─────────────────────────────  Seeds  ───────────────────────────── */

function iso(d: string) {
  return new Date(d).toISOString();
}

// Seeded relative to the app's "today" (2026-09-11) so the deadline alerts,
// dashboard and report all have realistic, live-looking data.
function seedTickets(): RepairTicket[] {
  return [
    {
      id: "RPR-2026-K7QM9", createdAt: iso("2026-09-02T10:15:00"), updatedAt: iso("2026-09-08T16:00:00"),
      customerName: "Bala Music Academy", phone: "9784562309", email: "office@balamusic.in",
      productName: "Saraswathi Veena", category: "Indian Classical", brand: "Kanailal", serial: "VN-2291",
      refInvoice: "INV-2026-QNXVYKMC",
      problem: "Two frets loose, buzzing on lower octave. Needs re-waxing and bridge levelling.",
      accessories: "Soft case, tuning key",
      status: "in-progress", priority: "high", branch: "Branch 1", technician: "Ravi Shankar",
      deadline: iso("2026-09-09T18:00:00"), // OVERDUE
      estimate: 3500, finalCost: 0, advance: 1000, gstRate: 18,
      events: [
        { at: iso("2026-09-02T10:15:00"), label: "Ticket raised · received at Branch 1" },
        { at: iso("2026-09-03T11:00:00"), label: "Status → Diagnosing" },
        { at: iso("2026-09-05T15:30:00"), label: "Status → In Progress · assigned to Ravi Shankar" },
      ],
      whatsappSentAt: iso("2026-09-02T10:20:00"),
    },
    {
      id: "RPR-2026-M3XT2", createdAt: iso("2026-09-06T12:40:00"), updatedAt: iso("2026-09-09T09:10:00"),
      customerName: "Vignesh Kumar", phone: "7894561238",
      productName: "Yamaha P-125 Digital Piano", category: "Keyboards", brand: "Yamaha", serial: "YP-88431",
      problem: "Middle C key sticking, no sound from left speaker.",
      accessories: "Sustain pedal, power adapter",
      status: "awaiting-parts", priority: "normal", branch: "Branch 2", technician: "Karthik M",
      deadline: iso("2026-09-12T18:00:00"), // due-soon (tomorrow)
      estimate: 4200, finalCost: 0, advance: 0, gstRate: 18,
      events: [
        { at: iso("2026-09-06T12:40:00"), label: "Ticket raised · received at Branch 2" },
        { at: iso("2026-09-07T10:00:00"), label: "Status → Diagnosing" },
        { at: iso("2026-09-09T09:10:00"), label: "Status → Awaiting Parts · speaker unit ordered" },
      ],
    },
    {
      id: "RPR-2026-P9WL4", createdAt: iso("2026-09-08T14:05:00"), updatedAt: iso("2026-09-10T14:05:00"),
      customerName: "Meera Nair", phone: "7904199050",
      productName: "Cremona Violin 4/4", category: "Strings", brand: "Cremona", serial: "CV-4471",
      problem: "Sound-post collapsed, one fine tuner stripped. Full re-string requested.",
      accessories: "Bow, rosin, hard case",
      status: "diagnosing", priority: "urgent", branch: "Branch 1", technician: "Deepa Iyer",
      deadline: iso("2026-09-13T18:00:00"), // due-soon
      estimate: 2800, finalCost: 0, advance: 500, gstRate: 18,
      events: [
        { at: iso("2026-09-08T14:05:00"), label: "Ticket raised · received at Branch 1" },
        { at: iso("2026-09-10T14:05:00"), label: "Status → Diagnosing · assigned to Deepa Iyer" },
      ],
      whatsappSentAt: iso("2026-09-08T14:12:00"),
    },
    {
      id: "RPR-2026-T5RB8", createdAt: iso("2026-09-10T11:20:00"), updatedAt: iso("2026-09-10T11:20:00"),
      customerName: "Chennai Music College", phone: "9840012345", email: "hod@cmc.edu.in",
      productName: "Concert Tabla Set", category: "Percussion", brand: "Bina",
      problem: "Dayan skin torn, needs re-heading and syahi touch-up on both drums.",
      accessories: "Cushion ring set",
      status: "received", priority: "normal", branch: "Branch 2", technician: "Unassigned",
      deadline: iso("2026-09-20T18:00:00"), // on-track
      estimate: 5500, finalCost: 0, advance: 0, gstRate: 18,
      events: [{ at: iso("2026-09-10T11:20:00"), label: "Ticket raised · received at Branch 2" }],
    },
    {
      id: "RPR-2026-C2HN6", createdAt: iso("2026-09-09T16:30:00"), updatedAt: iso("2026-09-11T09:00:00"),
      customerName: "Rajiv Menon", phone: "7904199050",
      productName: "Selmer Tenor Saxophone", category: "Wind", brand: "Selmer", serial: "SX-7781",
      problem: "Sticky G# pad, bent key guard. Full pad seal check.",
      status: "ready", priority: "high", branch: "Branch 1", technician: "Ravi Shankar",
      deadline: iso("2026-09-14T18:00:00"),
      estimate: 6500, finalCost: 6800, advance: 2000, gstRate: 18,
      events: [
        { at: iso("2026-09-04T16:30:00"), label: "Ticket raised · received at Branch 1" },
        { at: iso("2026-09-06T10:00:00"), label: "Status → In Progress" },
        { at: iso("2026-09-11T09:00:00"), label: "Status → Ready · final cost ₹6,800 · ready for pickup" },
      ],
      whatsappSentAt: iso("2026-09-11T09:05:00"),
    },
    {
      id: "RPR-2026-A8FD1", createdAt: iso("2026-08-20T10:00:00"), updatedAt: iso("2026-08-28T17:00:00"),
      customerName: "Priya Ramesh", phone: "9784562309",
      productName: "Female Tanpura (4-string)", category: "Indian Classical", brand: "Miraj", serial: "TP-3312",
      problem: "Jawari worn out, gourd hairline crack sealed.",
      status: "completed", priority: "normal", branch: "Branch 1", technician: "Deepa Iyer",
      deadline: iso("2026-08-27T18:00:00"),
      estimate: 4000, finalCost: 4500, advance: 5310, gstRate: 18,
      completedAt: iso("2026-08-28T17:00:00"), invoiceNo: "SVC/26-27/0007",
      events: [
        { at: iso("2026-08-20T10:00:00"), label: "Ticket raised · received at Branch 1" },
        { at: iso("2026-08-23T12:00:00"), label: "Status → In Progress" },
        { at: iso("2026-08-27T15:00:00"), label: "Status → Ready" },
        { at: iso("2026-08-28T17:00:00"), label: "Status → Completed · invoice SVC/26-27/0007 · paid in full" },
      ],
      whatsappSentAt: iso("2026-08-28T17:05:00"),
    },
    {
      id: "RPR-2026-B4KP3", createdAt: iso("2026-08-12T13:10:00"), updatedAt: iso("2026-08-19T16:00:00"),
      customerName: "Sruthi Layers", phone: "9840012345",
      productName: "Roland RD-2000 Stage Piano", category: "Keyboards", brand: "Roland", serial: "RD-9921",
      problem: "Pitch-bend lever unresponsive, firmware reflash requested.",
      status: "completed", priority: "high", branch: "Branch 2", technician: "Karthik M",
      deadline: iso("2026-08-18T18:00:00"),
      estimate: 3200, finalCost: 3200, advance: 3776, gstRate: 18,
      completedAt: iso("2026-08-19T16:00:00"), invoiceNo: "SVC/26-27/0006",
      events: [
        { at: iso("2026-08-12T13:10:00"), label: "Ticket raised · received at Branch 2" },
        { at: iso("2026-08-15T11:00:00"), label: "Status → In Progress" },
        { at: iso("2026-08-19T16:00:00"), label: "Status → Completed · invoice SVC/26-27/0006" },
      ],
    },
    {
      id: "RPR-2026-D6JQ7", createdAt: iso("2026-09-01T09:45:00"), updatedAt: iso("2026-09-07T18:00:00"),
      customerName: "Anand Rao", phone: "7894561238",
      productName: "Kanailal Sitar", category: "Indian Classical", brand: "Kanailal", serial: "ST-1180",
      problem: "Main bridge (jawari) buzzing, two tarab pegs slipping.",
      status: "completed", priority: "normal", branch: "Branch 2", technician: "Suresh Babu",
      deadline: iso("2026-09-07T18:00:00"),
      estimate: 5000, finalCost: 5200, advance: 6136, gstRate: 18,
      completedAt: iso("2026-09-07T18:00:00"), invoiceNo: "SVC/26-27/0008",
      events: [
        { at: iso("2026-09-01T09:45:00"), label: "Ticket raised · received at Branch 2" },
        { at: iso("2026-09-04T14:00:00"), label: "Status → In Progress" },
        { at: iso("2026-09-07T18:00:00"), label: "Status → Completed · invoice SVC/26-27/0008" },
      ],
    },
    {
      id: "RPR-2026-E1MZ5", createdAt: iso("2026-09-05T15:00:00"), updatedAt: iso("2026-09-06T10:00:00"),
      customerName: "Lakshmi Venkat", phone: "9884012345",
      productName: "Fender Stratocaster", category: "Strings", brand: "Fender", serial: "FS-6620",
      problem: "Output jack crackling — customer withdrew, will service elsewhere.",
      status: "cancelled", priority: "low", branch: "Branch 1", technician: "Unassigned",
      deadline: iso("2026-09-15T18:00:00"),
      estimate: 1800, finalCost: 0, advance: 0, gstRate: 18,
      events: [
        { at: iso("2026-09-05T15:00:00"), label: "Ticket raised · received at Branch 1" },
        { at: iso("2026-09-06T10:00:00"), label: "Status → Cancelled · customer withdrew" },
      ],
    },
  ];
}

/* ─────────────────────────────  Store  ───────────────────────────── */

interface RepairState {
  tickets: RepairTicket[];
  invoiceSeq: number; // next service-invoice serial
  addTicket: (t: RepairTicket) => void;
  updateTicket: (id: string, patch: Partial<RepairTicket>, eventLabel?: string) => void;
  deleteTicket: (id: string) => void;
  logEvent: (id: string, label: string) => void;
  nextInvoiceNo: () => string;
  resetDemo: () => void;
}

export const useRepair = create<RepairState>()(
  persist(
    (set, get) => ({
      tickets: seedTickets(),
      invoiceSeq: 9,
      addTicket: (t) => set((s) => ({ tickets: [t, ...s.tickets] })),
      updateTicket: (id, patch, eventLabel) =>
        set((s) => ({
          tickets: s.tickets.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...patch,
                  updatedAt: new Date().toISOString(),
                  events: eventLabel
                    ? [...t.events, { at: new Date().toISOString(), label: eventLabel }]
                    : t.events,
                }
              : t,
          ),
        })),
      deleteTicket: (id) => set((s) => ({ tickets: s.tickets.filter((t) => t.id !== id) })),
      logEvent: (id, label) =>
        set((s) => ({
          tickets: s.tickets.map((t) =>
            t.id === id
              ? { ...t, updatedAt: new Date().toISOString(), events: [...t.events, { at: new Date().toISOString(), label }] }
              : t,
          ),
        })),
      nextInvoiceNo: () => {
        const seq = get().invoiceSeq;
        set({ invoiceSeq: seq + 1 });
        return `SVC/26-27/${String(seq).padStart(4, "0")}`;
      },
      resetDemo: () => set({ tickets: seedTickets(), invoiceSeq: 9 }),
    }),
    { name: "ssm-repair-v1" },
  ),
);
