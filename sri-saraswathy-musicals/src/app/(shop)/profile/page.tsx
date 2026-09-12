"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useProducts } from "@/lib/client/catalog";
import { ProductImage } from "@/components/ui/ProductImage";
import { formatINR } from "@/lib/utils";
import { useAuth } from "@/lib/store/auth";
import type { Order, User as UserType } from "@/types";
import { User, Package, MapPin, Heart, LogOut, ChevronRight, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "orders" | "profile" | "addresses" | "wishlist";

export default function ProfilePage() {
  const router = useRouter();
  const loggedIn = useAuth((s) => s.loggedIn);
  const logout = useAuth((s) => s.logout);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("orders");
  const { products } = useProducts();
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [me, setMe] = useState<UserType | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && !loggedIn) router.replace("/auth/login");
  }, [mounted, loggedIn, router]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/users/c001").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/orders").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([u, o]) => {
      if (!alive) return;
      setMe(u);
      setOrders(o);
      setDataLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Wait for the persisted session to hydrate before deciding what to show,
  // so a signed-in visitor is never flashed back to the login screen.
  if (!mounted || !loggedIn) return null;
  if (dataLoading) {
    return <div className="container-page py-32 text-center text-ink-400">Loading your account…</div>;
  }
  if (!me) {
    return <div className="container-page py-32 text-center text-ink-400">Couldn&rsquo;t load your profile. Please try again.</div>;
  }

  const signOut = () => {
    logout();
    router.push("/auth/login");
  };

  const menu: { id: Tab; label: string; icon: typeof Package; count?: number }[] = [
    { id: "orders", label: "My orders", icon: Package, count: orders.length },
    { id: "profile", label: "Profile", icon: User },
    { id: "addresses", label: "Addresses", icon: MapPin, count: 2 },
    { id: "wishlist", label: "Wishlist", icon: Heart, count: 4 },
  ];

  const stats = [
    { label: "Orders", value: orders.length },
    { label: "Wishlist", value: 4 },
    { label: "Addresses", value: 2 },
  ];

  return (
    <div className="container-page py-8 md:py-12">
      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative mb-6 overflow-hidden border border-ink-100 bg-gradient-to-br from-ink-900 via-ink-900 to-ink-800 text-ivory-100"
      >
        {/* faint staff-line motif */}
        <svg aria-hidden viewBox="0 0 1400 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 top-1/2 h-24 w-full -translate-y-1/2 text-gold-400/10">
          {[16, 40, 64, 88, 112].map((y) => (
            <line key={y} x1="0" y1={y} x2="1400" y2={y} stroke="currentColor" strokeWidth="1.5" />
          ))}
        </svg>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(60% 120% at 85% 0%, rgba(201,162,75,0.16) 0%, transparent 60%)" }}
        />

        <div className="relative flex flex-col items-start justify-between gap-6 p-6 md:flex-row md:items-center md:p-8">
          <div className="flex items-center gap-5">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-gold-300 to-gold-500 font-display text-2xl text-ink-900 ring-2 ring-gold-400/40 ring-offset-2 ring-offset-ink-900 md:h-20 md:w-20 md:text-3xl">
              {me.name.split(" ").map((s) => s[0]).join("")}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-gold-400">Welcome back</p>
              <p className="heading-serif mt-1 text-2xl text-ivory-50 md:text-3xl">{me.name}</p>
              <p className="mt-1 text-xs text-ivory-100/60">{me.email}</p>
              <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-300">
                Patron · since March 2023
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin" className="btn-gold-solid">
              <Settings className="h-3.5 w-3.5" />
              Admin panel
            </Link>
            <button onClick={signOut} className="text-xs uppercase tracking-[0.18em] text-ivory-100/60 transition-colors hover:text-gold-400">
              <LogOut className="mr-1 inline h-3 w-3" /> Sign out
            </button>
          </div>
        </div>

        {/* stats strip */}
        <div className="relative grid grid-cols-3 border-t border-ivory-100/10">
          {stats.map((s) => (
            <div key={s.label} className="border-r border-ivory-100/10 px-6 py-4 last:border-r-0">
              <p className="tabular font-display text-2xl text-gold-300 md:text-3xl">{s.value}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-ivory-100/50">{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        {/* Side nav */}
        <aside className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-col md:gap-1 md:px-0">
          {menu.map((m) => {
            const Icon = m.icon;
            const active = tab === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setTab(m.id)}
                className={cn(
                  "flex shrink-0 items-center justify-between gap-3 border px-4 py-3 text-left text-sm transition-all md:border-transparent",
                  active
                    ? "border-gold-400 bg-gold-50 text-ink-900 md:border-l-2 md:border-l-gold-500 md:border-y-0 md:border-r-0 md:bg-transparent"
                    : "border-ink-100 text-ink-600 hover:text-ink-900 md:hover:bg-ivory-100",
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{m.label}</span>
                </div>
                {m.count !== undefined && <span className="text-xs text-ink-400">{m.count}</span>}
              </button>
            );
          })}
        </aside>

        {/* Content */}
        <div>
          {tab === "orders" && (
            <div className="space-y-4">
              <h2 className="heading-serif text-2xl text-ink-900">Your orders</h2>
              {orders.length === 0 && (
                <p className="border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
                  No orders yet. Your placed orders will appear here.
                </p>
              )}
              {orders.map((o, i) => (
                <motion.div key={o.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.06 }}
                  className="border border-ink-100 bg-ivory-50 p-5 transition-colors hover:border-gold-200">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 pb-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-ink-400">Order #{o.id.toUpperCase()}</p>
                      <p className="mt-1 text-sm text-ink-500">Placed on {o.date}</p>
                    </div>
                    <span className={cn(
                      "px-3 py-1 text-[10px] font-semibold uppercase tracking-widest",
                      o.status === "delivered" && "bg-success/10 text-success",
                      o.status === "shipped" && "bg-info/10 text-info",
                      o.status === "processing" && "bg-warning/10 text-warning",
                      o.status === "cancelled" && "bg-danger/10 text-danger",
                    )}>{o.status}</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {o.items.map((item) => {
                      const p = byId.get(item.productId);
                      if (!p) return null;
                      return (
                        <Link href={`/product/${p.slug}`} key={item.productId} className="flex items-center gap-4 py-2">
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden bg-ink-100">
                            <ProductImage product={p} sizes="56px" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] uppercase tracking-widest text-gold-600">{p.brand}</p>
                            <p className="heading-serif text-base text-ink-900">{p.name}</p>
                            <p className="text-xs text-ink-400">Qty {item.quantity}</p>
                          </div>
                          <p className="tabular text-sm text-ink-900">{formatINR(item.price)}</p>
                          <ChevronRight className="h-4 w-4 text-ink-300" />
                        </Link>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-end justify-between border-t border-ink-100 pt-4">
                    <div className="text-xs text-ink-500">Delivered to {o.address}</div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-widest text-ink-400">Total</p>
                      <p className="tabular font-display text-lg text-ink-900">{formatINR(o.total)}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {tab === "profile" && (
            <div>
              <h2 className="heading-serif text-2xl text-ink-900">Your profile</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <ProfileRow label="Full name" value={me.name} />
                <ProfileRow label="Email" value={me.email} />
                <ProfileRow label="Phone" value={me.phone} />
                <ProfileRow label="Last login" value={me.lastLogin} />
                <ProfileRow label="Member since" value="March 2023" />
                <ProfileRow label="Account status" value="Active · Verified" />
              </div>
              <button className="btn-gold-solid mt-8">Edit profile</button>
            </div>
          )}

          {tab === "addresses" && (
            <div>
              <h2 className="heading-serif text-2xl text-ink-900">Saved addresses</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="border border-gold-400 bg-gold-50/40 p-5">
                  <div className="flex items-start justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gold-600">Home · Default</p>
                    <button className="text-xs text-ink-500 hover:text-ink-900">Edit</button>
                  </div>
                  <p className="mt-3 heading-serif text-lg text-ink-900">Arjun Rao</p>
                  <p className="mt-1 text-sm text-ink-600">12 Adyar Main Road<br />Near LB Road Metro<br />Chennai 600020</p>
                  <p className="mt-2 text-xs text-ink-500">+91 98876 54321</p>
                </div>
                <div className="border border-ink-100 bg-ivory-50 p-5">
                  <div className="flex items-start justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Office</p>
                    <button className="text-xs text-ink-500 hover:text-ink-900">Edit</button>
                  </div>
                  <p className="mt-3 heading-serif text-lg text-ink-900">Arjun Rao</p>
                  <p className="mt-1 text-sm text-ink-600">TechPark Tower B, Level 7<br />Old Mahabalipuram Road<br />Chennai 600096</p>
                  <p className="mt-2 text-xs text-ink-500">+91 98876 54321</p>
                </div>
              </div>
              <button className="btn-ghost mt-6">+ Add new address</button>
            </div>
          )}

          {tab === "wishlist" && (
            <div>
              <h2 className="heading-serif text-2xl text-ink-900">Your wishlist</h2>
              <p className="mt-6 border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
                Nothing saved yet. Save any instrument you want to come back to.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink-100 bg-ivory-50 p-4 transition-colors hover:border-gold-200">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">{label}</p>
      <p className="mt-2 text-sm text-ink-900">{value}</p>
    </div>
  );
}
