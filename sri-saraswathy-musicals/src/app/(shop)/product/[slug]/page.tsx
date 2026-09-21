"use client";
import { useState, use, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { notFound } from "next/navigation";
import { useProducts } from "@/lib/client/catalog";
import { ProductImage } from "@/components/ui/ProductImage";
import { ProductCard } from "@/components/shop/ProductCard";
import { useCart } from "@/lib/store/cart";
import { formatINR, cn } from "@/lib/utils";
import { variantKey as keyOf, variantLabel } from "@/lib/catalog/variants";
import { Minus, Plus, ChevronRight, Truck, Award, Store, ShoppingBag, Check, X, ArrowRight } from "lucide-react";

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { products, loading } = useProducts();
  const product = products.find((p) => p.slug === slug);

  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<"description" | "specs" | "shipping">("description");
  const [activePhoto, setActivePhoto] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(null);
  const addItem = useCart((s) => s.addItem);

  // Selectable variants (skip disabled). First enabled variant is the default;
  // the user's pick wins once they interact.
  const allVariants = useMemo(() => product?.variants ?? [], [product]);
  const selectableVariants = useMemo(
    () => allVariants.filter((v) => !v.disabled),
    [allVariants],
  );
  const activeVariant = useMemo(() => {
    if (!product) return undefined;
    if (selectedVariantKey) {
      const hit = selectableVariants.find((v) => keyOf(v) === selectedVariantKey);
      if (hit) return hit;
    }
    return selectableVariants[0] ?? allVariants[0];
  }, [product, allVariants, selectableVariants, selectedVariantKey]);
  const unitPrice = activeVariant?.price ?? product?.price ?? 0;
  const variantStock = activeVariant?.stock ?? 0;
  const hasMultipleVariants = selectableVariants.length > 1;
  const gallery = (product?.photos && product.photos.length > 0 ? product.photos : [product?.photo].filter(Boolean) as string[]).slice(0, 4);

  const related = product
    ? products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4)
    : [];
  const specRows = product ? product.specs.filter((s) => s.label !== "Warranty") : [];

  // Auto-advance the gallery. Re-scheduling on activePhoto means a manual
  // thumbnail click also resets the timer, so it never jumps immediately.
  useEffect(() => {
    if (gallery.length <= 1) return;
    const id = setTimeout(() => setActivePhoto((p) => (p + 1) % gallery.length), 4000);
    return () => clearTimeout(id);
  }, [activePhoto, gallery.length]);

  // Auto-dismiss the little toast.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(false), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  if (loading) {
    return <div className="container-page py-32 text-center text-ink-400">Loading…</div>;
  }
  if (!product) notFound();

  const handleAdd = () => {
    if (!activeVariant) return;
    addItem(product.id, keyOf(activeVariant), qty);
    setModalOpen(true);
    setToast(true);
  };

  return (
    <div className="container-page py-6 md:py-12">
      {/* Breadcrumbs */}
      <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-ink-400">
        <Link href="/" className="hover:text-gold-600">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/shop" className="hover:text-gold-600">Shop</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/shop?category=${product.category}`} className="hover:text-gold-600">{product.category}</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-ink-600">{product.name}</span>
      </nav>

      <div className="grid gap-10 md:grid-cols-2 md:gap-16">
        {/* Gallery */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <div className="relative aspect-square overflow-hidden bg-ink-100">
            <AnimatePresence initial={false}>
              <motion.div
                key={activePhoto}
                initial={{ opacity: 0, scale: 1.03 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="absolute inset-0"
              >
                <ProductImage
                  product={product}
                  photoIndex={activePhoto}
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </motion.div>
            </AnimatePresence>

            {/* Slide dots */}
            {gallery.length > 1 && (
              <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
                {gallery.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePhoto(i)}
                    aria-label={`Go to photo ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${activePhoto === i ? "w-6 bg-gold-400" : "w-1.5 bg-ivory-50/70 hover:bg-ivory-50"}`}
                  />
                ))}
              </div>
            )}
          </div>

          {gallery.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {gallery.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActivePhoto(i)}
                  className={`relative aspect-square overflow-hidden border transition-colors ${activePhoto === i ? "border-gold-500" : "border-ink-100 hover:border-gold-300"}`}
                  aria-label={`View photo ${i + 1}`}
                >
                  <ProductImage
                    product={product}
                    photoIndex={i}
                    sizes="120px"
                    imageClassName={activePhoto === i ? "" : "opacity-70"}
                  />
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Info */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="mb-3 flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-600">{product.brand}</p>
            {product.bestSeller && <span className="bg-ink-900 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gold-400">Bestseller</span>}
            {product.new && <span className="border border-gold-400 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gold-600">New</span>}
          </div>
          <h1 className="heading-serif text-display-md text-ink-900">{product.name}</h1>
          <p className="mt-3 font-serif italic text-lg text-ink-500">{product.tagline}</p>

          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-gold-500 tracking-widest">{"★".repeat(Math.round(product.rating))}{"☆".repeat(5 - Math.round(product.rating))}</span>
            <span className="text-ink-500">{product.rating.toFixed(1)}</span>
            <span className="text-ink-300">·</span>
            <span className="text-ink-500">{product.reviews} reviews</span>
          </div>

          {/* Price */}
          <div className="mt-6 flex items-end gap-3 border-y border-ink-100 py-6">
            <span className="tabular font-display text-4xl text-ink-900 md:text-5xl">{formatINR(unitPrice)}</span>
            {product.mrp > unitPrice && (
              <>
                <span className="tabular pb-1 text-lg text-ink-400 line-through">{formatINR(product.mrp)}</span>
                <span className="tabular pb-1 text-sm font-semibold text-success">
                  {Math.round(((product.mrp - unitPrice) / product.mrp) * 100)}% off
                </span>
              </>
            )}
          </div>
          <p className="mt-2 text-xs uppercase tracking-widest text-ink-500">
            Incl. {product.gstRate}% GST
          </p>

          {/* Variant picker — only when the product has more than one option. */}
          {hasMultipleVariants && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
                Option{activeVariant ? ` · ${variantLabel(activeVariant)}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {selectableVariants.map((v) => {
                  const k = keyOf(v);
                  const isActive = activeVariant && keyOf(activeVariant) === k;
                  const soldOut = (v.stock ?? 0) <= 0;
                  return (
                    <button
                      key={k}
                      onClick={() => {
                        setSelectedVariantKey(k);
                        setQty(1);
                      }}
                      disabled={soldOut}
                      className={cn(
                        "border px-3 py-2 text-xs transition-all",
                        isActive
                          ? "border-gold-500 bg-gold-50/50 text-ink-900"
                          : "border-ink-200 text-ink-700 hover:border-gold-400",
                        soldOut && "line-through opacity-50",
                      )}
                    >
                      <span className="font-medium">{variantLabel(v)}</span>
                      {v.price !== product.price && (
                        <span className="tabular ml-2 text-ink-500">{formatINR(v.price)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stock — of the selected variant. */}
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className={`inline-block h-2 w-2 rounded-full ${variantStock > 3 ? "bg-success" : variantStock > 0 ? "bg-warning" : "bg-danger"}`} />
            {variantStock > 3 ? (
              <span className="text-ink-700">In stock · Ships in 2-3 days</span>
            ) : variantStock > 0 ? (
              <span className="text-warning">Only {variantStock} left</span>
            ) : (
              <span className="text-danger">Currently unavailable</span>
            )}
          </div>

          {/* Quantity + Add to cart — matched 48px-tall boxes */}
          <div className="mt-6 flex items-stretch gap-3">
            <div className="flex h-12 shrink-0 items-center border border-ink-200">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-full w-12 place-items-center transition-colors hover:bg-ink-50" aria-label="Decrease">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="tabular w-10 text-center font-medium">{qty}</span>
              <button onClick={() => setQty(Math.min(variantStock, qty + 1))} className="grid h-full w-12 place-items-center transition-colors hover:bg-ink-50" aria-label="Increase">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <button onClick={handleAdd} disabled={variantStock === 0} className="btn-gold-solid h-12 flex-1 py-0 disabled:cursor-not-allowed disabled:opacity-50">
              <ShoppingBag className="h-4 w-4" />
              Add to cart
            </button>
          </div>

          {/* Trust icons */}
          <div className="mt-8 grid grid-cols-1 gap-3 border-t border-ink-100 pt-6 text-xs sm:grid-cols-3">
            {[
              { Icon: Truck, label: "White-glove delivery" },
              { Icon: Award, label: "Atelier set-up & tuning" },
              { Icon: Store, label: "Try it at our stores" },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 text-center md:flex-row md:text-left">
                <Icon className="h-4 w-4 shrink-0 text-gold-600" />
                <span className="text-ink-600">{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Details — description / specs / shipping */}
      <div className="mt-16 border-t border-ink-100 pt-10">
        <div className="mb-0 -mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
          {(["description", "specs", "shipping"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative shrink-0 whitespace-nowrap rounded-t-lg px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors sm:px-5 sm:text-xs sm:tracking-[0.2em] ${tab === t ? "bg-ink-900 text-gold-300" : "text-ink-400 hover:bg-ivory-100 hover:text-ink-700"}`}
            >
              {t === "description" ? "Description" : t === "specs" ? "Specifications" : "Shipping"}
            </button>
          ))}
        </div>

        <div className="rounded-lg rounded-tl-none border border-ink-100 bg-ivory-50 p-6 md:p-10">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
              {tab === "description" && (
                <div className="space-y-6">
                  <p className="max-w-3xl text-base leading-relaxed text-ink-700 md:text-lg">{product.description}</p>
                  <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {product.features.map((f) => (
                      <li key={f} className="flex items-start gap-3 text-sm text-ink-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {tab === "specs" && (
                <div className="grid gap-x-10 gap-y-0 md:grid-cols-2">
                  {specRows.map((s) => (
                    <div key={s.label} className="flex items-baseline justify-between gap-4 border-b border-ink-100 py-3.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-500">{s.label}</span>
                      <span className="text-right text-sm text-ink-900">{s.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {tab === "shipping" && (
                <div className="grid max-w-3xl gap-4 text-sm leading-relaxed text-ink-700 sm:grid-cols-2">
                  <p><strong className="text-ink-900">White-glove delivery</strong> — free across India for orders above ₹5,000. International rates on request.</p>
                  <p><strong className="text-ink-900">Set-up included</strong> — every instrument leaves the atelier tuned and ready to play.</p>
                  <p><strong className="text-ink-900">Insured in transit</strong> — each piece is packed and couriered fully insured to your door.</p>
                  <p><strong className="text-ink-900">Support</strong> — visit us at our Vadapalani or Porur branch for a hands-on fitting any time.</p>
                </div>
              )}
          </motion.div>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div className="mt-20">
          <div className="mb-8 flex items-baseline justify-between">
            <h2 className="heading-serif text-display-md text-ink-900">You may also <em>consider</em></h2>
            <Link href="/shop" className="text-xs uppercase tracking-[0.2em] text-gold-600 hover:underline">See all →</Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {related.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        </div>
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed right-4 top-24 z-[80] flex items-center gap-2.5 border border-gold-300 bg-ink-900 px-4 py-3 text-sm text-ivory-50 shadow-lg"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-gold-400 text-ink-900">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            Added to cart
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add-to-cart modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md border border-gold-200 bg-ivory-50 p-6 shadow-2xl md:p-8"
            >
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 grid h-8 w-8 place-items-center text-ink-400 hover:text-ink-900"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-600">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-gold-400 text-ink-900">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                Added to your cart
              </div>

              <div className="mt-5 flex items-center gap-4 border-y border-ink-100 py-5">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden bg-ink-100">
                  <ProductImage product={product} photoIndex={activePhoto} sizes="80px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-gold-600">{product.brand}</p>
                  <p className="heading-serif truncate text-lg text-ink-900">{product.name}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {activeVariant && hasMultipleVariants ? `${variantLabel(activeVariant)} · ` : ""}Qty {qty}
                  </p>
                </div>
                <p className="tabular font-display text-lg text-ink-900">{formatINR(unitPrice * qty)}</p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button onClick={() => setModalOpen(false)} className="btn-ghost">
                  Continue shopping
                </button>
                <Link href="/cart" className="btn-gold-solid">
                  Go to cart
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
