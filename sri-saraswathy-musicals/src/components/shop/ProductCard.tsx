"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { ProductImage } from "@/components/ui/ProductImage";
import type { Product } from "@/types";
import { formatINR } from "@/lib/utils";
import { useCart } from "@/lib/store/cart";
import { defaultVariant, variantKey as keyOf } from "@/lib/catalog/variants";
import { useState } from "react";

interface Props {
  product: Product;
  index?: number;
}

export function ProductCard({ product: p, index = 0 }: Props) {
  const router = useRouter();
  const addItem = useCart((s) => s.addItem);
  const [added, setAdded] = useState(false);
  // Quick-add is only unambiguous when there's a single option; otherwise we
  // send the shopper to the product page to pick a variant.
  const variants = p.variants ?? [];
  const selectable = variants.filter((v) => !v.disabled);
  const singleVariant = selectable.length === 1 ? selectable[0] : undefined;
  const displayPrice = defaultVariant(variants)?.price ?? p.price;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!singleVariant) {
      router.push(`/product/${p.slug}`);
      return;
    }
    addItem(p.id, keyOf(singleVariant), 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: (index % 4) * 0.05 }}
    >
      <Link
        href={`/product/${p.slug}`}
        className="group relative flex h-full flex-col overflow-hidden border border-ink-100 bg-ivory-50 transition-all hover:border-gold-400 hover:shadow-card"
      >
        {(p.new || p.bestSeller) && (
          <div className="absolute left-3 top-3 z-10 flex gap-2">
            {p.bestSeller && (
              <span className="bg-ink-900 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-gold-400">
                Bestseller
              </span>
            )}
            {p.new && (
              <span className="border border-gold-400 bg-ivory-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-gold-600">
                New
              </span>
            )}
          </div>
        )}

        <div className="relative h-48 overflow-hidden bg-white sm:h-56">
          <ProductImage
            product={p}
            fit="contain"
            className="relative h-full w-full overflow-hidden bg-white"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
            imageClassName="transition-transform duration-700 group-hover:scale-105"
          />
        </div>

        <div className="flex flex-1 flex-col justify-between gap-3 border-t border-ink-100 p-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-gold-600">{p.brand}</p>
            <p className="heading-serif mt-1 text-base leading-tight text-ink-900">{p.name}</p>
            {p.tagline && (
              <p className="mt-1 line-clamp-1 text-xs text-ink-400">{p.tagline}</p>
            )}
          </div>

          <div className="flex items-end justify-between gap-2 border-t border-ink-100 pt-3">
            <div>
              <p className="tabular font-display text-base text-ink-900 md:text-lg">
                {selectable.length > 1 && <span className="mr-1 text-[10px] uppercase tracking-widest text-ink-400">From</span>}
                {formatINR(displayPrice)}
              </p>
              {p.mrp > displayPrice && (
                <p className="tabular text-[10px] text-ink-400 line-through">{formatINR(p.mrp)}</p>
              )}
            </div>
            <button
              onClick={handleAdd}
              className={`grid h-9 w-9 place-items-center border transition-all ${
                added
                  ? "border-gold-500 bg-gold-500 text-ink-900"
                  : "border-ink-200 text-ink-700 hover:border-gold-500 hover:bg-ink-900 hover:text-gold-400"
              }`}
              aria-label="Add to cart"
            >
              {added ? "✓" : <ShoppingBag className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
