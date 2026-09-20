/**
 * Small helpers for the (attr, finish) tuple that identifies a variant across
 * the cart, checkout and orders. `variantKey` is the machine id; `variantLabel`
 * is the human string ("Standard · Natural"). Keep both stable — cart lines and
 * saved orders are keyed by the key.
 */
import type { ProductVariant } from "@/types";

/** Storefront picks the first enabled variant. Falls back to the first if all
 *  are disabled (shouldn't happen — product with zero enabled variants is
 *  hidden by the `active` flag). */
export function defaultVariant(variants: ProductVariant[]): ProductVariant | undefined {
  return variants.find((v) => !v.disabled) ?? variants[0];
}

/** Machine identifier — matches on both attr and finish. */
export function variantKey(v: Pick<ProductVariant, "attr" | "finish">): string {
  return `${v.attr}|${v.finish}`;
}

/** Human label. Single-attr variants (empty finish) show just the attr. */
export function variantLabel(v: Pick<ProductVariant, "attr" | "finish">): string {
  if (!v.finish) return v.attr;
  if (!v.attr) return v.finish;
  return `${v.attr} · ${v.finish}`;
}

/** Find a variant on a product by its key, or undefined if it's gone. */
export function findVariant(
  variants: ProductVariant[],
  key: string,
): ProductVariant | undefined {
  return variants.find((v) => variantKey(v) === key);
}
