"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ProductImage } from "@/components/ui/ProductImage";
import { getFeaturedProducts } from "@/lib/data/products";
import { formatINR } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

export function Featured() {
  const items = getFeaturedProducts().slice(0, 4);

  return (
    <section id="featured" className="bg-ink-900 py-20 text-ivory-100 md:py-28">
      <div className="container-page">
        <div className="mb-14 text-center">
          <p className="eyebrow centered !text-gold-400">Featured pieces</p>
          <h2 className="heading-serif mx-auto mt-4 max-w-3xl text-display-lg">
            Each one <em>arrives</em> already tuned<br />to the room it will live in.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {items.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
            >
              <Link
                href={`/product/${p.slug}`}
                className="group relative flex h-full flex-col overflow-hidden border border-ivory-100/10 bg-ink-800 transition-all hover:border-gold-500/50 hover:bg-ink-700"
              >
                {(p.new || p.bestSeller) && (
                  <div className="absolute left-4 top-4 z-10 flex gap-2">
                    {p.bestSeller && (
                      <span className="bg-gold-500 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-ink-900">
                        Bestseller
                      </span>
                    )}
                    {p.new && (
                      <span className="border border-gold-400 bg-ink-900/60 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-gold-400">
                        New
                      </span>
                    )}
                  </div>
                )}
                <div className="relative h-64 overflow-hidden bg-ink-800">
                  <ProductImage
                    product={p}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    imageClassName="transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900/60 via-ink-900/10 to-transparent" />
                </div>
                <div className="flex flex-1 flex-col justify-between gap-4 border-t border-ivory-100/10 p-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-gold-400">{p.brand}</p>
                    <p className="heading-serif mt-1.5 text-lg text-ivory-100">{p.name}</p>
                    <p className="mt-1 text-xs text-ivory-100/50">{p.tagline}</p>
                  </div>
                  <div className="flex items-end justify-between gap-2 border-t border-ivory-100/10 pt-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-ivory-100/40">From</p>
                      <p className="tabular font-display text-xl text-ivory-100">{formatINR(p.price)}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gold-400 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="mt-14 flex justify-center">
          <Link href="/shop" className="btn-gold-solid">
            View all instruments
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
