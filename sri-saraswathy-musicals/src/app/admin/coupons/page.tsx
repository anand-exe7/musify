"use client";
import { useState } from "react";
import { usePOS, type Coupon } from "@/lib/store/pos";
import { formatINR, cn } from "@/lib/utils";
import { Info, RefreshCw, Search, Wand2 } from "lucide-react";

function toDMY(v: string) {
  if (!v) return "—";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}

export default function CouponsPage() {
  const coupons = usePOS((s) => s.coupons);
  const addCoupon = usePOS((s) => s.addCoupon);
  const updateCoupon = usePOS((s) => s.updateCoupon);
  const deleteCoupon = usePOS((s) => s.deleteCoupon);

  const [code, setCode] = useState("");
  const [pct, setPct] = useState<number | "">("");
  const [minOrder, setMinOrder] = useState<number | "">("");
  const [expiry, setExpiry] = useState("");
  const [limit, setLimit] = useState<number | "">("");
  const [query, setQuery] = useState("");
  const [editCode, setEditCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const generate = () => {
    const s = Math.random().toString(36).slice(2, 6).toUpperCase();
    setCode(`SSM${s}`);
  };

  const create = () => {
    if (!code.trim() || !pct) { setMsg("Code and discount % are required."); setTimeout(() => setMsg(null), 2500); return; }
    const c: Coupon = {
      code: code.trim().toUpperCase(),
      discountPct: Number(pct),
      minOrder: Number(minOrder) || 0,
      expiry: expiry ? toDMY(expiry) : "No expiry",
      usageLimit: Number(limit) || 0,
      remaining: Number(limit) || 0,
    };
    if (editCode) updateCoupon(editCode, c);
    else addCoupon(c);
    setMsg(editCode ? `Updated ${c.code}` : `Created ${c.code}`);
    setTimeout(() => setMsg(null), 2500);
    setCode(""); setPct(""); setMinOrder(""); setExpiry(""); setLimit(""); setEditCode(null);
  };

  const startEdit = (c: Coupon) => {
    setEditCode(c.code); setCode(c.code); setPct(c.discountPct); setMinOrder(c.minOrder || "");
    setLimit(c.usageLimit || ""); setExpiry("");
  };

  const filtered = coupons.filter((c) => c.code.toLowerCase().includes(query.toLowerCase()));
  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="p-5 md:p-8">
      {msg && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{msg}</div>}
      <h1 className="mb-5 text-2xl font-bold text-ink-900">Coupon Management</h1>

      <div className="mb-6 flex items-center gap-2 rounded-xl border border-info/30 bg-info/[0.06] px-4 py-3 text-sm text-ink-700">
        <Info className="h-4 w-4 shrink-0 text-info" /> Coupon discount applies to the product subtotal only — not the delivery charge.
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* form */}
        <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
          <p className="mb-4 text-lg font-bold text-ink-900">{editCode ? `Edit ${editCode}` : "+ New Coupon"}</p>
          <label className={label}>Coupon Code *</label>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="E.G. SUMMER20" className={field} disabled={!!editCode} />
            <button onClick={generate} disabled={!!editCode} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ink-900 px-3 text-xs font-semibold text-ivory-50 hover:bg-ink-800 disabled:opacity-40"><Wand2 className="h-3.5 w-3.5" /> Generate</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div><label className={label}>Discount % *</label><input type="number" value={pct} onChange={(e) => setPct(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 15" className={field} /></div>
            <div><label className={label}>Min Order (₹)</label><input type="number" value={minOrder} onChange={(e) => setMinOrder(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 1000" className={field} /></div>
            <div><label className={label}>Expiry Date</label><input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={field} /></div>
            <div><label className={label}>Usage Limit</label><input type="number" value={limit} onChange={(e) => setLimit(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 50" className={field} /></div>
          </div>
          <button onClick={create} className="mt-5 w-full rounded-xl bg-ink-900 py-3.5 text-sm font-bold uppercase tracking-wider text-ivory-50 hover:bg-ink-800">{editCode ? "Save Coupon" : "Create Coupon"}</button>
          {editCode && <button onClick={() => { setEditCode(null); setCode(""); setPct(""); setMinOrder(""); setExpiry(""); setLimit(""); }} className="mt-2 w-full rounded-xl border border-ink-200 py-2.5 text-sm font-semibold text-ink-600 hover:bg-ink-900/5">Cancel edit</button>}
        </div>

        {/* list */}
        <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-lg font-bold text-ink-900">All Coupons ({coupons.length})</p>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-400"><RefreshCw className="h-3.5 w-3.5" /> Live</span>
          </div>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2"><Search className="h-3.5 w-3.5 text-ink-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search coupons by code…" className="w-full bg-transparent text-sm focus:outline-none" /></div>
          <div className="space-y-3">
            {filtered.map((c) => (
              <div key={c.code} className="rounded-xl border border-ink-100 bg-[#FAF7EF] p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-ink-900">{c.code}</p>
                    <p className="mt-0.5 text-sm font-semibold text-success">{c.discountPct}% off · min {formatINR(c.minOrder)}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wider text-ink-400">{c.remaining} remaining · expires {c.expiry}</p>
                  </div>
                  <div className="flex gap-3 text-xs font-bold uppercase">
                    <button onClick={() => startEdit(c)} className="text-info hover:underline">Edit</button>
                    <button onClick={() => deleteCoupon(c.code)} className="text-danger hover:underline">Del</button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="py-8 text-center text-sm text-ink-400">No coupons found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
