"use client";
/**
 * The one place a message to the user is raised: every save, delete and failure anywhere in the app
 * calls `toastOk` / `toastError` and a toast slides up from the bottom. Plain functions, not a hook,
 * so a Zustand store or a fetch helper can raise one without being a component (see
 * `makeSender` in `lib/client/api`).
 */
import { create } from "zustand";

export interface ToastItem {
  id: number;
  message: string;
  tone: "ok" | "bad";
}

interface ToastState {
  items: ToastItem[];
  push: (message: string, tone: ToastItem["tone"]) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let seq = 0;
/** At most this many on screen — the oldest drops off rather than covering the page. */
const MAX = 3;

export const useToasts = create<ToastState>((set) => ({
  items: [],
  push: (message, tone) => {
    const id = ++seq;
    set((s) => {
      // The same message twice in a row (a double click, a retry) refreshes the one on screen.
      const items = s.items.filter((t) => t.message !== message);
      return { items: [...items, { id, message, tone }].slice(-MAX) };
    });
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
  clear: () => set({ items: [] }),
}));

/** Something worked — "Quotation saved". Keep it to a few words, in the user's language. */
export function toastOk(message: string): void {
  useToasts.getState().push(message, "ok");
}

/** Something failed — the server's own message, never a bare "Error". */
export function toastError(message: string): void {
  useToasts.getState().push(message, "bad");
}

/** `toastError` for a caught exception, with a fallback when it carries no message. */
export function toastFail(e: unknown, fallback: string): void {
  toastError(e instanceof Error && e.message ? e.message : fallback);
}
