"use client";
import Link from "next/link";
import { useCart } from "@/lib/store/cart";
import { getProductById } from "@/lib/data/products";
import { ProductImage } from "@/components/ui/ProductImage";
import { formatINR } from "@/lib/utils";
import { Minus, Plus, X, ArrowRight, ShoppingBag, Tag, Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Coupon = { label: string; type: "percent" | "flat"; value: number; min?: number };

// Demo coupon codes.
const COUPONS: Record<string, Coupon> = {
  SARASWATHY10: { label: "10% off", type: "percent", value: 10 },
  WELCOME15: { label: "15% off your first order", type: "percent", value: 15 },
  FLAT500: { label: "₹500 off", type: "flat", value: 500, min: 3000 },
  ENCORE20: { label: "20% off", type: "percent", value: 20, min: 10000 },
};

const BURST_NOTES = ["♪", "♫", "♩", "♬", "𝅘𝅥𝅮"];

/** A small burst of gold musical notes + a ring — plays when a coupon lands. */
function CouponBurst() {
  const notes = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => ({
        id: i,
        angle: (i / 11) * Math.PI * 2 + Math.random() * 0.4,
        dist: 54 + Math.random() * 46,
        char: BURST_NOTES[i % BURST_NOTES.length],
        size: 12 + Math.random() * 13,
        delay: Math.random() * 0.12,
        rot: Math.random() * 70 - 35,
      })),
    [],
  );
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.span
        className="absolute h-12 w-12 rounded-full border-2 border-gold-400"
        initial={{ scale: 0, opacity: 0.8 }}
        animate={{ scale: 3.4, opacity: 0 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      {notes.map((n) => (
        <motion.span
          key={n.id}
          className="absolute font-serif text-gold-500"
          style={{ fontSize: n.size }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
          animate={{
            x: Math.cos(n.angle) * n.dist,
            y: Math.sin(n.angle) * n.dist - 12,
            opacity: [0, 1, 1, 0],
            scale: 1,
            rotate: n.rot,
          }}
          transition={{ duration: 1.3, delay: n.delay, ease: "easeOut" }}
        >
          {n.char}
        </motion.span>
      ))}
    </motion.div>
  );
}

export default function CartPage() {
  const items = useCart((s) => s.items);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const clear = useCart((s) => s.clear);
  const [mounted, setMounted] = useState(false);
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState<(Coupon & { code: string }) | null>(null);
  const [error, setError] = useState("");
  const [celebrate, setCelebrate] = useState(false);
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
  const couponActive = coupon && (!coupon.min || subtotal >= coupon.min);
  const discount = couponActive
    ? coupon!.type === "percent"
      ? Math.round((subtotal * coupon!.value) / 100)
      : Math.min(coupon!.value, subtotal)
    : 0;
  const total = Math.max(0, subtotal + gstTotal + shipping - discount);

  const applyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const key = code.trim().toUpperCase();
    const found = COUPONS[key];
    if (!found) {
      setError("That code isn’t valid. Try SARASWATHY10.");
      return;
    }
    if (found.min && subtotal < found.min) {
      setError(`Add ${formatINR(found.min)}+ to use this code.`);
      return;
    }
    setError("");
    setCoupon({ code: key, ...found });
    setCode("");
    setCelebrate(true);
    window.setTimeout(() => setCelebrate(false), 1600);
  };
  const removeCoupon = () => {
    setCoupon(null);
    setError("");
  };

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

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
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
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
                    <div className="flex shrink-0 items-center border border-ink-200">
                      <button onClick={() => updateQuantity(i.productId, i.quantity - 1)} className="grid h-9 w-9 place-items-center hover:bg-ink-50"><Minus className="h-3 w-3" /></button>
                      <span className="tabular w-8 text-center text-sm">{i.quantity}</span>
                      <button onClick={() => updateQuantity(i.productId, i.quantity + 1)} className="grid h-9 w-9 place-items-center hover:bg-ink-50"><Plus className="h-3 w-3" /></button>
                    </div>
                    <div className="ml-auto text-right">
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
              <AnimatePresence>
                {discount > 0 && (
                  <motion.div
                    key="discount"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex justify-between text-success"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Discount ({coupon!.code})</span>
                    </span>
                    <span className="tabular shrink-0">−{formatINR(discount)}</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-4">
                <span className="text-sm uppercase tracking-[0.18em] text-ink-500">Total</span>
                <span className="tabular font-display text-3xl text-ink-900">{formatINR(total)}</span>
              </div>
            </div>

            {/* Coupon */}
            <div className="relative mt-5">
              <AnimatePresence mode="wait" initial={false}>
                {coupon ? (
                  <motion.div
                    key="applied"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="flex items-center justify-between gap-3 border border-gold-300 bg-gold-50/50 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-400 text-ink-900">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{coupon.code}</p>
                        <p className="truncate text-[11px] text-ink-500">{coupon.label} applied</p>
                      </div>
                    </div>
                    <button onClick={removeCoupon} aria-label="Remove coupon" className="shrink-0 text-ink-400 transition-colors hover:text-danger">
                      <X className="h-4 w-4" />
                    </button>
                  </motion.div>
                ) : (
                  <motion.form
                    key="input"
                    onSubmit={applyCoupon}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex gap-2"
                  >
                    <input
                      value={code}
                      onChange={(e) => { setCode(e.target.value); if (error) setError(""); }}
                      placeholder="Coupon code"
                      aria-label="Coupon code"
                      className="min-w-0 flex-1 border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm uppercase tracking-[0.12em] text-ink-900 placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-400 focus:border-gold-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="shrink-0 bg-ink-900 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-ivory-50 transition-colors hover:bg-gold-500 hover:text-ink-900"
                    >
                      Apply
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, x: 0 }}
                    animate={{ opacity: 1, x: [0, -5, 5, -3, 3, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="mt-2 text-xs text-danger"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <AnimatePresence>{celebrate && <CouponBurst />}</AnimatePresence>
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
            <p>Every order includes atelier set-up and first-year tuning where applicable, delivered and installed by our own team.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
