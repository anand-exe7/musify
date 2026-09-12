"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useCart } from "@/lib/store/cart";
import { useGst, gstBreakup, isIntraState, IN_STATES } from "@/lib/store/gst";
import { useShallow } from "zustand/react/shallow";
import { getProductById } from "@/lib/data/products";
import { ProductImage } from "@/components/ui/ProductImage";
import { formatINR } from "@/lib/utils";
import { ChevronRight, Check, CreditCard, Smartphone, Landmark, Banknote, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrderCelebration } from "@/components/OrderCelebration";

const steps = ["Address", "Delivery", "Payment", "Review"];

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const shipState = useCart((s) => s.shipState);
  const setShipState = useCart((s) => s.setShipState);
  const homeState = useGst((s) => s.homeState);
  const gstLabels = useGst(useShallow((s) => ({ cgst: s.cgstLabel, sgst: s.sgstLabel, igst: s.igstLabel })));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [step, setStep] = useState(0);
  const [payment, setPayment] = useState<"upi" | "card" | "bank" | "cod">("upi");
  const [delivery, setDelivery] = useState<"standard" | "white-glove" | "express">("white-glove");
  const [placed, setPlaced] = useState(false);
  const [orderId, setOrderId] = useState("");

  if (!mounted) return null;

  const cartItems = items.map((i) => ({ ...i, product: getProductById(i.productId) })).filter((i) => i.product);
  const subtotal = cartItems.reduce((n, i) => n + (i.product?.price ?? 0) * i.quantity, 0);
  const gstLines = cartItems.map((i) => ({ amount: (i.product?.price ?? 0) * i.quantity, rate: i.product?.gstRate ?? 0 }));
  const intra = isIntraState(shipState, homeState);
  const gst = gstBreakup(gstLines, intra);
  const gstTotal = gst.total;
  const shipCost = delivery === "express" ? 500 : delivery === "white-glove" ? 0 : subtotal > 5000 ? 0 : 200;
  const total = subtotal + gstTotal + shipCost;

  if (cartItems.length === 0 && !placed) {
    return (
      <div className="container-narrow py-24 text-center">
        <h1 className="heading-serif text-display-md text-ink-900">Nothing to <em>checkout.</em></h1>
        <Link href="/shop" className="btn-gold-solid mt-6">Browse the shop</Link>
      </div>
    );
  }

  if (placed) {
    return <OrderCelebration orderId={orderId} />;
  }

  return (
    <div className="container-page py-8 md:py-12">
      <p className="eyebrow">Checkout</p>
      <h1 className="heading-serif mt-3 text-display-md text-ink-900">Complete your <em>order</em></h1>

      {/* Progress */}
      <div className="mt-8 flex items-center gap-2 overflow-x-auto no-scrollbar md:gap-4">
        {steps.map((s, i) => (
          <div key={s} className="flex shrink-0 items-center gap-2 md:gap-3">
            <div className={cn(
              "grid h-8 w-8 place-items-center border text-xs font-semibold transition-all",
              i < step ? "border-gold-500 bg-gold-500 text-ink-900" : i === step ? "border-ink-900 bg-ink-900 text-ivory-50" : "border-ink-200 bg-ivory-50 text-ink-400",
            )}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn("text-xs uppercase tracking-[0.16em]", i <= step ? "text-ink-900" : "text-ink-400")}>{s}</span>
            {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-ink-300" />}
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div>
          {step === 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <h2 className="heading-serif text-xl text-ink-900">Delivery address</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label="Full name" defaultValue="Arjun Rao" />
                <Field label="Phone" defaultValue="+91 98876 54321" />
                <Field label="Email" type="email" defaultValue="arjun.rao@gmail.com" />
                <Field label="Pincode" defaultValue="600020" />
                <div className="md:col-span-2"><Field label="Address line 1" defaultValue="12 Adyar Main Road" /></div>
                <div className="md:col-span-2"><Field label="Address line 2 (optional)" defaultValue="Near LB Road Metro" /></div>
                <Field label="City" defaultValue="Chennai" />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">State · place of supply</span>
                  <select
                    value={shipState}
                    onChange={(e) => setShipState(e.target.value)}
                    className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm text-ink-900 transition-colors focus:border-gold-500 focus:outline-none"
                  >
                    {IN_STATES.map((s) => (
                      <option key={s} value={s}>{s}{s === homeState ? " (in-state)" : ""}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-3 text-xs text-ink-500">
                {intra
                  ? `Supply within ${homeState} — taxed as ${gstLabels.cgst} + ${gstLabels.sgst}.`
                  : `Supply outside ${homeState} — taxed as ${gstLabels.igst}.`}
              </p>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <h2 className="heading-serif text-xl text-ink-900">Delivery method</h2>
              <div className="mt-6 space-y-3">
                <DeliveryOption id="white-glove" active={delivery === "white-glove"} onClick={() => setDelivery("white-glove")} title="White-glove" desc="Instrument delivered, unpacked and set up in your home. 2 to 4 working days." price="Free" recommended />
                <DeliveryOption id="standard" active={delivery === "standard"} onClick={() => setDelivery("standard")} title="Standard" desc="Insured courier. 3 to 5 working days." price={subtotal > 5000 ? "Free" : formatINR(200)} />
                <DeliveryOption id="express" active={delivery === "express"} onClick={() => setDelivery("express")} title="Express" desc="Next-business-day, tier-1 cities only." price={formatINR(500)} />
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <h2 className="heading-serif text-xl text-ink-900">Payment method</h2>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <PayOption id="upi" icon={Smartphone} active={payment === "upi"} onClick={() => setPayment("upi")} title="UPI" desc="Google Pay, PhonePe, Paytm" />
                <PayOption id="card" icon={CreditCard} active={payment === "card"} onClick={() => setPayment("card")} title="Card" desc="Visa · Mastercard · Rupay · Amex" />
                <PayOption id="bank" icon={Landmark} active={payment === "bank"} onClick={() => setPayment("bank")} title="Net banking" desc="All major banks supported" />
                <PayOption id="cod" icon={Banknote} active={payment === "cod"} onClick={() => setPayment("cod")} title="Pay on delivery" desc="Cash or card at your door" />
              </div>

              {payment === "card" && (
                <div className="mt-6 space-y-4 border border-ink-100 bg-ivory-100/40 p-5">
                  <Field label="Card number" placeholder="1234 5678 9012 3456" />
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="MM/YY" placeholder="12/28" />
                    <Field label="CVV" placeholder="123" />
                    <Field label="ZIP" placeholder="600020" />
                  </div>
                  <p className="flex items-center gap-2 text-xs text-ink-500"><Lock className="h-3 w-3" /> Encrypted · PCI DSS compliant</p>
                </div>
              )}
              {payment === "upi" && (
                <div className="mt-6 border border-ink-100 bg-ivory-100/40 p-5">
                  <Field label="UPI ID" placeholder="yourname@bank" />
                </div>
              )}
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <h2 className="heading-serif text-xl text-ink-900">Review your order</h2>
              <div className="mt-6 divide-y divide-ink-100 border border-ink-100 bg-ivory-50">
                {cartItems.map((i) => (
                  <div key={i.productId} className="flex items-center gap-4 p-4">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-ink-100">
                      <ProductImage product={i.product!} sizes="64px" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-gold-600">{i.product!.brand}</p>
                      <p className="heading-serif text-base text-ink-900">{i.product!.name}</p>
                      <p className="text-xs text-ink-400">Qty {i.quantity} · HSN {i.product!.hsn}</p>
                    </div>
                    <p className="tabular text-sm text-ink-900">{formatINR(i.product!.price * i.quantity)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 space-y-2 text-sm">
                <p className="text-ink-500">Delivering to <span className="text-ink-900">Arjun Rao, 12 Adyar Main Road, Chennai 600020</span></p>
                <p className="text-ink-500">Delivery <span className="text-ink-900">{delivery}</span></p>
                <p className="text-ink-500">Payment <span className="text-ink-900 uppercase">{payment}</span></p>
              </div>
            </motion.div>
          )}

          {/* Nav */}
          <div className="mt-10 flex items-center justify-between">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="text-xs uppercase tracking-[0.18em] text-ink-500 disabled:opacity-40 hover:text-ink-900"
            >
              ← Back
            </button>
            {step < steps.length - 1 ? (
              <button onClick={() => setStep(step + 1)} className="btn-gold-solid">
                Continue
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={() => {
                  setOrderId(`Order #SSM-${Math.floor(Math.random() * 90000 + 10000)}`);
                  clear();
                  setPlaced(true);
                  window.scrollTo(0, 0);
                }}
                className="btn-gold-solid"
              >
                Place order · {formatINR(total)}
              </button>
            )}
          </div>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border border-ink-100 bg-ivory-50 p-6">
            <h3 className="heading-serif text-lg text-ink-900">Summary</h3>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Subtotal" value={formatINR(subtotal)} />
              {intra ? (
                <>
                  <Row label={gstLabels.cgst} value={formatINR(gst.cgst)} />
                  <Row label={gstLabels.sgst} value={formatINR(gst.sgst)} />
                </>
              ) : (
                <Row label={gstLabels.igst} value={formatINR(gst.igst)} />
              )}
              <Row label="Shipping" value={shipCost === 0 ? "Free" : formatINR(shipCost)} />
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-4">
              <span className="text-xs uppercase tracking-[0.18em] text-ink-500">Total</span>
              <span className="tabular font-display text-2xl text-ink-900">{formatINR(total)}</span>
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-ink-400"><Lock className="h-3 w-3" /> Secure checkout</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">{label}</span>
      <input {...rest} className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm text-ink-900 transition-colors focus:border-gold-500 focus:outline-none" />
    </label>
  );
}

function DeliveryOption({ title, desc, price, active, onClick, recommended }: { id: string; title: string; desc: string; price: string; active: boolean; onClick: () => void; recommended?: boolean }) {
  return (
    <button onClick={onClick} className={cn("relative w-full border p-5 text-left transition-all", active ? "border-gold-500 bg-gold-50/40" : "border-ink-200 hover:border-ink-300")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={cn("mt-1 grid h-4 w-4 place-items-center rounded-full border-2", active ? "border-gold-500" : "border-ink-300")}>
            {active && <span className="h-2 w-2 rounded-full bg-gold-500" />}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="heading-serif text-base text-ink-900">{title}</p>
              {recommended && <span className="border border-gold-400 bg-ivory-50 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-gold-600">Recommended</span>}
            </div>
            <p className="mt-1 text-xs text-ink-500">{desc}</p>
          </div>
        </div>
        <p className="tabular font-display text-sm text-ink-900">{price}</p>
      </div>
    </button>
  );
}

function PayOption({ title, desc, icon: Icon, active, onClick }: { id: string; title: string; desc: string; icon: any; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex items-start gap-3 border p-4 text-left transition-all", active ? "border-gold-500 bg-gold-50/40" : "border-ink-200 hover:border-ink-300")}>
      <div className={cn("grid h-9 w-9 place-items-center border", active ? "border-gold-500 text-gold-600" : "border-ink-300 text-ink-500")}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-ink-900">{title}</p>
        <p className="mt-0.5 text-xs text-ink-500">{desc}</p>
      </div>
      <span className={cn("grid h-4 w-4 place-items-center rounded-full border-2", active ? "border-gold-500" : "border-ink-300")}>
        {active && <span className="h-2 w-2 rounded-full bg-gold-500" />}
      </span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-500">{label}</span>
      <span className="tabular text-ink-900">{value}</span>
    </div>
  );
}
