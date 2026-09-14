"use client";
import { useEffect, useState } from "react";
import { Building2, ShieldCheck, Check } from "lucide-react";
import { useAuth } from "@/lib/store/auth";
import type { BranchProfile } from "@/lib/db/queries/branches";
import { cn } from "@/lib/utils";

export default function BranchesPage() {
  const isAdmin = useAuth((s) => s.isAdmin);
  const authHydrated = useAuth((s) => s.hydrated);

  const [branches, setBranches] = useState<BranchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (authHydrated && !isAdmin) {
      setLoading(false);
      return;
    }
    if (!isAdmin) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/branches", { cache: "no-store" });
        if (res.ok && alive) setBranches((await res.json()) as BranchProfile[]);
      } catch {
        /* keep empty */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAdmin, authHydrated]);

  const setField = (id: string, patch: Partial<BranchProfile>) =>
    setBranches((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const save = async (b: BranchProfile) => {
    try {
      const res = await fetch(`/api/branches/${encodeURIComponent(b.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: b.name, city: b.city, address: b.address, gstin: b.gstin, phone: b.phone, active: b.active }),
      });
      if (!res.ok) throw new Error("save failed");
      setSavedId(b.id);
      setTimeout(() => setSavedId((s) => (s === b.id ? null : s)), 1800);
    } catch {
      alert("Couldn't save the branch. Try again.");
    }
  };

  if (authHydrated && !isAdmin) {
    return (
      <div className="p-5 md:p-8">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-ink-100 bg-ivory-50 px-6 py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-ink-300" />
          <h1 className="text-lg font-bold text-ink-900">Admins only</h1>
          <p className="text-sm text-ink-500">Only a full admin can manage branch details.</p>
        </div>
      </div>
    );
  }

  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6 border-l-4 border-ink-900 pl-4">
        <h1 className="text-2xl font-bold text-ink-900">Branches</h1>
        <p className="mt-1 text-sm text-ink-500">Address and per-branch GSTIN used on invoices &amp; reports</p>
      </div>

      {loading && <p className="text-sm text-ink-400">Loading branches…</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        {branches.map((b) => (
          <section key={b.id} className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gold-600" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-ink-900">{b.id}</h2>
              </div>
              <button
                onClick={() => setField(b.id, { active: !b.active })}
                className={cn("rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", b.active ? "bg-success/15 text-success" : "bg-ink-100 text-ink-400")}
              >
                {b.active ? "Active" : "Inactive"}
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={label}>Area / Name</label><input value={b.name} onChange={(e) => setField(b.id, { name: e.target.value })} className={field} /></div>
              <div><label className={label}>City</label><input value={b.city} onChange={(e) => setField(b.id, { city: e.target.value })} className={field} /></div>
            </div>
            <label className={cn(label, "mt-4")}>Address</label>
            <input value={b.address} onChange={(e) => setField(b.id, { address: e.target.value })} className={field} />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><label className={label}>GSTIN</label><input value={b.gstin} onChange={(e) => setField(b.id, { gstin: e.target.value.toUpperCase() })} className={cn(field, "font-mono tracking-wide")} placeholder="33XXXXX0000X1ZV" /></div>
              <div><label className={label}>Phone</label><input value={b.phone} onChange={(e) => setField(b.id, { phone: e.target.value })} className={field} /></div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => save(b)}
                className="flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-ink-800"
              >
                {savedId === b.id ? <><Check className="h-4 w-4 text-success" /> Saved</> : "Save"}
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
