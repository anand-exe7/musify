"use client";
import { create } from "zustand";
import { fetchJson } from "@/lib/client/api";
import type { OrderAlert } from "@/lib/db/queries/orders";

const POLL_MS = 30_000;
const MUTE_KEY = "ssm_order_chime_muted";

interface OrderAlertState {
  /** Online orders still waiting to be shipped. */
  count: number;
  latest: OrderAlert[];
  loaded: boolean;
  /** Bumped whenever the set of waiting orders changes, so a screen showing orders knows to re-read them. */
  version: number;
  /** Orders that arrived since the admin opened the page — shown as toasts until dismissed. */
  toasts: OrderAlert[];
  muted: boolean;
  refresh: () => Promise<void>;
  dismiss: (id: string) => void;
  setMuted: (m: boolean) => void;
}

const readMuted = () => {
  try { return typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
};

/** A soft two-note chime. Browsers may refuse sound before the person has touched the page — that's fine, it is silent then. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const note = (freq: number, at: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.45);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.5);
    };
    note(880, 0);
    note(1175, 0.18);
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* no sound — the toast and badge still show */
  }
}

let known: Set<string> | null = null; // ids seen on the previous poll (null until the first one)

export const useOrderAlerts = create<OrderAlertState>()((set, get) => ({
  count: 0,
  latest: [],
  loaded: false,
  version: 0,
  toasts: [],
  muted: readMuted(),

  refresh: async () => {
    try {
      const data = await fetchJson<{ count: number; latest: OrderAlert[] }>("/api/orders/alerts");
      const ids = new Set(data.latest.map((o) => o.id));
      const first = known === null;
      const arrived = first ? [] : data.latest.filter((o) => !known!.has(o.id));
      const changed = first || arrived.length > 0 || data.count !== get().count || [...(known ?? [])].some((id) => !ids.has(id));
      known = ids;
      set((s) => ({
        count: data.count,
        latest: data.latest,
        loaded: true,
        version: changed && !first ? s.version + 1 : s.version,
        toasts: arrived.length ? [...arrived, ...s.toasts].slice(0, 4) : s.toasts,
      }));
      if (arrived.length && !get().muted) chime();
    } catch {
      /* offline or signed out: keep what we have, try again next time */
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setMuted: (m) => {
    try { window.localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* ignore */ }
    set({ muted: m });
  },
}));

/** Start checking for new online orders (every 30 s while the tab is showing). Returns a function that stops it. */
export function startOrderAlerts(): () => void {
  const tick = () => { if (document.visibilityState === "visible") void useOrderAlerts.getState().refresh(); };
  void useOrderAlerts.getState().refresh();
  const timer = window.setInterval(tick, POLL_MS);
  document.addEventListener("visibilitychange", tick);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", tick);
  };
}
