"use client";
/**
 * Client-side catalog access, backed by the `/api/products` and
 * `/api/categories` endpoints (which read from Neon). Results are cached at
 * module scope and in-flight requests are de-duped, so the catalog is fetched
 * once per minute no matter how many components ask for it.
 *
 * The cache can't go stale unnoticed:
 *  - it expires after {@link CACHE_TTL_MS} (re-checked when the tab regains focus),
 *  - {@link invalidateCatalog} drops it immediately and tells every mounted hook
 *    to refetch (admin mutations call this, so an edit shows up in the same tab),
 *  - while a refresh is loading, the previous data stays on screen.
 *
 * Failures are reported through `error` (with a `refresh`) — an empty array from
 * a failed fetch is never mistaken for an empty catalogue.
 *
 * Server Components should call `@/lib/db/queries/*` directly.
 */
import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/types";
import type { CategoryItem } from "@/lib/db/queries/categories";

export const CACHE_TTL_MS = 60_000;

interface Entry<T> {
  data: T | null;
  at: number;
  promise: Promise<T> | null;
}

function makeResource<T>(url: string, what: string) {
  const entry: Entry<T> = { data: null, at: 0, promise: null };
  const listeners = new Set<() => void>();

  const fresh = () => entry.data !== null && Date.now() - entry.at < CACHE_TTL_MS;

  function load(force = false): Promise<T> {
    if (!force && fresh()) return Promise.resolve(entry.data as T);
    if (!entry.promise) {
      entry.promise = fetch(url, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`Couldn't load ${what} (${r.status})`);
          return r.json() as Promise<T>;
        })
        .then((d) => {
          entry.data = d;
          entry.at = Date.now();
          return d;
        })
        .finally(() => {
          entry.promise = null; // success or failure, the next call may retry
        });
    }
    return entry.promise;
  }

  return {
    load,
    peek: () => entry.data,
    isFresh: fresh,
    invalidate() {
      entry.data = null;
      entry.at = 0;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const productsRes = makeResource<Product[]>("/api/products", "products");
const categoriesRes = makeResource<CategoryItem[]>("/api/categories", "categories");

export const fetchProducts = () => productsRes.load();
export const fetchCategories = () => categoriesRes.load();

/** Drop the cached catalogue so the next read (and every mounted hook) refetches.
 *  Call after anything that changes products, prices, stock or categories. */
export function invalidateCatalog() {
  productsRes.invalidate();
  categoriesRes.invalidate();
}

function useResource<T>(res: ReturnType<typeof makeResource<T>>) {
  const [data, setData] = useState<T | null>(res.peek());
  const [loading, setLoading] = useState<boolean>(!res.peek());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    (force = true) => {
      setError(null);
      if (!res.peek()) setLoading(true);
      return res
        .load(force)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the catalogue"))
        .finally(() => setLoading(false));
    },
    [res],
  );

  useEffect(() => {
    let alive = true;
    const run = (force: boolean) => {
      if (!alive) return;
      void refresh(force);
    };
    run(false); // uses the cache when it is still fresh
    const unsub = res.subscribe(() => run(true)); // an admin edit invalidated it
    const onVisible = () => {
      if (document.visibilityState === "visible" && !res.isFresh()) run(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [res, refresh]);

  return { data, loading, error, refresh: () => void refresh(true) };
}

/** All products. `loading` is true until the first fetch resolves; `error` is
 *  set (with a working `refresh`) when it could not be loaded. */
export function useProducts(): { products: Product[]; loading: boolean; error: string | null; refresh: () => void } {
  const { data, loading, error, refresh } = useResource(productsRes);
  return { products: data ?? [], loading, error, refresh };
}

/** Storefront categories. */
export function useCategories(): { categories: CategoryItem[]; loading: boolean; error: string | null; refresh: () => void } {
  const { data, loading, error, refresh } = useResource(categoriesRes);
  return { categories: data ?? [], loading, error, refresh };
}

/** A single product by slug, from the cached list. */
export function useProduct(slug: string): { product: Product | undefined; loading: boolean; error: string | null; refresh: () => void } {
  const { products, loading, error, refresh } = useProducts();
  return { product: products.find((p) => p.slug === slug), loading, error, refresh };
}
