"use client";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useCategories } from "@/lib/client/catalog";
import { ArrowUpRight } from "lucide-react";

export function Categories() {
  const { categories } = useCategories();
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
                className="group relative block h-full overflow-hidden border border-ink-100 bg-ink-900 transition-all hover:border-gold-400 hover:shadow-card"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden">
                  <Image
                    src={cat.photo}
                    alt={cat.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gold-400/0 to-gold-400/0 opacity-0 transition-opacity duration-500 group-hover:from-gold-400/20 group-hover:opacity-100" />
                </div>
                <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
                  <p className="text-[9px] uppercase tracking-[0.24em] text-gold-400">{cat.tagline}</p>
                  <div className="mt-1 flex items-end justify-between">
                    <p className="heading-serif text-lg text-ivory-50 md:text-xl">{cat.name}</p>
                    <span className="tabular text-[10px] uppercase tracking-widest text-ivory-100/60">{cat.count}</span>
                  </div>
                  <span className="mt-3 block h-px w-8 bg-gold-400 transition-all duration-500 group-hover:w-full" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
