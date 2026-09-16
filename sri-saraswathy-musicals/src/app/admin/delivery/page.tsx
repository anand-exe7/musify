"use client";
import { useState } from "react";
import { useSettings, type Zone } from "@/lib/store/settings";
import { IN_STATES } from "@/lib/store/gst";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Truck, ChevronDown } from "lucide-react";

export default function DeliveryPage() {
  const s = useSettings();
  const [saved, setSaved] = useState(false);
  const [openStates, setOpenStates] = useState<string | null>(null);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };
  const cell = "w-full min-w-[64px] rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-sm text-ink-900 tabular focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";

  const toggleState = (z: Zone, state: string) => {
    const has = z.states.includes(state);
    const next = has ? z.states.filter((x) => x !== state) : [...z.states, state];
    s.updateZone(z.id, { states: next });
    flash();
  };

  const addZone = () => {
    s.addZone({
      id: crypto.randomUUID(),
      name: "New zone",
      states: [],
      charge: 0,
      eta: "",
      uptoGm250: 0,
      uptoGm500: 0,
      perAddl500: 0,
      above5kgPerKg: 0,
      above10kgPerKg: 0,
    });
    flash();
  };

  const num = (z: Zone, key: keyof Pick<Zone, "uptoGm250" | "uptoGm500" | "perAddl500" | "above5kgPerKg" | "above10kgPerKg">) => (
    <input
      type="number"
      value={z[key]}
      onChange={(e) => { s.updateZone(z.id, { [key]: Number(e.target.value) }); flash(); }}
      className={cell}
    />
  );

  return (
    <div className="p-5 md:p-8">
      {saved && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">
          Saved
        </div>
      )}

      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink-900 text-gold-400">
          <Truck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Delivery</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Courier tariff by state · surface transit, rates inclusive of GST
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-ink-100 bg-ivory-50 p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold text-ink-900">Delivery Zones</p>
          <button
            onClick={addZone}
            className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-2 text-xs font-semibold text-ivory-50 hover:bg-ink-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add Zone
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                <th className="py-2 pr-2">Zone</th>
                <th className="pr-2">States</th>
                <th className="pr-2 text-right">≤ 250 g</th>
                <th className="pr-2 text-right">≤ 500 g</th>
                <th className="pr-2 text-right">+ 500 g</th>
                <th className="pr-2 text-right">&gt; 5 kg / kg</th>
                <th className="pr-2 text-right">&gt; 10 kg / kg</th>
                <th className="pr-2">ETA</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {s.zones.map((z) => (
                <tr key={z.id} className="align-top">
                  <td className="py-2 pr-2">
                    <input
                      value={z.name}
                      onChange={(e) => s.updateZone(z.id, { name: e.target.value })}
                      className="w-full min-w-[160px] rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-sm focus:border-gold-500 focus:outline-none"
                    />
                  </td>
                  <td className="pr-2">
                    <StatePicker
                      value={z.states}
                      isOpen={openStates === z.id}
                      onToggleOpen={() => setOpenStates(openStates === z.id ? null : z.id)}
                      onToggleState={(st) => toggleState(z, st)}
                    />
                  </td>
                  <td className="pr-2">{num(z, "uptoGm250")}</td>
                  <td className="pr-2">{num(z, "uptoGm500")}</td>
                  <td className="pr-2">{num(z, "perAddl500")}</td>
                  <td className="pr-2">{num(z, "above5kgPerKg")}</td>
                  <td className="pr-2">{num(z, "above10kgPerKg")}</td>
                  <td className="pr-2">
                    <input
                      value={z.eta}
                      onChange={(e) => s.updateZone(z.id, { eta: e.target.value })}
                      placeholder="e.g. 2–3 days"
                      className="w-28 rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-sm focus:border-gold-500 focus:outline-none"
                    />
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => s.removeZone(z.id)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {s.zones.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-ink-400">
                    No zones yet — add one to price your first shipping band.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-ink-400">
          Rows match on the buyer&rsquo;s shipping state; a zone with no states is the fallback for
          anywhere unlisted. Rates are in whole rupees, GST-inclusive.
        </p>
      </div>
    </div>
  );
}

function StatePicker({
  value,
  isOpen,
  onToggleOpen,
  onToggleState,
}: {
  value: string[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onToggleState: (state: string) => void;
}) {
  const label = value.length === 0 ? "Fallback (any state)" : `${value.length} state${value.length === 1 ? "" : "s"}`;
  return (
    <div className="relative w-56">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center justify-between rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-left text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-ink-200 bg-ivory-50 shadow-lg">
          {IN_STATES.map((st) => (
            <label key={st} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs text-ink-800 hover:bg-ink-50">
              <input
                type="checkbox"
                checked={value.includes(st)}
                onChange={() => onToggleState(st)}
                className="h-3.5 w-3.5 accent-gold-500"
              />
              <span>{st}</span>
            </label>
          ))}
        </div>
      )}
      {value.length > 0 && (
        <p className="mt-1 line-clamp-2 text-[10px] text-ink-400">{value.join(", ")}</p>
      )}
    </div>
  );
}
