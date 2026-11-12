"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useCategories } from "@/lib/client/catalog";
import { ArrowUpRight, ArrowRight } from "lucide-react";

/**
 * Shop by category — names and live counts, no photographs. The old tiles pulled a stock photo per
 * category, which rarely matched what is actually in that category; the count comes from the catalogue
 * itself, so it is right the moment a product is added.
 */
export function Categories() {
  const { categories, loading } = useCategories();
  const shown = categories.filter((c) => c.count > 0);
  const list = shown.length > 0 ? shown : categories;
  const total = categories.reduce((n, c) => n + c.count, 0);

  return (
    <section id="categories" className="py-16 md:py-24">
      <div className="container-page">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">The collection</p>
            <h2 className="heading-serif mt-3 text-display-md text-ink-900">Shop by category</h2>
          </div>
          <Link
            href="/shop"
            className="group flex items-center gap-2 rounded-full border border-ink-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-700 transition-colors hover:border-gold-400 hover:text-gold-700"
          >
            Browse all {total > 0 ? total : ""} instruments
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        {loading && categories.length === 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-100/70" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((cat, i) => (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: Math.min(i, 5) * 0.05 }}
              >
                <Link
                  href={`/shop?category=${cat.id}`}
                  className="group flex h-full items-center justify-between gap-4 rounded-2xl border border-ink-100 bg-ivory-50 p-5 transition-all hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-card"
                >
                  <span className="min-w-0">
                    <span className="block text-lg font-bold leading-tight text-ink-900 transition-colors group-hover:text-gold-700">
                      {cat.name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-ink-400">
                      {cat.tagline || `${cat.count} ${cat.count === 1 ? "piece" : "pieces"} in stock`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular rounded-full bg-ink-900/[0.05] px-2.5 py-1 text-xs font-semibold text-ink-600">
                      {cat.count}
                    </span>
                    <span className="grid h-8 w-8 place-items-center rounded-full border border-ink-200 text-ink-500 transition-all group-hover:border-gold-500 group-hover:bg-gold-500 group-hover:text-ink-900">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
