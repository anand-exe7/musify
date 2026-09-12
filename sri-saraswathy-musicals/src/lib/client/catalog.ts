"use client";
/**
 * Client-side catalog access, backed by the `/api/products` and
 * `/api/categories` endpoints (which read from Neon). Results are cached at
 * module scope and in-flight requests are de-duped, so the catalog is fetched
 * once per page load no matter how many components ask for it.
 *
 * These hooks replace the old synchronous imports from `@/lib/data/*` in client
 * components. Server Components should call `@/lib/db/queries/*` directly.
 */
import { useEffect, useState } from "react";
import type { Product } from "@/types";
import type { CategoryItem } from "@/lib/db/queries/categories";

let productsCache: Product[] | null = null;
let productsPromise: Promise<Product[]> | null = null;
let categoriesCache: CategoryItem[] | null = null;
let categoriesPromise: Promise<CategoryItem[]> | null = null;

export function fetchProducts(): Promise<Product[]> {
  if (productsCache) return Promise.resolve(productsCache);
  if (!productsPromise) {
    productsPromise = fetch("/api/products")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load products");
        return r.json();
      })
      .then((d: Product[]) => {
        productsCache = d;
        return d;
      })
      .catch((e) => {
        productsPromise = null; // allow a retry on next call
        throw e;
      });
  }
  return productsPromise;
}

export function fetchCategories(): Promise<CategoryItem[]> {
  if (categoriesCache) return Promise.resolve(categoriesCache);
  if (!categoriesPromise) {
    categoriesPromise = fetch("/api/categories")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load categories");
        return r.json();
      })
      .then((d: CategoryItem[]) => {
        categoriesCache = d;
        return d;
      })
      .catch((e) => {
        categoriesPromise = null;
        throw e;
      });
  }
  return categoriesPromise;
}

/** All products. `loading` is true until the first fetch resolves. */
export function useProducts(): { products: Product[]; loading: boolean } {
  const [products, setProducts] = useState<Product[]>(productsCache ?? []);
  const [loading, setLoading] = useState<boolean>(!productsCache);

  useEffect(() => {
    if (productsCache) return;
    let alive = true;
    fetchProducts()
      .then((d) => alive && (setProducts(d), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { products, loading };
}

/** Storefront categories. */
export function useCategories(): { categories: CategoryItem[]; loading: boolean } {
  const [categories, setCategories] = useState<CategoryItem[]>(categoriesCache ?? []);
  const [loading, setLoading] = useState<boolean>(!categoriesCache);

  useEffect(() => {
    if (categoriesCache) return;
    let alive = true;
    fetchCategories()
      .then((d) => alive && (setCategories(d), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return { categories, loading };
}

/** A single product by slug, from the cached list. */
export function useProduct(slug: string): { product: Product | undefined; loading: boolean } {
  const { products, loading } = useProducts();
  return { product: products.find((p) => p.slug === slug), loading };
}
