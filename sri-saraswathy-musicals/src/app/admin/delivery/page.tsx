"use client";
import { useState } from "react";
import { useSettings, type Zone } from "@/lib/store/settings";
import { formatINR, cn } from "@/lib/utils";
import { Plus, Trash2, Truck } from "lucide-react";

export default function DeliveryPage() {
  const s = useSettings();
  const [saved, setSaved] = useState(false);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };
  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="p-5 md:p-8">
      {saved && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">Saved</div>}
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink-900 text-gold-400"><Truck className="h-5 w-5" /></div>
        <div><h1 className="text-2xl font-bold text-ink-900">Delivery</h1><p className="mt-0.5 text-sm text-ink-500">Charges, free-shipping threshold &amp; zones</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* settings */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
            <p className="mb-4 text-sm font-bold text-ink-900">Rates</p>
            <label className={label}>Free delivery above (₹)</label>
            <input type="number" value={s.freeThreshold} onChange={(e) => { s.set({ freeThreshold: Number(e.target.value) }); flash(); }} className={field} />
            <label className={cn(label, "mt-4")}>Standard charge (₹)</label>
            <input type="number" value={s.standardCharge} onChange={(e) => { s.set({ standardCharge: Number(e.target.value) }); flash(); }} className={field} />
            <label className={cn(label, "mt-4")}>Express charge (₹)</label>
            <input type="number" value={s.expressCharge} onChange={(e) => { s.set({ expressCharge: Number(e.target.value) }); flash(); }} className={field} />
            <div className="mt-4 flex items-center justify-between rounded-lg border border-ink-100 bg-[#FAF7EF] px-3 py-2.5">
              <div><p className="text-sm font-semibold text-ink-900">In-store pickup</p><p className="text-xs text-ink-500">Allow customers to collect at a branch</p></div>
              <button onClick={() => { s.set({ storePickup: !s.storePickup }); flash(); }} className={cn("relative h-6 w-11 rounded-full transition-colors", s.storePickup ? "bg-success" : "bg-ink-300")}>
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", s.storePickup ? "left-[22px]" : "left-0.5")} />
              </button>
            </div>
          </div>
        </div>

        {/* zones */}
        <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-bold text-ink-900">Delivery Zones</p>
            <button onClick={() => s.addZone({ id: crypto.randomUUID(), name: "New zone", charge: 0, eta: "" })} className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-2 text-xs font-semibold text-ivory-50 hover:bg-ink-800"><Plus className="h-3.5 w-3.5" /> Add Zone</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400"><th className="py-2">Zone</th><th>Charge (₹)</th><th>ETA</th><th className="text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-ink-50">
                {s.zones.map((z: Zone) => (
                  <tr key={z.id}>
                    <td className="py-2 pr-2"><input value={z.name} onChange={(e) => s.updateZone(z.id, { name: e.target.value })} className="w-full min-w-[160px] rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-sm focus:border-gold-500 focus:outline-none" /></td>
                    <td className="pr-2"><input type="number" value={z.charge} onChange={(e) => s.updateZone(z.id, { charge: Number(e.target.value) })} className="w-24 rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-sm focus:border-gold-500 focus:outline-none" /></td>
                    <td className="pr-2"><input value={z.eta} onChange={(e) => s.updateZone(z.id, { eta: e.target.value })} placeholder="e.g. 2–3 days" className="w-28 rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-sm focus:border-gold-500 focus:outline-none" /></td>
                    <td className="text-right"><button onClick={() => s.removeZone(z.id)} className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-ink-400">Free delivery applies automatically on orders above {formatINR(s.freeThreshold)}. Charges here are suggestions the cashier can override per bill in the POS panel.</p>
        </div>
      </div>
    </div>
  );
}
