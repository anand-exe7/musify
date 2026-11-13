"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/shop/ProductCard";
import { useBestSellers } from "@/lib/client/catalog";
import { BESTSELLER_SLOTS } from "@/lib/catalog/bestsellers";

/**
 * The bestseller row, directly under the hero. The shop picks these in Admin → Inventory, up to
 * {@link BESTSELLER_SLOTS}; the section simply disappears when none is picked, so the home page
 * never shows an empty shelf.
 */
export function BestSellers() {
  const { products, loading } = useBestSellers();
  const items = products.slice(0, BESTSELLER_SLOTS);

  // Nothing picked (and nothing still loading) → the home page goes straight to the categories.
  if (!loading && items.length === 0) return null;

  return (
    <section className="border-b border-ink-100 py-14 md:py-20">
      <div className="container-page">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Bestsellers</p>
            <h2 className="heading-serif mt-3 text-display-md text-ink-900">
              What people <em>keep coming back for.</em>
            </h2>
          </div>
          <Link href="/shop" className="btn-ghost shrink-0">
            Browse everything
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading && items.length === 0 ? (
          <div className="product-grid">
            {Array.from({ length: BESTSELLER_SLOTS }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-ink-100">
                <div className="aspect-square animate-pulse bg-ink-100/70" />
                <div className="space-y-2 p-4">
                  <div className="h-2.5 w-1/3 animate-pulse rounded bg-ink-100" />
                  <div className="h-3.5 w-3/4 animate-pulse rounded bg-ink-100" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-ink-100" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="product-grid">
            {items.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.07 }}
              >
                <ProductCard product={p} index={i} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
