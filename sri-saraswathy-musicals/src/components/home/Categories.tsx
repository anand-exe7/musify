"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { InstrumentSVG } from "@/components/ui/InstrumentSVG";
import { categories } from "@/lib/data/categories";
import { ArrowUpRight } from "lucide-react";

export function Categories() {
  return (
    <section id="categories" className="py-20 md:py-28">
      <div className="container-page">
        <div className="mb-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">The Collection</p>
            <h2 className="heading-serif mt-4 text-display-lg text-ink-900">
              Six families,<br />one <em>house.</em>
            </h2>
          </div>
          <Link href="/shop" className="group flex items-center gap-2 border-b border-gold-500 pb-1 text-xs font-semibold uppercase tracking-[0.22em] text-ink-700 transition-colors hover:text-gold-600">
            Browse the full library
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, delay: i * 0.06 }}
            >
              <Link
                href={`/shop?category=${cat.id}`}
                className="group relative block h-full overflow-hidden border border-ink-100 bg-ivory-50 p-4 transition-all hover:border-gold-400 hover:shadow-card md:p-6"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-gold-50/0 to-gold-50/40 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative flex h-24 items-center justify-center md:h-28">
                  <div className="h-full w-full max-w-[80px] transition-transform duration-500 group-hover:-translate-y-1 md:max-w-[100px]">
                    <InstrumentSVG instrument={cat.icon} />
                  </div>
                </div>
                <div className="relative mt-4 border-t border-ink-100 pt-3">
                  <p className="heading-serif text-base text-ink-900 md:text-lg">{cat.name}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-widest text-ink-400">
                    {cat.count} pieces
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
