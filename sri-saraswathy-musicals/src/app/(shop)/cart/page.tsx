"use client";
import Link from "next/link";
import { useCart } from "@/lib/store/cart";
import { getProductById } from "@/lib/data/products";
import { ProductImage } from "@/components/ui/ProductImage";
import { formatINR } from "@/lib/utils";
import { Minus, Plus, X, ArrowRight, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function CartPage() {
  const items = useCart((s) => s.items);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const clear = useCart((s) => s.clear);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const cartItems = items
    .map((i) => ({ ...i, product: getProductById(i.productId) }))
    .filter((i) => i.product);

  const subtotal = cartItems.reduce((n, i) => n + (i.product?.price ?? 0) * i.quantity, 0);
  const gstTotal = cartItems.reduce((n, i) => {
    const p = i.product!;
    return n + (p.price * i.quantity * p.gstRate) / 100;
  }, 0);
  const shipping = subtotal > 5000 || subtotal === 0 ? 0 : 200;
  const total = subtotal + gstTotal + shipping;

  if (cartItems.length === 0) {
    return (
      <div className="container-narrow py-20 text-center md:py-32">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-ivory-100">
          <ShoppingBag className="h-8 w-8 text-ink-400" />
        </div>
        <h1 className="heading-serif mt-6 text-display-md text-ink-900">Your cart is <em>empty.</em></h1>
        <p className="mx-auto mt-3 max-w-md text-ink-500">Nothing here yet. Come browse the collection — there is likely one instrument you have been waiting for.</p>
        <Link href="/shop" className="btn-gold-solid mt-8">
          Browse instruments
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page py-8 md:py-14">
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <p className="eyebrow">Your cart</p>
          <h1 className="heading-serif mt-3 text-display-md text-ink-900">{cartItems.length} {cartItems.length === 1 ? "piece" : "pieces"} <em>reserved</em></h1>
        </div>
        <button onClick={clear} className="text-xs uppercase tracking-[0.18em] text-ink-500 hover:text-danger">Clear cart</button>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {cartItems.map((i) => (
              <motion.div
                key={i.productId}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
                className="flex gap-4 border border-ink-100 bg-ivory-50 p-4 md:p-5"
              >
                <Link href={`/product/${i.product!.slug}`} className="relative h-24 w-24 shrink-0 overflow-hidden bg-ink-100 md:h-32 md:w-32">
                  <ProductImage product={i.product!} sizes="128px" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-gold-600">{i.product!.brand}</p>
                      <Link href={`/product/${i.product!.slug}`}>
                        <p className="heading-serif truncate text-lg text-ink-900">{i.product!.name}</p>
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-400">HSN {i.product!.hsn} · {i.product!.gstRate}% GST</p>
                    </div>
                    <button onClick={() => removeItem(i.productId)} aria-label="Remove" className="grid h-8 w-8 shrink-0 place-items-center text-ink-400 hover:text-danger">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div className="flex items-center border border-ink-200">
                      <button onClick={() => updateQuantity(i.productId, i.quantity - 1)} className="grid h-9 w-9 place-items-center hover:bg-ink-50"><Minus className="h-3 w-3" /></button>
                      <span className="tabular w-8 text-center text-sm">{i.quantity}</span>
                      <button onClick={() => updateQuantity(i.productId, i.quantity + 1)} className="grid h-9 w-9 place-items-center hover:bg-ink-50"><Plus className="h-3 w-3" /></button>
                    </div>
                    <div className="text-right">
                      <p className="tabular font-display text-lg text-ink-900">{formatINR(i.product!.price * i.quantity)}</p>
                      {i.quantity > 1 && <p className="tabular text-xs text-ink-400">{formatINR(i.product!.price)} each</p>}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="border border-ink-100 bg-ivory-50 p-6 md:p-8">
            <h2 className="heading-serif text-xl text-ink-900">Order summary</h2>
            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-500">Subtotal</span>
                <span className="tabular text-ink-900">{formatINR(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">GST (avg)</span>
                <span className="tabular text-ink-900">{formatINR(gstTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-500">Shipping</span>
                <span className="tabular text-ink-900">{shipping === 0 ? "Free" : formatINR(shipping)}</span>
              </div>
              <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-4">
                <span className="text-sm uppercase tracking-[0.18em] text-ink-500">Total</span>
                <span className="tabular font-display text-3xl text-ink-900">{formatINR(total)}</span>
              </div>
            </div>
            <Link href="/checkout" className="btn-gold-solid mt-6 w-full">
              Proceed to checkout
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <div className="mt-4 space-y-1 text-center text-xs text-ink-400">
              <p>Free shipping on orders above ₹5,000</p>
              <p>Secure payment · UPI · Card · Bank</p>
            </div>
          </div>
          <div className="mt-4 border border-dashed border-gold-300 bg-gold-50/40 p-4 text-xs text-ink-600">
            <p className="mb-1 font-semibold uppercase tracking-widest text-gold-700">Included</p>
            <p>Every order includes atelier set-up, first-year tuning where applicable, and a 12-month return.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
