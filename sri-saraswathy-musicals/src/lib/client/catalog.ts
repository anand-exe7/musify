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
const featuredRes = makeResource<Product[]>("/api/products?featured=true", "featured products");

export const fetchProducts = () => productsRes.load();
export const fetchCategories = () => categoriesRes.load();

/** Drop the cached catalogue so the next read (and every mounted hook) refetches.
 *  Call after anything that changes products, prices, stock or categories. */
export function invalidateCatalog() {
  productsRes.invalidate();
  categoriesRes.invalidate();
  featuredRes.invalidate();
  pageListeners.forEach((l) => l());
}

const pageListeners = new Set<() => void>();

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

/* ───────────────────────  One page of the shop at a time  ─────────────────────── */

export interface ShopQuery {
  category: string;
  origin: string;
  /** Highest price, in paise. */
  maxPrice: number;
  sort: string;
  page: number;
  pageSize: number;
}

export interface ShopPageData {
  items: Product[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
}

/**
 * The shop's products, one page per request — filters and sorting happen on the server, so a visitor
 * only downloads what they are looking at. The previous page stays on screen while the next loads,
 * a stale answer never overwrites a newer one, and an admin edit refetches the current page.
 */
export function useProductPage(q: ShopQuery, opts: { skip?: boolean } = {}): { data: ShopPageData | null; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<ShopPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(q);
  const skip = !!opts.skip;

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    pageListeners.add(l);
    return () => { pageListeners.delete(l); };
  }, []);

  useEffect(() => {
    if (skip) return; // e.g. waiting for something this query depends on
    const ctl = new AbortController();
    const query = JSON.parse(key) as ShopQuery;
    const sp = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize), sort: query.sort });
    if (query.category && query.category !== "all") sp.set("category", query.category);
    if (query.origin && query.origin !== "all") sp.set("origin", query.origin);
    if (query.maxPrice > 0) sp.set("maxPrice", String(query.maxPrice));
    setLoading(true);
    setError(null);
    fetch(`/api/products?${sp}`, { cache: "no-store", signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Couldn't load products (${r.status})`);
        return r.json() as Promise<ShopPageData>;
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Couldn't load products");
        setLoading(false);
      });
    return () => ctl.abort();
  }, [key, tick, skip]);

  return { data, loading: loading && !skip, error, refresh: () => setTick((t) => t + 1) };
}

/** The featured products (the home page's hero and "Featured pieces"), without downloading the whole catalogue. */
export function useFeatured(): { products: Product[]; loading: boolean; error: string | null; refresh: () => void } {
  const { data, loading, error, refresh } = useResource(featuredRes);
  return { products: data ?? [], loading, error, refresh };
}

/**
 * Just the products with these ids (a cart, a wishlist, an order's items). Hidden or deleted products
 * are simply missing from the map. Refetches when the ids change or an admin edit invalidates the catalogue.
 */
export function useProductsByIds(ids: string[]): { byId: Map<string, Product>; loading: boolean; error: string | null } {
  const key = [...new Set(ids.filter(Boolean))].sort().join(",");
  const [byId, setById] = useState<Map<string, Product>>(new Map());
  const [loading, setLoading] = useState(key !== "");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    pageListeners.add(l);
    return () => { pageListeners.delete(l); };
  }, []);

  useEffect(() => {
    if (key === "") { setById(new Map()); setLoading(false); return; }
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/products?ids=${encodeURIComponent(key)}`, { cache: "no-store", signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Couldn't load products (${r.status})`);
        return r.json() as Promise<Product[]>;
      })
      .then((list) => { setById(new Map(list.map((p) => [p.id, p]))); setLoading(false); })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Couldn't load products");
        setLoading(false);
      });
    return () => ctl.abort();
  }, [key, tick]);

  return { byId, loading, error };
}

/** One product by its slug, fetched on its own (not by downloading everything and searching it). */
export function useProductBySlug(slug: string): { product: Product | undefined; loading: boolean; notFound: boolean; error: string | null; refresh: () => void } {
  const [product, setProduct] = useState<Product | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    pageListeners.add(l);
    return () => { pageListeners.delete(l); };
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);
    fetch(`/api/products/slug/${encodeURIComponent(slug)}`, { cache: "no-store", signal: ctl.signal })
      .then(async (r) => {
        if (r.status === 404) { setProduct(undefined); setNotFound(true); return; }
        if (!r.ok) throw new Error(`Couldn't load this product (${r.status})`);
        setProduct((await r.json()) as Product);
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Couldn't load this product");
      })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [slug, tick]);

  return { product, loading, notFound, error, refresh: () => setTick((t) => t + 1) };
}

/** Search the storefront (name, brand, tagline, category) — the first few matches, from the server. */
export async function searchProducts(q: string, signal?: AbortSignal, limit = 6): Promise<Product[]> {
  const term = q.trim();
  if (!term) return [];
  const r = await fetch(`/api/products?${new URLSearchParams({ q: term, page: "1", pageSize: String(limit), sort: "featured" })}`, { cache: "no-store", signal });
  if (!r.ok) throw new Error(`Search failed (${r.status})`);
  return ((await r.json()) as ShopPageData).items;
}
