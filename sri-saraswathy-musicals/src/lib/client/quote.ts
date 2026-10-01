"use client";
import { useEffect, useRef, useState } from "react";
import type { PricedOrder, DeliveryMethod } from "@/lib/checkout/pricing";

export type Quote = PricedOrder;

export interface QuoteInput {
  items: { productId: string; variantKey: string; quantity: number }[];
  delivery: DeliveryMethod;
  shipState: string;
  branch?: "Branch 1" | "Branch 2";
  couponCode?: string | null;
}

/** Ask the server to price a cart. Throws with the server's message on failure. */
export async function fetchQuote(input: QuoteInput, signal?: AbortSignal): Promise<Quote> {
  const res = await fetch("/api/checkout/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, couponCode: input.couponCode || undefined }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Couldn't price your cart");
  return data as Quote;
}

/**
 * The server-priced total for a cart — the ONLY place the storefront gets
 * prices, tax, shipping and discounts from. Re-quotes (debounced) whenever the
 * inputs change and keeps showing the last good quote while the next one loads.
 */
export function useQuote(input: QuoteInput, enabled = true) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify(input);
  const latest = useRef(input);
  latest.current = input;

  useEffect(() => {
    if (!enabled || latest.current.items.length === 0) {
      setQuote(null);
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    const t = window.setTimeout(() => {
      fetchQuote(latest.current, ctl.signal)
        .then((q) => {
          setQuote(q);
          setError(null);
        })
        .catch((e: unknown) => {
          if (ctl.signal.aborted) return;
          setError(e instanceof Error ? e.message : "Couldn't price your cart");
        })
        .finally(() => {
          if (!ctl.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [key, enabled, retry]);

  return { quote, loading, error, refresh: () => setRetry((n) => n + 1) };
}
