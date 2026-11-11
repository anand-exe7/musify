"use client";
import { useMemo, useState } from "react";
import { useSettings, type Zone } from "@/lib/store/settings";
import { IN_STATES } from "@/lib/store/gst";
import { cn, formatINR } from "@/lib/utils";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { LoadErrorBanner, LoadingPanel } from "@/components/admin/LoadState";
import { Plus, Trash2, Truck, MapPin, Clock, X, Search, Globe2, Check } from "lucide-react";

type RateKey = keyof Pick<Zone, "uptoGm250" | "uptoGm500" | "perAddl500" | "above5kgPerKg" | "above10kgPerKg">;

const RATES: { key: RateKey; label: string; hint: string }[] = [
  { key: "uptoGm250", label: "Up to 250 g", hint: "Small parcel" },
  { key: "uptoGm500", label: "Up to 500 g", hint: "Charged at online checkout" },
  { key: "perAddl500", label: "Each extra 500 g", hint: "Added per 500 g" },
  { key: "above5kgPerKg", label: "Above 5 kg", hint: "Per kg" },
  { key: "above10kgPerKg", label: "Above 10 kg", hint: "Per kg" },
];

export default function DeliveryPage() {
  const s = useSettings();
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };

  // States already claimed by another zone (a state should only sit in one zone).
  const ownerOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of s.zones) for (const st of z.states) m.set(st, z.name || "another zone");
    return m;
  }, [s.zones]);

  const setStates = (z: Zone, states: string[]) => { s.updateZone(z.id, { states }); flash(); };

  const addZone = () => {
    const id = crypto.randomUUID();
    s.addZone({ id, name: "New zone", states: [], charge: 0, eta: "", uptoGm250: 0, uptoGm500: 0, perAddl500: 0, above5kgPerKg: 0, above10kgPerKg: 0 });
    flash();
  };

  const fallbacks = s.zones.filter((z) => z.states.length === 0);

  return (
    <div className="p-5 md:p-8">
      {saved && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">Saved</div>}
      <LoadErrorBanner message={s.loadError} onRetry={() => void s.hydrate()} />

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink-900 text-gold-400"><Truck className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Delivery</h1>
            <p className="mt-0.5 text-sm text-ink-500">Courier rates by state · surface transit · rates include GST</p>
          </div>
        </div>
        <button onClick={addZone} className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900">
          <Plus className="h-4 w-4" /> Add zone
        </button>
      </div>

      {/* How it works */}
      <div className="mb-6 grid gap-3 rounded-2xl border border-ink-100 bg-ivory-50 p-4 text-xs text-ink-600 md:grid-cols-3">
        <p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-gold-600" /><span>An order uses the zone that lists the buyer&rsquo;s <b className="text-ink-900">shipping state</b>.</span></p>
        <p className="flex gap-2"><Globe2 className="h-4 w-4 shrink-0 text-gold-600" /><span>A zone with <b className="text-ink-900">no states</b> is the fallback for every state not listed.</span></p>
        <p className="flex gap-2"><Truck className="h-4 w-4 shrink-0 text-gold-600" /><span>Online checkout charges the <b className="text-ink-900">up to 500 g</b> rate of that zone.</span></p>
      </div>

      {!s.hydrated && !s.loadError ? (
        <LoadingPanel label="Loading delivery zones…" />
      ) : (
        <div className="space-y-4">
          {fallbacks.length > 1 && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
              {fallbacks.length} zones have no states. Only the first one ({fallbacks[0].name}) is used as the fallback — add states to the others.
            </p>
          )}

          {s.zones.map((z) => {
            const fallback = z.states.length === 0;
            return (
              <section key={z.id} className="overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50 shadow-[0_1px_2px_rgba(10,9,8,0.03)]">
                <div className={cn("h-1", fallback ? "bg-gradient-to-r from-ink-400 to-ink-200" : "bg-gradient-to-r from-gold-500 to-gold-300")} />
                <div className="p-5">
                  {/* Name, ETA, delete */}
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[14rem] flex-1">
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">Zone name</label>
                      <input value={z.name} onChange={(e) => s.updateZone(z.id, { name: e.target.value })} className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-[15px] font-semibold text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20" />
                    </div>
                    <div className="w-full sm:w-44">
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">Delivery time</label>
                      <div className="relative">
                        <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                        <input value={z.eta} onChange={(e) => s.updateZone(z.id, { eta: e.target.value })} placeholder="e.g. 2–3 days" className="h-11 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20" />
                      </div>
                    </div>
                    {deleting === z.id ? (
                      <div className="flex h-11 items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 text-xs">
                        <span className="font-semibold text-ink-800">Delete zone?</span>
                        <button onClick={() => { s.removeZone(z.id); setDeleting(null); flash(); }} className="rounded-lg bg-danger px-2.5 py-1 font-semibold text-white">Delete</button>
                        <button onClick={() => setDeleting(null)} className="rounded-lg px-2 py-1 font-semibold text-ink-600 hover:bg-ink-900/5">Keep</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleting(z.id)} aria-label={`Delete ${z.name}`} className="grid h-11 w-11 place-items-center rounded-xl border border-ink-200 bg-white text-ink-400 hover:border-danger/40 hover:bg-danger/5 hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* States */}
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">States covered</p>
                      <button onClick={() => setPicking(z.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-gold-700 hover:underline"><Plus className="h-3.5 w-3.5" /> {fallback ? "Add states" : "Edit states"}</button>
                    </div>
                    {fallback ? (
                      <p className="flex items-center gap-2 rounded-xl border border-dashed border-ink-200 bg-white/60 px-3 py-2.5 text-xs text-ink-500"><Globe2 className="h-4 w-4 text-ink-400" /> Fallback — used for any state not listed in another zone.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {z.states.map((st) => (
                          <span key={st} className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 text-xs font-medium text-ink-800 ring-1 ring-ink-100">
                            {st}
                            <button onClick={() => setStates(z, z.states.filter((x) => x !== st))} aria-label={`Remove ${st}`} className="grid h-5 w-5 place-items-center rounded-full text-ink-400 hover:bg-danger/10 hover:text-danger"><X className="h-3 w-3" /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Rates */}
                  <div className="mt-5">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">Courier rates (₹, incl. GST)</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                      {RATES.map((r) => (
                        <label key={r.key} className={cn("rounded-xl border bg-white p-3", r.key === "uptoGm500" ? "border-gold-400" : "border-ink-100")}>
                          <span className="block text-xs font-semibold text-ink-800">{r.label}</span>
                          <span className="block text-[10px] text-ink-400">{r.hint}</span>
                          <span className="relative mt-2 block">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">₹</span>
                            <MoneyInput value={z[r.key]} onChange={(paise) => { s.updateZone(z.id, { [r.key]: paise }); flash(); }} className="h-10 w-full rounded-lg border border-ink-200 bg-ivory-50 pl-6 pr-2.5 text-right text-sm font-semibold tabular-nums text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20" />
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2.5 text-[11px] text-ink-500">
                      Online orders to this zone pay <b className="text-ink-900">{formatINR(z.uptoGm500 || z.uptoGm250 || z.charge)}</b> standard delivery{z.eta ? <> · arrives in {z.eta}</> : null}.
                    </p>
                  </div>
                </div>
              </section>
            );
          })}

          {s.zones.length === 0 && (
            <div className="grid place-items-center rounded-2xl border border-dashed border-ink-200 px-4 py-14 text-center">
              <Truck className="h-6 w-6 text-ink-300" />
              <p className="mt-2 text-sm font-semibold text-ink-600">No delivery zones yet</p>
              <button onClick={addZone} className="mt-2 text-xs font-semibold text-gold-700 hover:underline">Add the first zone</button>
            </div>
          )}
        </div>
      )}

      {picking && (() => {
        const z = s.zones.find((x) => x.id === picking);
        return z ? <StatePicker zone={z} ownerOf={ownerOf} onSave={(states) => { setStates(z, states); setPicking(null); }} onClose={() => setPicking(null)} /> : null;
      })()}
    </div>
  );
}

/** Pop-up checklist of Indian states for one zone, with search. States in another zone are marked. */
function StatePicker({ zone, ownerOf, onSave, onClose }: { zone: Zone; ownerOf: Map<string, string>; onSave: (states: string[]) => void; onClose: () => void }) {
  const [sel, setSel] = useState<string[]>(zone.states);
  const [q, setQ] = useState("");
  const list = IN_STATES.filter((st) => st.toLowerCase().includes(q.trim().toLowerCase()));
  const flip = (st: string) => setSel((x) => (x.includes(st) ? x.filter((y) => y !== st) : [...x, st]));
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-ivory-50 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-ink-100 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-ink-900">States in {zone.name || "this zone"}</h3>
              <p className="text-xs text-ink-500">{sel.length === 0 ? "None ticked — this zone is the fallback." : `${sel.length} selected`}</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a state…" className="h-10 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none" />
          </div>
        </div>
        <ul className="grid flex-1 gap-1 overflow-y-auto p-3 sm:grid-cols-2">
          {list.map((st) => {
            const on = sel.includes(st);
            const other = !zone.states.includes(st) ? ownerOf.get(st) : undefined;
            return (
              <li key={st}>
                <button onClick={() => flip(st)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm", on ? "bg-gold-500/10 text-ink-900" : "text-ink-700 hover:bg-ink-900/[0.04]")}>
                  <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-gold-600 bg-gold-500 text-white" : "border-ink-300 bg-white")}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="min-w-0">
                    <span className="block truncate">{st}</span>
                    {other && <span className="block truncate text-[10px] text-amber-700">Also in {other}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-ink-100 p-4">
          <button onClick={() => setSel([])} className="text-xs font-semibold text-ink-500 hover:text-danger">Clear all</button>
          <button onClick={() => onSave(sel)} className="rounded-xl bg-ink-900 px-6 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800">Save states</button>
        </div>
      </div>
    </div>
  );
}
