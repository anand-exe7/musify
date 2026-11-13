"use client";
import { useState, use, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { notFound } from "next/navigation";
import { useProductBySlug, useProductPage } from "@/lib/client/catalog";
import { ProductImage } from "@/components/ui/ProductImage";
import { ProductCard } from "@/components/shop/ProductCard";
import { useCart } from "@/lib/store/cart";
import { formatINR, cn } from "@/lib/utils";
import { variantKey as keyOf, variantLabel, withVariantPhoto } from "@/lib/catalog/variants";
import {
  Minus,
  Plus,
  ChevronRight,
  Truck,
  Award,
  Store,
  ShoppingBag,
  Check,
  X,
  ArrowRight,
  ChevronDown,
  Sparkles,
} from "lucide-react";

export function ProductView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { product, loading, notFound: missing, error, refresh } = useProductBySlug(slug);

  const [qty, setQty] = useState(1);
  const [activePhoto, setActivePhoto] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const [selectedVariantKey, setSelectedVariantKey] = useState<string | null>(null);
  const addItem = useCart((s) => s.addItem);

  // Selectable variants (skip disabled). First enabled variant is the default;
  // the user's pick wins once they interact.
  const allVariants = useMemo(() => product?.variants ?? [], [product]);
  const selectableVariants = useMemo(() => allVariants.filter((v) => !v.disabled), [allVariants]);
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
  // The chosen variant's own photo, when it has one, is the only photo shown.
  const shown = useMemo(() => (product ? withVariantPhoto(product, activeVariant) : product), [product, activeVariant]);
  const gallery = (shown?.photos && shown.photos.length > 0 ? shown.photos : [shown?.photo].filter(Boolean) as string[]).slice(0, 5);

  // A few more from the same category (one extra in case this product is among them).
  const { data: relatedPage } = useProductPage(
    { department: "all", category: product?.category ?? "", origin: "all", maxPrice: 0, sort: "featured", page: 1, pageSize: 5 },
    { skip: !product },
  );
  const related = product && relatedPage ? relatedPage.items.filter((p) => p.id !== product.id).slice(0, 4) : [];
  const specRows = product ? product.specs.filter((s) => s.label !== "Warranty") : [];
  const off = product && product.mrp > unitPrice ? Math.round(((product.mrp - unitPrice) / product.mrp) * 100) : 0;

  // Auto-advance the gallery. Re-scheduling on activePhoto means a manual
  // thumbnail click also resets the timer, so it never jumps immediately.
  useEffect(() => {
    if (gallery.length <= 1) return;
    const id = setTimeout(() => setActivePhoto((p) => (p + 1) % gallery.length), 5000);
    return () => clearTimeout(id);
  }, [activePhoto, gallery.length]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(false), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  if (loading) {
    return (
      <div className="container-page py-6 md:py-10">
        <div className="grid gap-8 md:grid-cols-2 md:gap-14">
          <div className="aspect-square animate-pulse rounded-3xl bg-ink-100/70" />
          <div className="space-y-4 py-2">
            <div className="h-3 w-24 animate-pulse rounded bg-ink-100" />
            <div className="h-8 w-3/4 animate-pulse rounded bg-ink-100" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-ink-100" />
            <div className="h-14 w-56 animate-pulse rounded bg-ink-100" />
            <div className="h-12 w-full animate-pulse rounded-full bg-ink-100" />
          </div>
        </div>
      </div>
    );
  }
  // A failed catalogue fetch is not a missing product — offer a retry instead of a 404.
  if (!product && error) {
    return (
      <div className="container-page py-32 text-center">
        <p className="heading-serif text-xl text-ink-700">We couldn&apos;t load this instrument.</p>
        <p className="mt-2 text-sm text-ink-400">{error}</p>
        <button onClick={refresh} className="btn-ghost mt-6">Try again</button>
      </div>
    );
  }
  if (!product || missing) notFound();

  const handleAdd = () => {
    if (!activeVariant) return;
    addItem(product.id, keyOf(activeVariant), qty);
    setModalOpen(true);
    setToast(true);
  };

  return (
    <div className="container-page py-4 md:py-8">
      {/* Breadcrumbs */}
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-ink-400">
        <Link href="/" className="hover:text-gold-600">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/shop" className="hover:text-gold-600">Shop</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/shop?category=${product.category}`} className="hover:text-gold-600">{product.category}</Link>
      </nav>

      <div className="grid gap-8 md:grid-cols-2 md:gap-12 lg:gap-16">
        {/* ── Gallery ───────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="md:sticky md:top-24 md:self-start">
          <div className="relative aspect-square overflow-hidden rounded-3xl border border-ink-100 bg-white">
            <AnimatePresence initial={false}>
              <motion.div
                key={activePhoto}
                initial={{ opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="absolute inset-0"
              >
                <ProductImage
                  product={shown ?? product}
                  photoIndex={activePhoto}
                  priority
                  fit="contain"
                  className="relative h-full w-full overflow-hidden bg-white p-6 md:p-10"
                  sizes="(max-width: 768px) 100vw, 46vw"
                />
              </motion.div>
            </AnimatePresence>

            {off > 0 && (
              <span className="absolute left-4 top-4 rounded-full bg-success px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                {off}% off
              </span>
            )}

            {gallery.length > 1 && (
              <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink-900/70 px-3 py-2 backdrop-blur-sm">
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
            <div className="mt-3 grid grid-cols-5 gap-2">
              {gallery.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActivePhoto(i)}
                  className={`relative aspect-square overflow-hidden rounded-xl border bg-white transition-colors ${activePhoto === i ? "border-gold-500 ring-2 ring-gold-500/25" : "border-ink-100 hover:border-gold-300"}`}
                  aria-label={`View photo ${i + 1}`}
                >
                  <ProductImage
                    product={shown ?? product}
                    photoIndex={i}
                    fit="contain"
                    className="relative h-full w-full overflow-hidden bg-white p-1.5"
                    sizes="120px"
                    imageClassName={activePhoto === i ? "" : "opacity-70"}
                  />
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Buy box ───────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-600">{product.brand || product.category}</span>
            {product.bestSeller && <span className="rounded-full bg-ink-900 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-gold-400">Bestseller</span>}
            {product.new && <span className="rounded-full border border-gold-400 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-gold-700">New</span>}
          </div>

          <h1 className="heading-serif mt-2 text-[1.75rem] leading-[1.1] text-ink-900 sm:text-[2.1rem] md:text-[2.5rem]">
            {product.name}
          </h1>
          {product.tagline && <p className="mt-2 text-base text-ink-500">{product.tagline}</p>}

          {/* Price */}
          <div className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="tabular text-4xl font-bold leading-none text-ink-900 md:text-[2.75rem]">
              {formatINR(unitPrice)}
            </span>
            {off > 0 && (
              <>
                <span className="tabular text-lg text-ink-400 line-through">{formatINR(product.mrp)}</span>
                <span className="tabular rounded-full bg-success/12 px-2.5 py-1 text-xs font-bold text-success">{off}% off</span>
              </>
            )}
          </div>
          <p className="mt-1.5 text-xs text-ink-400">
            {product.gstRate > 0 ? `Inclusive of ${product.gstRate}% GST` : "No GST on this item"}
          </p>

          {/* Option — opens a proper picker rather than a native dropdown. */}
          {hasMultipleVariants && (
            <div className="mt-6">
              <p className="field-label">Option</p>
              <button
                onClick={() => setPickerOpen(true)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-ink-200 bg-ivory-50 px-4 py-3.5 text-left transition-colors hover:border-gold-400"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink-900">
                    {activeVariant ? variantLabel(activeVariant) : "Choose an option"}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-400">
                    {selectableVariants.length} options · tap to change
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" />
              </button>
            </div>
          )}

          {/* Availability */}
          <div className="mt-5 rounded-2xl border border-ink-100 bg-ivory-50 p-4">
            <div className="flex items-center gap-2 text-sm">
              <span className={`inline-block h-2 w-2 rounded-full ${variantStock > 0 ? "bg-success" : "bg-danger"}`} />
              {variantStock > 0 ? (
                <span className="font-medium text-ink-800">In stock · ships in 2–3 days</span>
              ) : (
                <span className="font-medium text-danger">Currently unavailable</span>
              )}
            </div>
          </div>

          {/* Quantity + add */}
          <div className="mt-5 flex items-stretch gap-3">
            <div className="flex h-12 shrink-0 items-center rounded-full border border-ink-200">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-full w-11 place-items-center rounded-l-full transition-colors hover:bg-ink-900/[0.04]" aria-label="Decrease">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="tabular w-9 text-center text-sm font-semibold">{qty}</span>
              <button onClick={() => setQty(Math.min(Math.max(1, variantStock), qty + 1))} className="grid h-full w-11 place-items-center rounded-r-full transition-colors hover:bg-ink-900/[0.04]" aria-label="Increase">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              onClick={handleAdd}
              disabled={variantStock === 0}
              className="btn-gold-solid h-12 flex-1 py-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShoppingBag className="h-4 w-4" />
              Add to cart
            </button>
          </div>

          {/* What comes with it */}
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {[
              { Icon: Truck, label: "White-glove delivery" },
              { Icon: Award, label: "Atelier set-up & tuning" },
              { Icon: Store, label: "Try it at our stores" },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5 rounded-xl border border-ink-100 bg-ivory-50 px-3 py-2.5">
                <Icon className="h-4 w-4 shrink-0 text-gold-600" />
                <span className="text-[11px] leading-tight text-ink-600">{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── About ─────────────────────────────────────────────── */}
      {(product.description || product.features.length > 0 || specRows.length > 0) && (
        <div className="mt-14 grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:gap-8">
          <div className="rounded-3xl border border-ink-100 bg-ivory-50 p-6 md:p-8">
            <h2 className="heading-serif text-2xl text-ink-900">About this instrument</h2>
            {product.description && (
              <p className="mt-4 text-pretty text-[15px] leading-relaxed text-ink-700 md:text-base">
                {product.description}
              </p>
            )}

            {product.features.length > 0 && (
              <>
                <p className="mt-7 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-700">
                  <Sparkles className="h-3.5 w-3.5" /> What stands out
                </p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {product.features.map((f, i) => (
                    <li
                      key={`${f}-${i}`}
                      className="flex items-start gap-2.5 rounded-xl border border-ink-100 bg-white px-3.5 py-3 text-sm text-ink-700"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                      <span className="text-pretty">{f}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {specRows.length > 0 && (
            <div className="rounded-3xl border border-ink-100 bg-ivory-50 p-6 md:p-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-700">Specifications</p>
              <dl className="mt-4">
                {specRows.map((s, i) => (
                  <div key={`${s.label}-${i}`} className="flex items-baseline justify-between gap-4 border-b border-ink-100 py-3 last:border-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">{s.label}</dt>
                    <dd className="text-right text-sm font-medium text-ink-900">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {/* ── Related ───────────────────────────────────────────── */}
      {related.length > 0 && (
        <div className="mt-16">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="heading-serif text-display-md text-ink-900">
              More in <em>{product.category}</em>
            </h2>
            <Link href={`/shop?category=${product.category}`} className="shrink-0 text-xs uppercase tracking-[0.2em] text-gold-600 hover:underline">
              See all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {related.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        </div>
      )}

      {/* ── Option picker ─────────────────────────────────────── */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] flex items-end justify-center bg-ink-950/60 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => setPickerOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80dvh] w-full max-w-lg overflow-hidden rounded-t-3xl border border-ink-100 bg-ivory-50 shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
                <div>
                  <h3 className="heading-serif text-xl text-ink-900">Choose an option</h3>
                  <p className="mt-0.5 text-xs text-ink-500">{product.name}</p>
                </div>
                <button onClick={() => setPickerOpen(false)} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-ink-900/5 hover:text-ink-900">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <ul className="max-h-[56dvh] overflow-y-auto p-3">
                {selectableVariants.map((v) => {
                  const left = v.stock ?? 0;
                  const isActive = activeVariant ? keyOf(v) === keyOf(activeVariant) : false;
                  return (
                    <li key={keyOf(v)}>
                      <button
                        disabled={left <= 0}
                        onClick={() => {
                          setSelectedVariantKey(keyOf(v));
                          setActivePhoto(0);
                          setQty(1);
                          setPickerOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition-all",
                          isActive ? "border-gold-500 bg-gold-50/60" : "border-ink-100 bg-white hover:border-gold-300",
                          left <= 0 && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-ink-100">
                          <ProductImage
                            product={withVariantPhoto(product, v)}
                            fit="contain"
                            className="relative h-full w-full overflow-hidden bg-white p-1.5"
                            sizes="64px"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink-900">{variantLabel(v)}</p>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {left > 0 ? `${left} in stock` : "Sold out"}
                            {v.weight ? ` · ${(v.weight / 1000).toFixed(2)} kg` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular text-base font-bold text-ink-900">{formatINR(v.price)}</p>
                          {isActive && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-700">
                              <Check className="h-3 w-3" strokeWidth={3} /> Chosen
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed right-4 top-24 z-[80] flex items-center gap-2.5 rounded-full border border-gold-300 bg-ink-900 px-4 py-3 text-sm text-ivory-50 shadow-lg"
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
              className="relative w-full max-w-md rounded-3xl border border-gold-200 bg-ivory-50 p-6 shadow-2xl md:p-8"
            >
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-ink-400 hover:bg-ink-900/5 hover:text-ink-900"
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
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100">
                  <ProductImage
                    product={shown ?? product}
                    photoIndex={activePhoto}
                    fit="contain"
                    className="relative h-full w-full overflow-hidden bg-white p-2"
                    sizes="80px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-widest text-gold-600">{product.brand}</p>
                  <p className="heading-serif truncate text-lg text-ink-900">{product.name}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {activeVariant && hasMultipleVariants ? `${variantLabel(activeVariant)} · ` : ""}Qty {qty}
                  </p>
                </div>
                <p className="tabular shrink-0 text-lg font-bold text-ink-900">{formatINR(unitPrice * qty)}</p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button onClick={() => setModalOpen(false)} className="btn-ghost">Continue shopping</button>
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
