"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/lib/store/cart";
import { useAuth } from "@/lib/store/auth";
import { useGst, IN_STATES } from "@/lib/store/gst";
import { useQuote } from "@/lib/client/quote";
import { useShallow } from "zustand/react/shallow";
import { useProductsByIds } from "@/lib/client/catalog";
import { ProductImage } from "@/components/ui/ProductImage";
import { findVariant, variantLabel, withVariantPhoto } from "@/lib/catalog/variants";
import { formatINR } from "@/lib/utils";
import { BUSINESS } from "@/lib/data/business";
import { formatWeight } from "@/lib/delivery/types";
import { ChevronRight, Check, Lock, MapPin, Truck, AlertCircle, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrderCelebration } from "@/components/OrderCelebration";
import type { UserAddress } from "@/types";
import { BRANCH_KEYS, DEFAULT_BRANCH, branchLabel } from "@/lib/stock";

const steps = ["Address", "Delivery", "Payment", "Review"];

type RazorpayWindow = Window & { Razorpay?: unknown };

/** One shared load of Razorpay's hosted-checkout script. Re-using the promise
 *  means retries and re-visits never stack up extra <script> tags. */
let razorpayScript: Promise<boolean> | null = null;
function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as RazorpayWindow).Razorpay) return Promise.resolve(true);
  if (razorpayScript) return razorpayScript;
  razorpayScript = new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => {
      s.remove();
      razorpayScript = null; // let a later attempt try again
      resolve(false);
    };
    document.body.appendChild(s);
  });
  return razorpayScript;
}

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const clear = useCart((s) => s.clear);
  const shipState = useCart((s) => s.shipState);
  const setShipState = useCart((s) => s.setShipState);
  const delivery = useCart((s) => s.delivery);
  const setDelivery = useCart((s) => s.setDelivery);
  const couponCode = useCart((s) => s.couponCode);
  const setCouponCode = useCart((s) => s.setCouponCode);
  const homeState = useGst((s) => s.homeState);
  const gstLabels = useGst(useShallow((s) => ({ cgst: s.cgstLabel, sgst: s.sgstLabel, igst: s.igstLabel })));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { byId, loading: productsLoading } = useProductsByIds(items.map((i) => i.productId));
  const user = useAuth((s) => s.user);
  const [step, setStep] = useState(0);
  const [branchPick, setBranch] = useState<string | null>(null);
  // Razorpay by default; pay-on-delivery is always available so an order can be placed
  // even when the online window can't open.
  const [payment, setPayment] = useState<"card" | "cod">("card");
  const [placed, setPlaced] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [placing, setPlacing] = useState(false);
  // True while we verify the Razorpay payment with our server — a blocking
  // overlay keeps the shopper from refreshing (which would look like a failure).
  const [confirming, setConfirming] = useState(false);
  const [addr, setAddr] = useState({
    name: "",
    phone: "",
    email: "",
    pincode: "",
    line1: "",
    line2: "",
    city: "",
  });
  const setAddrField = (k: keyof typeof addr) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddr((a) => ({ ...a, [k]: e.target.value }));

  const [savedAddresses, setSavedAddresses] = useState<UserAddress[]>([]);

  // Prefill name/email from the signed-in account once it hydrates, and load
  // saved addresses. The fetch is cancelled if `user` changes again before it
  // lands, so a slow earlier response can't overwrite a newer one.
  useEffect(() => {
    if (!user) return;
    setAddr((a) => ({
      ...a,
      name: a.name || user.name,
      email: a.email || user.email,
    }));
    const ctl = new AbortController();
    fetch("/api/addresses", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("addresses"))))
      .then((list: UserAddress[]) => setSavedAddresses(list))
      .catch(() => {
        /* aborted, or the list is unavailable — the shopper can still type an address */
      });
    return () => ctl.abort();
  }, [user]);

  // The Razorpay window currently open, so a retry or navigation can close it
  // instead of leaving it behind.
  const rzpRef = useRef<{ close?: () => void } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      rzpRef.current?.close?.();
      rzpRef.current = null;
    };
  }, []);

  // Cart lines whose product still exists in the catalogue.
  const cartItems = useMemo(
    () =>
      items
        .map((i) => {
          const product = byId.get(i.productId);
          if (!product) return null;
          return { ...i, product, variant: findVariant(product.variants ?? [], i.variantKey) };
        })
        .filter((i): i is NonNullable<typeof i> => i !== null),
    [items, byId],
  );

  // Which stores can supply the whole cart. A web order is fulfilled from ONE
  // store, so a store is only offered as "available" when every line is in stock there.
  const branchShort = useMemo(() => {
    const out: Record<string, string[]> = Object.fromEntries(BRANCH_KEYS.map((b) => [b, [] as string[]]));
    for (const i of cartItems) {
      const have = i.variant?.stockByBranch;
      if (!have) continue;
      for (const b of BRANCH_KEYS) {
        if ((have[b] ?? 0) < i.quantity) out[b].push(i.product.name);
      }
    }
    return out;
  }, [cartItems]);
  // Until the shopper chooses, start on the first store that can fill the cart.
  const branch: string =
    branchPick ?? BRANCH_KEYS.find((b) => branchShort[b].length === 0) ?? DEFAULT_BRANCH;
  // Other stores that could supply the whole cart if the chosen one cannot.
  const altBranches = BRANCH_KEYS.filter((b) => b !== branch && branchShort[b].length === 0);

  // The one source of prices, tax, shipping and discounts: the server.
  const {
    quote,
    loading: quoting,
    error: quoteError,
    refresh,
  } = useQuote(
    {
      items: cartItems.map((i) => ({ productId: i.productId, variantKey: i.variantKey, quantity: i.quantity })),
      delivery,
      shipState,
      branch,
      couponCode,
    },
    mounted && !productsLoading && !placed,
  );

  if (!mounted || productsLoading) {
    return <div className="container-narrow py-32 text-center text-ink-400">Loading checkout…</div>;
  }

  const quoteLines = new Map((quote?.items ?? []).map((l) => [`${l.productId}::${l.variantKey}`, l]));
  const issues = quote?.issues ?? [];
  const couponIssue = issues.find((i) => i.kind === "coupon");
  const canPlace = Boolean(quote) && !quoting && issues.length === 0;
  // Spelled out under the button, so a disabled "Place order" is never a dead end.
  const blockedBecause = !quote
    ? quoteError ?? "We're still pricing your order."
    : quoting
      ? "Updating your total…"
      : (issues[0]?.message ?? "");
  const intra = quote?.intra ?? true;

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

  const finalize = (id: string) => {
    if (!alive.current) return; // the shopper navigated away; the order is saved server-side
    setOrderId(id);
    clear();
    setPlaced(true);
    window.scrollTo(0, 0);
    setPlacing(false);
  };

  const placeOrder = async () => {
    if (placing || !canPlace) return;
    setPlacing(true);
    // Close any window left over from a previous attempt.
    rzpRef.current?.close?.();
    rzpRef.current = null;

    const payload = {
      items: cartItems.map((i) => ({ productId: i.productId, variantKey: i.variantKey, quantity: i.quantity })),
      couponCode: couponCode || undefined,
      delivery,
      payment,
      shipState,
      branch,
      customerName: addr.name,
      phone: addr.phone,
      email: addr.email,
      address: `${addr.name}, ${addr.line1}${addr.line2 ? ", " + addr.line2 : ""}, ${addr.city} ${addr.pincode} · ${shipState}`,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/auth/login?redirect=%2Fcheckout";
          return;
        }
        // Online payments unavailable → offer the route that still works.
        if (res.status === 503 && payment !== "cod") {
          setPayment("cod");
          setStep(2);
          throw new Error(
            (data?.error as string) ||
              "Online payments aren't available right now — switched you to Pay on delivery.",
          );
        }
        throw new Error(data?.error || "Checkout failed");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "We couldn't start your checkout. Please try again.");
      setPlacing(false);
      return;
    }

    // Pay on delivery — the order is already saved server-side.
    if (data.mode === "cod") {
      finalize(data.orderId);
      return;
    }

    // Online payment — open Razorpay's checkout, then verify the signature.
    const ready = await loadRazorpay();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const RZP = (window as unknown as { Razorpay?: any }).Razorpay;
    if (!alive.current) return;
    if (!ready || !RZP) {
      alert(
        "Couldn't open the payment window. Check your connection, or choose Pay on delivery and place the order now.",
      );
      setPayment("cod");
      setStep(2);
      setPlacing(false);
      return;
    }

    const rzp = new RZP({
      key: data.key,
      amount: data.amount,
      currency: data.currency,
      order_id: data.razorpayOrderId,
      name: "Sri Saraswathy Musicals",
      description: "Instrument order",
      prefill: { name: data.customerName, email: data.email, contact: data.phone },
      theme: { color: "#C9A24B" },
      modal: { ondismiss: () => setPlacing(false) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: async (resp: any) => {
        setConfirming(true);
        try {
          const vr = await fetch("/api/checkout/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              draftToken: data.draftToken,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            }),
          });
          const vd = await vr.json().catch(() => ({}));
          if (!vr.ok) throw new Error(vd?.error || "Payment verification failed");
          finalize(vd.orderId);
        } catch (err) {
          alert(
            err instanceof Error
              ? err.message
              : "Payment couldn't be verified. If you were charged, contact us and we'll sort it out.",
          );
          setPlacing(false);
        } finally {
          setConfirming(false);
        }
      },
    });
    const onFailed = () => {
      rzp.off?.("payment.failed", onFailed);
      alert("Payment failed. Please try another method.");
      if (alive.current) setPlacing(false);
    };
    rzp.on("payment.failed", onFailed);
    rzpRef.current = rzp;
    rzp.open();
  };

  return (
    <div className="container-page py-6 md:py-10">
      {/* Blocking overlay while the payment is being confirmed. */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] grid place-items-center bg-ivory-50/95 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-5 px-6 text-center">
              <span className="relative h-12 w-12">
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-ink-200 border-t-gold-500" />
              </span>
              <div>
                <p className="heading-serif text-xl text-ink-900">Confirming your payment…</p>
                <p className="mt-2 max-w-sm text-sm text-ink-500">
                  Payment received. We&apos;re saving your order now — please don&apos;t close or refresh this page.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="eyebrow">Checkout</p>
      <h1 className="heading-serif mt-3 text-display-md text-ink-900">Complete your <em>order</em></h1>

      {/* Progress */}
      <div className="mt-8 flex items-center gap-2 overflow-x-auto no-scrollbar md:gap-4">
        {steps.map((s, i) => (
          <div key={s} className="flex shrink-0 items-center gap-2 md:gap-3">
            <div className={cn(
              "grid h-8 w-8 place-items-center rounded-full border text-xs font-semibold transition-all",
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
              {savedAddresses.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Saved addresses</p>
                  <div className="space-y-2">
                    {savedAddresses.map((sa) => (
                      <button
                        key={sa.id}
                        type="button"
                        onClick={() => {
                          setAddr({
                            name: sa.name,
                            phone: sa.phone,
                            email: addr.email,
                            pincode: sa.pincode,
                            line1: sa.line1,
                            line2: sa.line2 ?? "",
                            city: sa.city,
                          });
                          if (sa.state) setShipState(sa.state);
                        }}
                        className="flex w-full items-start gap-3 rounded-xl border border-ink-200 bg-ivory-50 p-3 text-left text-sm transition-colors hover:border-gold-400 hover:bg-gold-50/30"
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                        <div>
                          <p className="font-medium text-ink-900">{sa.name}</p>
                          <p className="text-xs text-ink-500">{sa.line1}, {sa.city} {sa.pincode}</p>
                        </div>
                        {sa.isDefault && (
                          <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-widest text-gold-600">Default</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-ink-400">Or fill in a new address below:</p>
                </div>
              )}
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label="Full name" value={addr.name} onChange={setAddrField("name")} />
                <Field
                  label="Phone"
                  value={addr.phone}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile"
                  onChange={(e) => setAddr((a) => ({ ...a, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                />
                <Field label="Email" type="email" value={addr.email} onChange={setAddrField("email")} />
                <Field
                  label="Pincode"
                  value={addr.pincode}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit PIN code"
                  onChange={(e) => setAddr((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                />
                <div className="md:col-span-2"><Field label="Address line 1" value={addr.line1} onChange={setAddrField("line1")} /></div>
                <div className="md:col-span-2"><Field label="Address line 2 (optional)" value={addr.line2} onChange={setAddrField("line2")} /></div>
                <Field label="City" value={addr.city} onChange={setAddrField("city")} />
                {/* An order ships from ONE store, so a store that can't supply the whole cart is
                    named with what it is missing and simply can't be chosen. */}
                <div className="md:col-span-2">
                  <span className="field-label">Fulfilling branch</span>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {BUSINESS.branches.map((b) => {
                      const missing = branchShort[b.key] ?? [];
                      const canSupply = missing.length === 0;
                      return (
                        <button
                          key={b.key}
                          type="button"
                          disabled={!canSupply}
                          onClick={() => setBranch(b.key)}
                          className={cn(
                            "rounded-xl border p-3 text-left transition-colors",
                            !canSupply
                              ? "cursor-not-allowed border-ink-100 bg-ink-900/[0.02] opacity-70"
                              : branch === b.key
                                ? "border-gold-500 bg-gold-50/40"
                                : "border-ink-200 hover:border-ink-300",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-2",
                                !canSupply ? "border-ink-200" : branch === b.key ? "border-gold-500" : "border-ink-300",
                              )}
                            >
                              {canSupply && branch === b.key && <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />}
                            </span>
                            <span className="truncate text-sm font-semibold text-ink-900">{b.area}</span>
                          </span>
                          <span className="mt-1 block text-[11px] text-ink-500">{b.city}</span>
                          {!canSupply && (
                            <span className="mt-1.5 block text-[11px] text-ink-500">
                              No {missing.join(", ")} here
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <span className="mt-1.5 block text-[11px] text-ink-500">Your order is billed and dispatched from this store.</span>
                  {altBranches.length === 0 && branchShort[branch]?.length > 0 && (
                    <span className="mt-1.5 block text-[11px] font-medium text-danger">
                      No single store has your whole cart. Reduce a quantity, or contact us and we&rsquo;ll move stock
                      between stores for you.
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs text-ink-500">
                You pick the delivery state on the next step — it sets both the courier charge and the tax.
              </p>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <h2 className="heading-serif text-xl text-ink-900">Where it goes</h2>
              <p className="mt-2 text-sm text-ink-500">
                The courier charges by destination and parcel weight, so the state is picked here, with the price.
              </p>

              {/* Destination — its own box, because it is what sets the rate. */}
              <div className="mt-5 rounded-2xl border border-ink-100 bg-ivory-50 p-5">
                <label className="block">
                  <span className="field-label flex items-center gap-1.5 text-gold-700">
                    <MapPin className="h-3 w-3" /> Delivery state
                  </span>
                  <select value={shipState} onChange={(e) => setShipState(e.target.value)} className="field">
                    {IN_STATES.map((st) => (
                      <option key={st} value={st}>{st}{st === homeState ? " (in-state)" : ""}</option>
                    ))}
                  </select>
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-500">
                  {quote && quote.weightG > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5 text-ink-400" /> Parcel weight{" "}
                      <b className="tabular text-ink-900">{formatWeight(quote.weightG)}</b>
                    </span>
                  )}
                  <span>
                    {intra
                      ? `Taxed as ${gstLabels.cgst} + ${gstLabels.sgst}`
                      : `Taxed as ${gstLabels.igst}`}
                  </span>
                </div>
              </div>

              <h3 className="heading-serif mt-8 text-xl text-ink-900">How it travels</h3>
              <div className="mt-4 space-y-3">
                {!quote && <p className="text-sm text-ink-400">Working out the delivery charge…</p>}
                {quote?.shippingOptions.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-danger/40 bg-danger/[0.04] px-4 py-5 text-sm text-danger">
                    No delivery option is available right now. Please contact the shop and we will arrange it.
                  </p>
                )}
                {(quote?.shippingOptions ?? []).map((o) => (
                  <DeliveryOption
                    key={o.id}
                    active={(delivery || quote?.deliveryId) === o.id}
                    onClick={() => setDelivery(o.id)}
                    title={o.name}
                    desc={[o.description, o.eta].filter(Boolean).join(" · ")}
                    price={o.priced ? (o.price === 0 ? "Free" : formatINR(o.price)) : "Ask us"}
                    note={o.priced ? undefined : "We'll confirm the charge for a parcel this size."}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <h2 className="heading-serif text-xl text-ink-900">Payment method</h2>
              <div className="mt-6 space-y-3">
                <PaymentOption
                  active={payment === "card"}
                  onClick={() => setPayment("card")}
                  icon={<Lock className="h-4 w-4" />}
                  title="Pay online"
                  desc="UPI, cards, net banking or wallets, in the Razorpay window on the last step."
                />
                <PaymentOption
                  active={payment === "cod"}
                  onClick={() => setPayment("cod")}
                  icon={<Truck className="h-4 w-4" />}
                  title="Pay on delivery"
                  desc="Place the order now and pay our team when the instrument arrives."
                />
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <h2 className="heading-serif text-xl text-ink-900">Review your order</h2>
              <div className="mt-6 divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50">
                {cartItems.map((i) => {
                  const ql = quoteLines.get(`${i.productId}::${i.variantKey}`);
                  return (
                  <div key={`${i.productId}::${i.variantKey}`} className="flex items-center gap-4 p-4">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-ink-100">
                      <ProductImage product={withVariantPhoto(i.product, i.variant)} fit="contain" className="h-full w-full bg-white p-1.5" sizes="64px" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-widest text-gold-600">{i.product.brand}</p>
                      <p className="heading-serif text-base text-ink-900">{i.product.name}</p>
                      {i.variant && (i.product.variants?.length ?? 0) > 1 && (
                        <p className="text-xs text-ink-600">{variantLabel(i.variant)}</p>
                      )}
                      <p className="text-xs text-ink-400">Qty {i.quantity}</p>
                    </div>
                    <p className="tabular text-sm text-ink-900">{ql ? formatINR(ql.lineTotal) : "—"}</p>
                  </div>
                  );
                })}
              </div>
              <div className="mt-6 space-y-2 text-sm">
                <p className="text-ink-500">Delivering to <span className="text-ink-900">{addr.name || "—"}, {addr.line1}, {addr.city} {addr.pincode}</span></p>
                <p className="text-ink-500">Delivery <span className="text-ink-900">{quote?.deliveryName || "—"}{quote?.deliveryEta ? ` · ${quote.deliveryEta}` : ""}</span></p>
                <p className="text-ink-500">Branch <span className="text-ink-900">{branchLabel(branch)}</span></p>
                <p className="text-ink-500">Payment <span className="text-ink-900">{payment === "cod" ? "Pay on delivery" : "Razorpay (online)"}</span></p>
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
              <button
                onClick={() => {
                  if (step === 0) {
                    const missing = !addr.name.trim() || !addr.phone.trim() || !addr.email.trim() || !addr.line1.trim() || !addr.city.trim() || !addr.pincode.trim();
                    if (missing) {
                      alert("Please fill in name, phone, email, and full address before continuing — we need the email to send your order confirmation.");
                      return;
                    }
                    if (!/^\d{10}$/.test(addr.phone)) {
                      alert("Please enter a valid 10-digit mobile number.");
                      return;
                    }
                    if (!/^\d{6}$/.test(addr.pincode)) {
                      alert("Please enter a valid 6-digit PIN code.");
                      return;
                    }
                    if (!/^\S+@\S+\.\S+$/.test(addr.email.trim())) {
                      alert("That email doesn't look right — please double-check it.");
                      return;
                    }
                  }
                  setStep(step + 1);
                }}
                className="btn-gold-solid"
              >
                Continue
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={placeOrder}
                  disabled={placing || !canPlace}
                  className="btn-gold-solid disabled:opacity-60"
                >
                  {placing
                    ? "Placing…"
                    : quote
                      ? `${payment === "cod" ? "Place order" : "Pay"} · ${formatINR(quote.total)}`
                      : "Pricing your order…"}
                </button>
                {!canPlace && blockedBecause && (
                  <p className="flex max-w-xs items-start gap-1.5 text-right text-[11px] text-ink-500">
                    <AlertCircle className="mt-px h-3 w-3 shrink-0 text-danger" />
                    <span>{blockedBecause}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-6">
            <h3 className="heading-serif text-lg text-ink-900">Summary</h3>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Subtotal" value={quote ? formatINR(quote.subtotal) : "—"} />
              {quote && quote.discount > 0 && (
                <div className="flex justify-between text-success">
                  <span>Discount{quote.couponCode ? ` (${quote.couponCode})` : ""}</span>
                  <span className="tabular">−{formatINR(quote.discount)}</span>
                </div>
              )}
              <Row label="Shipping" value={quote ? (quote.shipping === 0 ? "Free" : formatINR(quote.shipping)) : "—"} />
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-4">
              <span className="text-xs uppercase tracking-[0.18em] text-ink-500">Total</span>
              <span className={cn("tabular font-display text-2xl text-ink-900 transition-opacity", quoting && "opacity-50")}>{quote ? formatINR(quote.total) : "—"}</span>
            </div>
            {quote && quote.gst > 0 && (
              <p className="mt-1 text-right text-[11px] text-ink-400">
                Includes GST of {formatINR(quote.gst)}
                {intra
                  ? ` (${gstLabels.cgst} ${formatINR(quote.cgst)} + ${gstLabels.sgst} ${formatINR(quote.sgst)})`
                  : ` (${gstLabels.igst})`}
              </p>
            )}
            {quoteError && (
              <p className="mt-3 text-xs text-danger">
                {quoteError}{" "}
                <button onClick={refresh} className="underline">Retry</button>
              </p>
            )}
            {issues.map((i, n) => (
              <p key={n} className="mt-3 text-xs text-danger">
                {i.message}
                {i.kind === "coupon" && (
                  <button onClick={() => setCouponCode("")} className="ml-2 underline">Remove coupon</button>
                )}
              </p>
            ))}
            {!couponIssue && couponCode && quote?.couponCode && (
              <p className="mt-3 text-[11px] text-ink-400">
                Coupon {quote.couponCode} applied.{" "}
                <button onClick={() => setCouponCode("")} className="underline">Remove</button>
              </p>
            )}
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
      <span className="field-label">{label}</span>
      <input {...rest} className="field" />
    </label>
  );
}

function DeliveryOption({ title, desc, price, note, active, onClick }: { title: string; desc: string; price: string; note?: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("relative w-full rounded-2xl border p-5 text-left transition-all", active ? "border-gold-500 bg-gold-50/40" : "border-ink-200 hover:border-ink-300")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={cn("mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2", active ? "border-gold-500" : "border-ink-300")}>
            {active && <span className="h-2 w-2 rounded-full bg-gold-500" />}
          </span>
          <div className="min-w-0">
            <p className="heading-serif text-base text-ink-900">{title}</p>
            {desc && <p className="mt-1 text-xs text-ink-500">{desc}</p>}
            {note && <p className="mt-1 text-xs text-danger">{note}</p>}
          </div>
        </div>
        <p className="tabular shrink-0 text-sm font-bold text-ink-900">{price}</p>
      </div>
    </button>
  );
}

function PaymentOption({
  title,
  desc,
  icon,
  active,
  onClick,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition-all",
        active ? "border-gold-500 bg-gold-50/40" : "border-ink-200 hover:border-ink-300",
      )}
    >
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full border",
          active ? "border-gold-500 bg-ivory-50 text-gold-600" : "border-ink-200 text-ink-400",
        )}
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-ink-900">{title}</span>
        <span className="mt-1 block text-xs text-ink-500">{desc}</span>
      </span>
      <span className={cn("mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2", active ? "border-gold-500" : "border-ink-300")}>
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
