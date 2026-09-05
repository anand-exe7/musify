"use client";
import { useState, use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { notFound, useRouter } from "next/navigation";
import { getProduct, products } from "@/lib/data/products";
import { ProductImage } from "@/components/ui/ProductImage";
import { ProductCard } from "@/components/shop/ProductCard";
import { useCart } from "@/lib/store/cart";
import { formatINR } from "@/lib/utils";
import { Minus, Plus, ChevronRight, Truck, Shield, RotateCcw, Award } from "lucide-react";

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const product = getProduct(slug);
  if (!product) notFound();

  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<"description" | "specs" | "shipping">("description");
  const [activePhoto, setActivePhoto] = useState(0);
  const addItem = useCart((s) => s.addItem);
  const gallery = product.photos && product.photos.length > 0 ? product.photos : [product.photo].filter(Boolean) as string[];

  const related = products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);

  const handleAdd = () => {
    addItem(product.id, qty);
  };

  const handleBuyNow = () => {
    addItem(product.id, qty);
    router.push("/checkout");
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <div className="relative aspect-square overflow-hidden bg-ink-100">
            <ProductImage
              product={product}
              photoIndex={activePhoto}
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              imageClassName="transition-transform duration-500"
            />
          </div>
          {gallery.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {gallery.slice(0, 4).map((_, i) => (
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
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
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
            <span className="tabular font-display text-4xl text-ink-900 md:text-5xl">{formatINR(product.price)}</span>
            {product.mrp > product.price && (
              <>
                <span className="tabular pb-1 text-lg text-ink-400 line-through">{formatINR(product.mrp)}</span>
                <span className="tabular pb-1 text-sm font-semibold text-success">
                  {Math.round(((product.mrp - product.price) / product.mrp) * 100)}% off
                </span>
              </>
            )}
          </div>
          <p className="mt-2 text-xs uppercase tracking-widest text-ink-500">
            Incl. {product.gstRate}% GST · HSN {product.hsn}
          </p>

          {/* Stock */}
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className={`inline-block h-2 w-2 rounded-full ${product.stock > 3 ? "bg-success" : product.stock > 0 ? "bg-warning" : "bg-danger"}`} />
            {product.stock > 3 ? (
              <span className="text-ink-700">In stock · Ships in 2-3 days</span>
            ) : product.stock > 0 ? (
              <span className="text-warning">Only {product.stock} left</span>
            ) : (
              <span className="text-danger">Currently unavailable</span>
            )}
          </div>

          {/* Quantity + Buttons */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-ink-200">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="grid h-11 w-11 place-items-center transition-colors hover:bg-ink-50" aria-label="Decrease">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="tabular w-10 text-center font-medium">{qty}</span>
                <button onClick={() => setQty(Math.min(product.stock, qty + 1))} className="grid h-11 w-11 place-items-center transition-colors hover:bg-ink-50" aria-label="Increase">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <button onClick={handleAdd} className="btn-gold flex-1">
                Add to cart
              </button>
            </div>
            <button onClick={handleBuyNow} className="btn-gold-solid w-full">
              Buy now
            </button>
          </div>

          {/* Trust icons */}
          <div className="mt-8 grid grid-cols-2 gap-3 border-t border-ink-100 pt-6 text-xs md:grid-cols-4">
            {[
              { Icon: Truck, label: "White-glove delivery" },
              { Icon: Shield, label: `${product.specs.find(s => s.label === "Warranty")?.value ?? "1 year"} warranty` },
              { Icon: RotateCcw, label: "1-year return" },
              { Icon: Award, label: "Atelier set-up" },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 text-center md:flex-row md:text-left">
                <Icon className="h-4 w-4 shrink-0 text-gold-600" />
                <span className="text-ink-600">{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="mt-16 border-t border-ink-100 pt-10">
        <div className="mb-6 flex gap-6 border-b border-ink-100">
          {(["description", "specs", "shipping"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative pb-3 text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${tab === t ? "text-ink-900" : "text-ink-400 hover:text-ink-700"}`}
            >
              {t === "description" ? "Description" : t === "specs" ? "Specifications" : "Shipping & returns"}
              {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-gold-500" />}
            </button>
          ))}
        </div>

        <div className="mx-auto max-w-3xl py-4">
          {tab === "description" && (
            <div className="space-y-4">
              <p className="text-base leading-relaxed text-ink-700 md:text-lg">{product.description}</p>
              <ul className="mt-6 grid gap-3 md:grid-cols-2">
                {product.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-ink-700">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-gold-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tab === "specs" && (
            <table className="w-full text-sm">
              <tbody>
                {product.specs.map((s) => (
                  <tr key={s.label} className="border-b border-ink-100">
                    <td className="py-3 text-xs font-semibold uppercase tracking-[0.16em] text-ink-500">{s.label}</td>
                    <td className="py-3 text-right text-ink-900 md:text-left md:pl-8">{s.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "shipping" && (
            <div className="space-y-3 text-sm leading-relaxed text-ink-700">
              <p><strong className="text-ink-900">White-glove delivery</strong> — free across India for orders above ₹5,000. International rates on request.</p>
              <p><strong className="text-ink-900">Set-up included</strong> — every instrument leaves the atelier tuned and ready.</p>
              <p><strong className="text-ink-900">1-year return</strong> — return any instrument within twelve months for a full refund, no questions asked.</p>
              <p><strong className="text-ink-900">Warranty</strong> — {product.specs.find(s => s.label === "Warranty")?.value ?? "1 year"} manufacturer + workshop cover.</p>
            </div>
          )}
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
    </div>
  );
}
