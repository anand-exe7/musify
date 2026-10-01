"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useCart } from "@/lib/store/cart";
import { useAuth } from "@/lib/store/auth";
import { useGst, IN_STATES } from "@/lib/store/gst";
import { useQuote } from "@/lib/client/quote";
import { useShallow } from "zustand/react/shallow";
import { useProducts } from "@/lib/client/catalog";
import { ProductImage } from "@/components/ui/ProductImage";
import { findVariant, variantLabel } from "@/lib/catalog/variants";
import { formatINR } from "@/lib/utils";
import { BUSINESS } from "@/lib/data/business";
import { ChevronRight, Check, Lock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { OrderCelebration } from "@/components/OrderCelebration";
import type { UserAddress } from "@/types";

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
  const { products, loading: productsLoading } = useProducts();
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const user = useAuth((s) => s.user);
  const [step, setStep] = useState(0);
  const [branchPick, setBranch] = useState<"Branch 1" | "Branch 2" | null>(null);
  const payment = "card" as const;
  const [placed, setPlaced] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [placing, setPlacing] = useState(false);
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
    const out: Record<"Branch 1" | "Branch 2", string[]> = { "Branch 1": [], "Branch 2": [] };
    for (const i of cartItems) {
      const have = i.variant?.stockByBranch;
      if (!have) continue;
      for (const b of ["Branch 1", "Branch 2"] as const) {
        if ((have[b] ?? 0) < i.quantity) out[b].push(i.product.name);
      }
    }
    return out;
  }, [cartItems]);
  // Until the shopper chooses, start on the first store that can fill the cart.
  const branch: "Branch 1" | "Branch 2" =
    branchPick ?? (branchShort["Branch 1"].length === 0 ? "Branch 1" : branchShort["Branch 2"].length === 0 ? "Branch 2" : "Branch 1");

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
      alert("Couldn't load the payment window. Please check your connection and try again.");
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
                        className="flex w-full items-start gap-3 border border-ink-200 bg-ivory-50 p-3 text-left text-sm transition-colors hover:border-gold-400 hover:bg-gold-50/30"
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
                <Field label="Phone" value={addr.phone} onChange={setAddrField("phone")} />
                <Field label="Email" type="email" value={addr.email} onChange={setAddrField("email")} />
                <Field label="Pincode" value={addr.pincode} onChange={setAddrField("pincode")} />
                <div className="md:col-span-2"><Field label="Address line 1" value={addr.line1} onChange={setAddrField("line1")} /></div>
                <div className="md:col-span-2"><Field label="Address line 2 (optional)" value={addr.line2} onChange={setAddrField("line2")} /></div>
                <Field label="City" value={addr.city} onChange={setAddrField("city")} />
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
                <label className="block md:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Fulfilling branch</span>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value as "Branch 1" | "Branch 2")}
                    className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm text-ink-900 transition-colors focus:border-gold-500 focus:outline-none"
                  >
                    {BUSINESS.branches.map((b) => (
                      <option key={b.key} value={b.key}>
                        {b.key} — {b.city} · {b.area}
                        {branchShort[b.key as "Branch 1" | "Branch 2"].length > 0 ? " (can't supply your whole cart)" : ""}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1.5 block text-[11px] text-ink-500">Your order is billed and dispatched from this store.</span>
                  {branchShort[branch].length > 0 && (
                    <span className="mt-1.5 block text-[11px] font-medium text-danger">
                      {branch} is short on {branchShort[branch].join(", ")}.
                      {branchShort[branch === "Branch 1" ? "Branch 2" : "Branch 1"].length === 0
                        ? ` ${branch === "Branch 1" ? "Branch 2" : "Branch 1"} has everything — switch to it, or ask us about moving stock.`
                        : " Neither store has the whole cart; reduce a quantity or contact us."}
                    </span>
                  )}
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
                <DeliveryOption id="white-glove" active={delivery === "white-glove"} onClick={() => setDelivery("white-glove")} title="White-glove" desc="Instrument delivered, unpacked and set up in your home. 2 to 4 working days." price={quote ? (quote.shippingOptions["white-glove"] === 0 ? "Free" : formatINR(quote.shippingOptions["white-glove"])) : "—"} recommended />
                <DeliveryOption id="standard" active={delivery === "standard"} onClick={() => setDelivery("standard")} title="Standard" desc="Insured courier. 3 to 5 working days." price={quote ? (quote.shippingOptions.standard === 0 ? "Free" : formatINR(quote.shippingOptions.standard)) : "—"} />
                <DeliveryOption id="express" active={delivery === "express"} onClick={() => setDelivery("express")} title="Express" desc="Next-business-day, tier-1 cities only." price={quote ? formatINR(quote.shippingOptions.express) : "—"} />
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <h2 className="heading-serif text-xl text-ink-900">Payment method</h2>
              <div className="mt-6 border border-gold-500 bg-gold-50/40 p-5">
                <div className="flex items-start gap-4">
                  <div className="grid h-10 w-10 place-items-center border border-gold-500 bg-ivory-50">
                    <Lock className="h-4 w-4 text-gold-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink-900">Razorpay secure checkout</p>
                    <p className="mt-1 text-xs text-ink-500">
                      Pay with UPI, cards, net banking, or wallets in the Razorpay window on the next step.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <h2 className="heading-serif text-xl text-ink-900">Review your order</h2>
              <div className="mt-6 divide-y divide-ink-100 border border-ink-100 bg-ivory-50">
                {cartItems.map((i) => {
                  const ql = quoteLines.get(`${i.productId}::${i.variantKey}`);
                  return (
                  <div key={`${i.productId}::${i.variantKey}`} className="flex items-center gap-4 p-4">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-ink-100">
                      <ProductImage product={i.product} sizes="64px" />
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
                <p className="text-ink-500">Delivery <span className="text-ink-900">{delivery}</span></p>
                <p className="text-ink-500">Branch <span className="text-ink-900">{branch}</span></p>
                <p className="text-ink-500">Payment <span className="text-ink-900">Razorpay</span></p>
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
              <button
                onClick={placeOrder}
                disabled={placing || !canPlace}
                className="btn-gold-solid disabled:opacity-60"
              >
                {placing ? "Placing…" : quote ? `Place order · ${formatINR(quote.total)}` : "Pricing your order…"}
              </button>
            )}
          </div>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border border-ink-100 bg-ivory-50 p-6">
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-500">{label}</span>
      <span className="tabular text-ink-900">{value}</span>
    </div>
  );
}
