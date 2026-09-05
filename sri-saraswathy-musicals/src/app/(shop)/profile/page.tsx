"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { currentUser } from "@/lib/data/users";
import { customerOrders } from "@/lib/data/invoices";
import { getProductById } from "@/lib/data/products";
import { ProductImage } from "@/components/ui/ProductImage";
import { formatINR } from "@/lib/utils";
import { User, Package, MapPin, Heart, LogOut, ChevronRight, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "orders" | "profile" | "addresses" | "wishlist";

export default function ProfilePage() {
  const [tab, setTab] = useState<Tab>("orders");

  const menu: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: "orders", label: "My orders", icon: Package, count: customerOrders.length },
    { id: "profile", label: "Profile", icon: User },
    { id: "addresses", label: "Addresses", icon: MapPin, count: 2 },
    { id: "wishlist", label: "Wishlist", icon: Heart, count: 4 },
  ];

  return (
    <div className="container-page py-8 md:py-12">
      {/* Header card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="mb-8 flex flex-col items-start justify-between gap-4 border border-ink-100 bg-gradient-to-br from-ink-900 to-ink-800 p-6 text-ivory-100 md:flex-row md:items-center md:p-8">
        <div className="flex items-center gap-5">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-gold-500 font-display text-2xl text-ink-900 md:h-20 md:w-20 md:text-3xl">
            {currentUser.name.split(" ").map(s => s[0]).join("")}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-gold-400">Welcome back</p>
            <p className="heading-serif mt-1 text-2xl text-ivory-100 md:text-3xl">{currentUser.name}</p>
            <p className="mt-1 text-xs text-ivory-100/60">{currentUser.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin" className="btn-gold-solid">
            <Settings className="h-3.5 w-3.5" />
            Admin panel
          </Link>
          <Link href="/auth/login" className="text-xs uppercase tracking-[0.18em] text-ivory-100/60 hover:text-gold-400">
            <LogOut className="mr-1 inline h-3 w-3" /> Sign out
          </Link>
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
                onClick={() => setTab(m.id as Tab)}
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
              {customerOrders.map((o, i) => (
                <motion.div key={o.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="border border-ink-100 bg-ivory-50 p-5">
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
                      const p = getProductById(item.productId);
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
                <ProfileRow label="Full name" value={currentUser.name} />
                <ProfileRow label="Email" value={currentUser.email} />
                <ProfileRow label="Phone" value={currentUser.phone} />
                <ProfileRow label="Last login" value={currentUser.lastLogin} />
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
    <div className="border border-ink-100 bg-ivory-50 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">{label}</p>
      <p className="mt-2 text-sm text-ink-900">{value}</p>
    </div>
  );
}
