"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useProductsByIds } from "@/lib/client/catalog";
import { ProductImage } from "@/components/ui/ProductImage";
import { formatINR } from "@/lib/utils";
import { useAuth } from "@/lib/store/auth";
import type { Order, User as UserType, UserAddress } from "@/types";
import {
  User,
  Package,
  MapPin,
  LogOut,
  ChevronRight,
  Settings,
  Pencil,
  Plus,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "orders" | "profile" | "addresses";

/* ─── helpers ──────────────────────────────────────────────────── */

function Input({
  label,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">
        {label}
      </span>
      <input
        {...rest}
        className="field"
      />
    </label>
  );
}

function Select({
  label,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">
        {label}
      </span>
      <select
        {...rest}
        className="field"
      >
        {children}
      </select>
    </label>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-4 transition-colors hover:border-gold-200">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">{label}</p>
      <p className="mt-2 text-sm text-ink-900">{value}</p>
    </div>
  );
}

/* ─── Modal shell ────────────────────────────────────────────────── */
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
        >
          <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="relative w-full max-w-lg rounded-3xl border border-ink-200 bg-ivory-50 p-6 shadow-2xl md:p-8"
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="heading-serif text-xl text-ink-900">{title}</h3>
              <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-900/5 hover:text-ink-900">
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Address form ────────────────────────────────────────────────── */
const BLANK_ADDR = {
  name: "", phone: "", type: "home", line1: "", line2: "", city: "", state: "Tamil Nadu", pincode: "", isDefault: false,
};

type AddrForm = typeof BLANK_ADDR;

function AddressForm({
  initial,
  onSave,
  saving,
}: {
  initial: AddrForm;
  onSave: (d: AddrForm) => void;
  saving: boolean;
}) {
  const [d, setD] = useState<AddrForm>(initial);
  const set = (k: keyof AddrForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD((p) => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const setDigits = (k: "phone" | "pincode", max: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value.replace(/\D/g, "").slice(0, max) }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Recipient name" value={d.name} onChange={set("name")} required />
        <Input label="Phone" value={d.phone} onChange={setDigits("phone", 10)} inputMode="numeric" maxLength={10} placeholder="10-digit mobile" />
      </div>
      <Select label="Address type" value={d.type} onChange={set("type")}>
        <option value="home">Home</option>
        <option value="office">Office</option>
        <option value="other">Other</option>
      </Select>
      <Input label="Address line 1" value={d.line1} onChange={set("line1")} required />
      <Input label="Address line 2 (optional)" value={d.line2} onChange={set("line2")} />
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="City" value={d.city} onChange={set("city")} required />
        <Input label="Pincode" value={d.pincode} onChange={setDigits("pincode", 6)} inputMode="numeric" maxLength={6} placeholder="6-digit PIN code" required />
      </div>
      <Input label="State" value={d.state} onChange={set("state")} />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" checked={d.isDefault} onChange={set("isDefault")} className="accent-gold-500" />
        Set as my default address
      </label>
      <button
        disabled={saving || !d.name || !d.line1 || !d.city || !d.pincode}
        onClick={() => onSave(d)}
        className="btn-gold-solid mt-2 w-full disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save address"}
      </button>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────── */
export default function ProfilePage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const isAdmin = useAuth((s) => s.isAdmin);
  const hydrated = useAuth((s) => s.hydrated);
  const logout = useAuth((s) => s.logout);
  const [tab, setTab] = useState<Tab>("orders");

  const [me, setMe] = useState<UserType | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  // Only the products in past orders are fetched, not the whole catalogue.
  const { byId } = useProductsByIds(orders.flatMap((o) => o.items.map((i) => i.productId)));
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // ── Edit profile modal ──
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Address modals ──
  const [addAddrOpen, setAddAddrOpen] = useState(false);
  const [editAddr, setEditAddr] = useState<UserAddress | null>(null);
  const [savingAddr, setSavingAddr] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Redirect if not logged in ──
  useEffect(() => {
    if (hydrated && !user) router.replace("/auth/login?redirect=%2Fprofile");
  }, [hydrated, user, router]);

  // ── Load profile + orders + addresses ──
  useEffect(() => {
    if (!user) return;
    let alive = true;
    setDataLoading(true);
    Promise.all([
      fetch(`/api/users/${user.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/orders/mine").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/addresses").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([u, o, a]) => {
      if (!alive) return;
      setMe(u);
      setOrders(o);
      setAddresses(a);
      setDataLoading(false);
    });
    return () => { alive = false; };
  }, [user]);

  if (!hydrated || !user) return null;
  if (dataLoading) {
    return <div className="container-page py-32 text-center text-ink-400">Loading your account…</div>;
  }

  /* ── Derived display values ── */
  const displayName = me?.name ?? user.name;
  const displayEmail = me?.email ?? user.email;
  const displayPhone = me?.phone || "—";
  const memberSince = me?.lastLogin
    ? (() => {
        // Use createdAt approximation — show last login date nicely
        return "—";
      })()
    : "—";

  // Member since: the earliest order date or "—"
  const firstOrderDate = orders.length
    ? orders.reduce((earliest, o) => (o.date < earliest ? o.date : earliest), orders[0].date)
    : null;

  const signOut = () => { logout(); router.push("/auth/login"); };

  const menu: { id: Tab; label: string; icon: typeof Package; count?: number }[] = [
    { id: "orders", label: "My orders", icon: Package, count: orders.length },
    { id: "profile", label: "Profile", icon: User },
    { id: "addresses", label: "Addresses", icon: MapPin, count: addresses.length },
  ];

  const stats = [
    { label: "Orders", value: orders.length },
    { label: "Addresses", value: addresses.length },
  ];

  /* ── Profile save ── */
  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setMe(updated);
        setEditProfileOpen(false);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  /* ── Address save (add) ── */
  const handleAddAddress = async (form: AddrForm) => {
    setSavingAddr(true);
    try {
      const res = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const created: UserAddress = await res.json();
        setAddresses((prev) =>
          form.isDefault
            ? [created, ...prev.map((a) => ({ ...a, isDefault: false }))]
            : [...prev, created],
        );
        setAddAddrOpen(false);
      }
    } finally {
      setSavingAddr(false);
    }
  };

  /* ── Address save (edit) ── */
  const handleEditAddress = async (form: AddrForm) => {
    if (!editAddr) return;
    setSavingAddr(true);
    try {
      const res = await fetch(`/api/addresses/${editAddr.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const updated: UserAddress = await res.json();
        setAddresses((prev) =>
          form.isDefault
            ? prev.map((a) => a.id === updated.id ? updated : { ...a, isDefault: false })
            : prev.map((a) => (a.id === updated.id ? updated : a)),
        );
        setEditAddr(null);
      }
    } finally {
      setSavingAddr(false);
    }
  };

  /* ── Address delete ── */
  const handleDeleteAddress = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/addresses/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setAddresses((prev) => prev.filter((a) => a.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  /* ── Set default ── */
  const handleSetDefault = async (id: string) => {
    const res = await fetch(`/api/addresses/${id}/default`, { method: "POST" });
    if (res.ok) {
      setAddresses((prev) =>
        prev.map((a) => ({ ...a, isDefault: a.id === id })),
      );
    }
  };

  /* ─────────────────────────────────────────────────────────────────── */
  return (
    <div className="container-page py-6 md:py-10">
      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative mb-5 overflow-hidden rounded-3xl border border-ink-100 bg-gradient-to-br from-ink-900 via-ink-900 to-ink-800 text-ivory-100"
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

        <div className="relative flex flex-col items-start justify-between gap-5 p-5 md:flex-row md:items-center md:p-6">
          <div className="flex items-center gap-4">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={displayName}
                loading="lazy"
                decoding="async"
                className="h-14 w-14 rounded-full object-cover ring-2 ring-gold-400/40 ring-offset-2 ring-offset-ink-900 md:h-16 md:w-16"
              />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-gold-300 to-gold-500 text-xl font-bold text-ink-900 ring-2 ring-gold-400/40 ring-offset-2 ring-offset-ink-900 md:h-16 md:w-16 md:text-2xl">
                {displayName.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-gold-400">Welcome back</p>
              <p className="heading-serif mt-0.5 text-xl text-ivory-50 md:text-2xl">{displayName}</p>
              <p className="mt-1 text-xs text-ivory-100/60">{displayEmail}</p>
              {firstOrderDate && (
                <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-300">
                  Patron · since {new Date(firstOrderDate).getFullYear()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link href="/admin" className="btn-gold-solid">
                <Settings className="h-3.5 w-3.5" />
                Admin panel
              </Link>
            )}
            <button onClick={signOut} className="rounded-full border border-ivory-100/20 px-4 py-2.5 text-xs uppercase tracking-[0.18em] text-ivory-100/70 transition-colors hover:border-gold-400/50 hover:text-gold-400">
              <LogOut className="mr-1 inline h-3 w-3" /> Sign out
            </button>
          </div>
        </div>

        {/* stats strip */}
        <div className="relative grid grid-cols-2 border-t border-ivory-100/10">
          {stats.map((s) => (
            <div key={s.label} className="border-r border-ivory-100/10 px-5 py-3 last:border-r-0">
              <p className="tabular text-2xl font-bold text-gold-300">{s.value}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-ivory-100/50">{s.label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
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
                  "flex shrink-0 items-center justify-between gap-3 rounded-full border px-4 py-2.5 text-left text-sm transition-all md:rounded-xl",
                  active
                    ? "border-ink-900 bg-ink-900 text-ivory-50"
                    : "border-ink-100 bg-ivory-50 text-ink-600 hover:border-gold-300 hover:text-ink-900",
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{m.label}</span>
                </div>
                {m.count !== undefined && <span className={cn("tabular text-xs", active ? "text-gold-300" : "text-ink-400")}>{m.count}</span>}
              </button>
            );
          })}
        </aside>

        {/* Content */}
        <div>
          {/* ── Orders ── */}
          {tab === "orders" && (
            <div className="space-y-4">
              <h2 className="heading-serif text-2xl text-ink-900">Your orders</h2>
              {orders.length === 0 && (
                <p className="rounded-2xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
                  No orders yet. Your placed orders will appear here.
                </p>
              )}
              {orders.map((o, i) => (
                <motion.div key={o.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.06 }}
                  className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 transition-colors hover:border-gold-200">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 pb-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-ink-400">Order #{o.id.toUpperCase()}</p>
                      <p className="mt-1 text-sm text-ink-500">Placed on {o.date}</p>
                    </div>
                    <span className={cn(
                      "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest",
                      o.status === "delivered" && "bg-success/10 text-success",
                      o.status === "shipped" && "bg-info/10 text-info",
                      o.status === "processing" && "bg-warning/10 text-warning",
                      o.status === "cancelled" && "bg-danger/10 text-danger",
                    )}>{o.status}</span>
                  </div>
                  {(o.status === "shipped" || o.status === "delivered") && (o.courier || o.trackingNo) && (
                    <p className="mt-4 rounded-xl bg-info/5 px-3 py-2 text-xs text-ink-700">
                      <span className="font-semibold">{o.status === "shipped" ? "On its way" : "Delivered"}</span>
                      {" · "}
                      {[o.courier, o.trackingNo ? `Tracking ${o.trackingNo}` : ""].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="mt-4 space-y-3">
                    {o.items.map((item) => {
                      const p = byId.get(item.productId);
                      if (!p) return null;
                      return (
                        <Link href={`/product/${p.slug}`} key={item.productId} className="flex items-center gap-4 py-2">
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-ink-100">
                            <ProductImage product={p} fit="contain" className="relative h-full w-full overflow-hidden bg-white p-1.5" sizes="56px" />
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
                    <div className="min-w-0">
                      <p className="truncate text-xs text-ink-500">Delivered to {o.address}</p>
                      <Link
                        href={`/invoice/${o.id}`}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:text-gold-700"
                      >
                        View invoice <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-widest text-ink-400">Total</p>
                      <p className="tabular font-display text-lg text-ink-900">{formatINR(o.total)}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* ── Profile ── */}
          {tab === "profile" && (
            <div>
              <h2 className="heading-serif text-2xl text-ink-900">Your profile</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <ProfileRow label="Full name" value={displayName} />
                <ProfileRow label="Email" value={displayEmail} />
                <ProfileRow label="Phone" value={displayPhone} />
                <ProfileRow label="Last login" value={me?.lastLogin || "—"} />
                <ProfileRow label="Member since" value={firstOrderDate ? new Date(firstOrderDate).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "—"} />
                <ProfileRow label="Account status" value={me?.active !== false ? "Active · Verified" : "Inactive"} />
              </div>
              <button
                onClick={() => { setProfileForm({ name: displayName, phone: displayPhone === "—" ? "" : displayPhone }); setEditProfileOpen(true); }}
                className="btn-gold-solid mt-8"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit profile
              </button>
            </div>
          )}

          {/* ── Addresses ── */}
          {tab === "addresses" && (
            <div>
              <h2 className="heading-serif text-2xl text-ink-900">Saved addresses</h2>
              {addresses.length === 0 && (
                <p className="mt-6 rounded-2xl border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
                  No saved addresses yet. Add one to speed up checkout.
                </p>
              )}
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {addresses.map((addr) => (
                  <motion.div
                    key={addr.id}
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      "relative rounded-2xl border p-5 transition-colors",
                      addr.isDefault
                        ? "border-gold-400 bg-gold-50/40"
                        : "border-ink-100 bg-ivory-50 hover:border-gold-200",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          "text-[10px] font-semibold uppercase tracking-widest",
                          addr.isDefault ? "text-gold-600" : "text-ink-500",
                        )}>
                          {addr.type.charAt(0).toUpperCase() + addr.type.slice(1)}
                          {addr.isDefault && " · Default"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!addr.isDefault && (
                          <button
                            onClick={() => handleSetDefault(addr.id)}
                            title="Set as default"
                            className="text-[10px] text-ink-400 underline-offset-2 hover:text-gold-600 hover:underline"
                          >
                            Set default
                          </button>
                        )}
                        <button
                          onClick={() => setEditAddr(addr)}
                          className="grid h-7 w-7 place-items-center text-ink-400 hover:text-ink-900"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteAddress(addr.id)}
                          disabled={deletingId === addr.id}
                          className="grid h-7 w-7 place-items-center text-ink-400 hover:text-danger disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 heading-serif text-lg text-ink-900">{addr.name}</p>
                    <p className="mt-1 text-sm text-ink-600">
                      {addr.line1}{addr.line2 ? <><br />{addr.line2}</> : null}<br />
                      {addr.city} {addr.pincode}<br />
                      {addr.state}
                    </p>
                    {addr.phone && <p className="mt-2 text-xs text-ink-500">{addr.phone}</p>}
                  </motion.div>
                ))}
              </div>
              <button
                onClick={() => setAddAddrOpen(true)}
                className="btn-ghost mt-6"
              >
                <Plus className="h-3.5 w-3.5" /> Add new address
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Edit profile modal ── */}
      <Modal open={editProfileOpen} onClose={() => setEditProfileOpen(false)} title="Edit profile">
        <div className="space-y-4">
          <Input
            label="Full name"
            value={profileForm.name}
            onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            label="Phone"
            value={profileForm.phone}
            onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit mobile"
          />
          <button
            disabled={savingProfile || !profileForm.name}
            onClick={handleSaveProfile}
            className="btn-gold-solid w-full disabled:opacity-60"
          >
            {savingProfile ? "Saving…" : <><Check className="h-3.5 w-3.5" /> Save changes</>}
          </button>
        </div>
      </Modal>

      {/* ── Add address modal ── */}
      <Modal open={addAddrOpen} onClose={() => setAddAddrOpen(false)} title="Add new address">
        <AddressForm
          initial={{ ...BLANK_ADDR }}
          onSave={handleAddAddress}
          saving={savingAddr}
        />
      </Modal>

      {/* ── Edit address modal ── */}
      <Modal open={!!editAddr} onClose={() => setEditAddr(null)} title="Edit address">
        {editAddr && (
          <AddressForm
            initial={{
              name: editAddr.name,
              phone: editAddr.phone,
              type: editAddr.type,
              line1: editAddr.line1,
              line2: editAddr.line2 ?? "",
              city: editAddr.city,
              state: editAddr.state,
              pincode: editAddr.pincode,
              isDefault: editAddr.isDefault,
            }}
            onSave={handleEditAddress}
            saving={savingAddr}
          />
        )}
      </Modal>
    </div>
  );
}
