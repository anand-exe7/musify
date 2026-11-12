"use client";
/**
 * Reviews a visitor writes on the home page. They are kept in this browser only — `localStorage`, never
 * the database — so nothing a stranger types is published to anybody else. Every accessor is wrapped in
 * try/catch: in a private window, or with site data blocked, reading it throws.
 */
import { useCallback, useSyncExternalStore } from "react";

const KEY = "ssm.reviews.v1";
const MAX = 20;

export interface LocalReview {
  id: string;
  name: string;
  role: string;
  rating: number;
  quote: string;
  at: string;
}

const EMPTY: LocalReview[] = [];
const listeners = new Set<() => void>();

// The snapshot has to be referentially stable between renders, so the parsed list is cached and only
// re-parsed when the stored text actually changed.
let cachedRaw: string | null = null;
let cached: LocalReview[] = EMPTY;

function parse(raw: string | null): LocalReview[] {
  if (!raw) return EMPTY;
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return EMPTY;
    return list.filter((r): r is LocalReview => !!r && typeof (r as LocalReview).quote === "string");
  } catch {
    return EMPTY;
  }
}

function snapshot(): LocalReview[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", l);
  };
}

function save(list: LocalReview[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* private window or no space — the review simply isn't remembered */
  }
  listeners.forEach((l) => l());
}

/** The reviews stored in this browser, newest first, with `add` and `remove`. Empty on the server. */
export function useLocalReviews() {
  const reviews = useSyncExternalStore(subscribe, snapshot, () => EMPTY);

  const add = useCallback((r: Omit<LocalReview, "id" | "at">) => {
    save([{ ...r, id: crypto.randomUUID(), at: new Date().toISOString() }, ...snapshot()]);
  }, []);

  const remove = useCallback((id: string) => {
    save(snapshot().filter((r) => r.id !== id));
  }, []);

  return { reviews, add, remove };
}
