"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShoppingBag, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { ProductImage } from "@/components/ui/ProductImage";
import type { Product } from "@/types";
import { formatINR, cn } from "@/lib/utils";
import { useCart } from "@/lib/store/cart";
import { defaultVariant, variantKey as keyOf } from "@/lib/catalog/variants";
import { useState } from "react";

interface Props {
  product: Product;
  index?: number;
}

/**
 * One instrument in a grid. The photo sits on a white plate at a fixed ratio (studio shots come in every
 * shape, and cropping them to fill looked wrong), the price is the loudest thing after the name, and the
 * add button is a real button — not a square the thumb has to hunt for.
 */
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
  const soldOut = (p.stock ?? 0) <= 0;
  const off = p.mrp > displayPrice ? Math.round(((p.mrp - displayPrice) / p.mrp) * 100) : 0;

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
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: (index % 4) * 0.05 }}
      className="h-full"
    >
      <Link
        href={`/product/${p.slug}`}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50 transition-all duration-300 hover:-translate-y-1 hover:border-gold-400 hover:shadow-card"
      >
        {/* Photo plate */}
        <div className="relative aspect-square w-full overflow-hidden rounded-t-2xl bg-white">
          <ProductImage
            product={p}
            fit="contain"
            className="relative h-full w-full overflow-hidden bg-white p-4 sm:p-6"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
            imageClassName="transition-transform duration-500 group-hover:scale-[1.06]"
          />

          <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {p.bestSeller && (
              <span className="rounded-full bg-ink-900 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-gold-400">
                Bestseller
              </span>
            )}
            {p.new && (
              <span className="rounded-full border border-gold-400 bg-ivory-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-gold-700">
                New
              </span>
            )}
            {off > 0 && (
              <span className="rounded-full bg-success px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white">
                {off}% off
              </span>
            )}
          </div>

          {soldOut && (
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-ink-900/85 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-ivory-50">
              Sold out
            </span>
          )}
        </div>

        {/* Detail */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="min-h-[3.5rem]">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-600">
              {p.brand || p.category}
            </p>
            <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-ink-900">{p.name}</p>
          </div>

          <div className="mt-auto flex items-end justify-between gap-2">
            <div className="min-w-0">
              {selectable.length > 1 && (
                <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-400">From</span>
              )}
              <p className="tabular text-lg font-bold leading-none text-ink-900 md:text-xl">
                {formatINR(displayPrice)}
              </p>
              {off > 0 && (
                <p className="tabular mt-1 text-[11px] text-ink-400 line-through">{formatINR(p.mrp)}</p>
              )}
            </div>
            <button
              onClick={handleAdd}
              disabled={soldOut}
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-full border transition-all",
                added
                  ? "border-success bg-success text-white"
                  : "border-ink-200 text-ink-700 hover:border-ink-900 hover:bg-ink-900 hover:text-gold-400",
                soldOut && "cursor-not-allowed opacity-40 hover:border-ink-200 hover:bg-transparent hover:text-ink-700",
              )}
              aria-label={singleVariant ? `Add ${p.name} to cart` : `Choose an option for ${p.name}`}
            >
              {added ? <Check className="h-4 w-4" strokeWidth={3} /> : <ShoppingBag className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
