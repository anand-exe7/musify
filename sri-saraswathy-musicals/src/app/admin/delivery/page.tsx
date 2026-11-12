"use client";
import { useMemo, useState } from "react";
import { useSettings } from "@/lib/store/settings";
import type { Zone, RateBand, DeliveryMethod } from "@/lib/delivery/types";
import { bandLabel, bandProblem, fallbackZone, formatWeight } from "@/lib/delivery/types";
import { IN_STATES } from "@/lib/store/gst";
import { cn, formatINR } from "@/lib/utils";
import { DebouncedText, DebouncedMoney, DebouncedNumber } from "@/components/admin/DebouncedField";
import { LoadErrorBanner, LoadingPanel } from "@/components/admin/LoadState";
import { Plus, Trash2, Truck, MapPin, Clock, X, Search, Globe2, Check, Scale, Pencil, AlertTriangle, Lock } from "lucide-react";

const uid = () => crypto.randomUUID();

/** The next band to add: starts where the heaviest one ends and is the same width again. */
function nextBand(rates: RateBand[]): RateBand {
  const top = [...rates].sort((a, b) => a.minG - b.minG)[rates.length - 1];
  const from = top ? top.maxG + 1 : 0;
  const width = top ? Math.max(250, top.maxG - top.minG + 1) : 500;
  return { id: uid(), minG: from, maxG: from + width - 1, price: 0, position: rates.length };
}

export default function DeliveryPage() {
  const s = useSettings();
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  // A state belongs to one zone. Show the admin where a state already sits.
  const ownerOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of s.zones) for (const st of z.states) m.set(st, z.name || "another zone");
    return m;
  }, [s.zones]);

  const fallback = fallbackZone(s.zones);
  // Only one zone can be the catch-all. A second empty one is almost always a half-made zone.
  const strayCatchAlls = s.zones.filter((z) => z.states.length === 0 && z.id !== fallback?.id);
  const unnamed = useMemo(() => {
    const covered = new Set(s.zones.flatMap((z) => z.states.map((x) => x.trim())));
    return IN_STATES.filter((st) => !covered.has(st));
  }, [s.zones]);

  const addZone = () => {
    s.addZone({ id: uid(), name: "New zone", states: [], eta: "", rates: [] });
    flash();
  };
  const addRestOfIndia = () => {
    s.addZone({ id: uid(), name: "Rest of India", states: [], eta: "", rates: [] });
    flash();
  };
  const addMethod = () => {
    s.addMethod({
      id: uid(),
      name: "New delivery option",
      description: "",
      eta: "",
      pricing: "zone",
      flatPrice: 0,
      surcharge: 0,
      dispatchDays: 2,
      active: true,
      position: s.methods.length,
    });
    flash();
  };

  return (
    <div className="p-5 md:p-8">
      {saved && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">
          Saved
        </div>
      )}
      <LoadErrorBanner message={s.loadError} onRetry={() => void s.hydrate()} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink-900 text-gold-400">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Delivery</h1>
            <p className="mt-0.5 text-sm text-ink-500">
              Courier rates by destination and parcel weight · the options checkout offers · rates include GST
            </p>
          </div>
        </div>
      </div>

      {/* How a delivery charge is worked out — three sentences, in order. */}
      <div className="mb-5 grid gap-3 rounded-2xl border border-ink-100 bg-ivory-50 p-4 text-xs text-ink-600 md:grid-cols-4">
        <p className="flex gap-2">
          <Scale className="h-4 w-4 shrink-0 text-gold-600" />
          <span>
            <b className="text-ink-900">1.</b> The cart&rsquo;s weight is the sum of its items&rsquo; weights.
          </span>
        </p>
        <p className="flex gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-gold-600" />
          <span>
            <b className="text-ink-900">2.</b> The buyer&rsquo;s state picks the zone.
          </span>
        </p>
        <p className="flex gap-2">
          <Globe2 className="h-4 w-4 shrink-0 text-gold-600" />
          <span>
            <b className="text-ink-900">3.</b> A state in no zone falls to <b className="text-ink-900">Rest of India</b>.
          </span>
        </p>
        <p className="flex gap-2">
          <Truck className="h-4 w-4 shrink-0 text-gold-600" />
          <span>
            <b className="text-ink-900">4.</b> That zone&rsquo;s band for the weight sets the price.
          </span>
        </p>
      </div>

      {!s.hydrated && !s.loadError ? (
        <LoadingPanel label="Loading delivery settings…" />
      ) : (
        <>
          {/* ── What checkout offers ─────────────────────────────────── */}
          <section className="mb-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-ink-900">Delivery options at checkout</h2>
                <p className="text-xs text-ink-500">
                  Customers see exactly these, under exactly these names. Nothing is built in.
                </p>
              </div>
              <button
                onClick={addMethod}
                className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-gold-500 hover:text-ink-900"
              >
                <Plus className="h-4 w-4" /> Add option
              </button>
            </div>

            {s.methods.length === 0 ? (
              <div className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-6 text-center">
                <AlertTriangle className="mx-auto h-5 w-5 text-danger" />
                <p className="mt-2 text-sm font-semibold text-ink-800">No delivery option is set up</p>
                <p className="mt-1 text-xs text-ink-600">Checkout cannot take an order until there is at least one.</p>
                <button onClick={addMethod} className="mt-3 text-xs font-semibold text-gold-700 hover:underline">
                  Add the first one
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {s.methods.map((m) => (
                  <MethodCard
                    key={m.id}
                    method={m}
                    onPatch={(patch) => {
                      s.updateMethod(m.id, patch);
                      flash();
                    }}
                    onDelete={() => {
                      s.removeMethod(m.id);
                      flash();
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Zones ────────────────────────────────────────────────── */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink-900">Destinations &amp; courier rates</h2>
              <p className="text-xs text-ink-500">
                {s.zones.length} {s.zones.length === 1 ? "zone" : "zones"} ·{" "}
                {IN_STATES.length - unnamed.length} of {IN_STATES.length} states named
                {unnamed.length > 0 && <> · {unnamed.length} fall to Rest of India</>}
              </p>
            </div>
            <button
              onClick={addZone}
              className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 hover:border-gold-400 hover:text-gold-700"
            >
              <Plus className="h-4 w-4" /> Add zone
            </button>
          </div>

          {!fallback && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                There is no <b>Rest of India</b> zone, so an order from a state nobody listed has no rate at all.
              </span>
              <button
                onClick={addRestOfIndia}
                className="rounded-lg bg-amber-900 px-3 py-1.5 font-semibold text-amber-50 hover:bg-amber-800"
              >
                Add Rest of India
              </button>
            </div>
          )}

          {strayCatchAlls.length > 0 && (
            <div className="mb-4 flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                {strayCatchAlls.length === 1 ? "Another zone has" : `${strayCatchAlls.length} other zones have`} no
                states either ({strayCatchAlls.map((z) => z.name || "untitled").join(", ")}). Only{" "}
                <b>{fallback?.name}</b> is used for unlisted states — give{" "}
                {strayCatchAlls.length === 1 ? "that zone" : "those zones"} states, or delete{" "}
                {strayCatchAlls.length === 1 ? "it" : "them"}.
              </span>
            </div>
          )}

          <div className="space-y-4">
            {s.zones.map((z) => (
              <ZoneCard
                key={z.id}
                zone={z}
                isFallback={z.id === fallback?.id}
                restOfIndiaStates={z.id === fallback?.id ? unnamed : []}
                deleting={deleting === z.id}
                onAskDelete={() => setDeleting(z.id)}
                onCancelDelete={() => setDeleting(null)}
                onDelete={() => {
                  s.removeZone(z.id);
                  setDeleting(null);
                  flash();
                }}
                onPatch={(patch) => {
                  s.updateZone(z.id, patch);
                  flash();
                }}
                onPickStates={() => setPicking(z.id)}
                onAddRate={() => {
                  s.addRate(z.id, nextBand(z.rates));
                  flash();
                }}
                onPatchRate={(id, patch) => {
                  s.updateRate(z.id, id, patch);
                  flash();
                }}
                onDeleteRate={(id) => {
                  s.removeRate(z.id, id);
                  flash();
                }}
              />
            ))}

            {s.zones.length === 0 && (
              <div className="grid place-items-center rounded-2xl border border-dashed border-ink-200 px-4 py-14 text-center">
                <Truck className="h-6 w-6 text-ink-300" />
                <p className="mt-2 text-sm font-semibold text-ink-600">No delivery zones yet</p>
                <button onClick={addRestOfIndia} className="mt-2 text-xs font-semibold text-gold-700 hover:underline">
                  Start with a Rest of India zone
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {picking &&
        (() => {
          const z = s.zones.find((x) => x.id === picking);
          return z ? (
            <StatePicker
              zone={z}
              ownerOf={ownerOf}
              onSave={(states) => {
                s.updateZone(z.id, { states });
                flash();
                setPicking(null);
              }}
              onClose={() => setPicking(null)}
            />
          ) : null;
        })()}
    </div>
  );
}

/* ─────────────────────────  Delivery option  ───────────────────────── */

function MethodCard({
  method: m,
  onPatch,
  onDelete,
}: {
  method: DeliveryMethod;
  onPatch: (patch: Partial<DeliveryMethod>) => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const box =
    "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const cap = "mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-ivory-50",
        m.active ? "border-ink-100" : "border-dashed border-ink-200 opacity-75",
      )}
    >
      {/* One header row: the name, whether it is offered, and delete — nothing stacked. */}
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <DebouncedText
            value={m.name}
            onCommit={(name) => onPatch({ name: name.trim() })}
            required
            requiredMessage="Give this option a name."
            placeholder="e.g. Standard, Express"
            aria-label="Name shown to the customer"
            className="h-9 w-full rounded-lg border border-transparent bg-transparent px-2 text-[15px] font-bold text-ink-900 hover:border-ink-200 focus:border-gold-500 focus:bg-white focus:outline-none"
          />
        </div>
        <button
          onClick={() => onPatch({ active: !m.active })}
          title={m.active ? "Customers see this option" : "Hidden from checkout"}
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
            m.active ? "bg-success/15 text-success" : "bg-ink-900/5 text-ink-500",
          )}
        >
          {m.active ? "Offered" : "Hidden"}
        </button>
        {confirm ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px]">
            <button onClick={onDelete} className="rounded-lg bg-danger px-2 py-1 font-semibold text-white">Delete</button>
            <button onClick={() => setConfirm(false)} className="px-1 font-semibold text-ink-600">Keep</button>
          </span>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            aria-label={`Delete ${m.name}`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-3 p-4">
        {/* Three short fields on one line instead of one per row. */}
        <div className="grid gap-3 sm:grid-cols-[1.2fr_1.6fr_auto]">
          <label className="block">
            <span className={cap}>Delivery time</span>
            <DebouncedText value={m.eta} onCommit={(eta) => onPatch({ eta })} placeholder="3 to 5 days" className={box} />
          </label>
          <label className="block">
            <span className={cap}>One line under the name</span>
            <DebouncedText
              value={m.description}
              onCommit={(description) => onPatch({ description })}
              placeholder="Insured courier, tracked."
              className={box}
            />
          </label>
          <label className="block sm:w-28">
            <span className={cap}>Dispatch in</span>
            <span className="relative block">
              <DebouncedNumber
                value={m.dispatchDays}
                onCommit={(v) => onPatch({ dispatchDays: v ?? 0 })}
                className={cn(box, "pr-11 text-right tabular-nums")}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-400">days</span>
            </span>
          </label>
        </div>

        {/* Pricing: the choice and its one number, side by side. */}
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2.5">
          <span className="block">
            <span className={cap}>Priced</span>
            <span className="flex rounded-lg bg-ivory-100 p-0.5">
              {(["zone", "flat"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => onPatch({ pricing: p })}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    m.pricing === p ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800",
                  )}
                >
                  {p === "zone" ? "By weight" : "Flat"}
                </button>
              ))}
            </span>
          </span>
          <label className="block w-36">
            <span className={cap}>{m.pricing === "zone" ? "Extra on top" : "Flat price"}</span>
            <span className="relative block">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">₹</span>
              <DebouncedMoney
                value={m.pricing === "zone" ? m.surcharge : m.flatPrice}
                onCommit={(v) => onPatch(m.pricing === "zone" ? { surcharge: v } : { flatPrice: v })}
                className={cn(box, "pl-6 pr-2.5 text-right font-semibold tabular-nums")}
              />
            </span>
          </label>
          <p className="min-w-[12rem] flex-1 pb-2 text-[11px] text-ink-500">
            {m.pricing === "zone" ? (
              <>
                The destination zone&rsquo;s band for the parcel&rsquo;s weight
                {m.surcharge > 0 ? <>, plus {formatINR(m.surcharge)}</> : <>, exactly</>}.
              </>
            ) : (
              <>Always {formatINR(m.flatPrice)}, whatever the weight or destination.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────  Zone  ───────────────────────────── */

function ZoneCard({
  zone: z,
  isFallback,
  restOfIndiaStates,
  deleting,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onPatch,
  onPickStates,
  onAddRate,
  onPatchRate,
  onDeleteRate,
}: {
  zone: Zone;
  isFallback: boolean;
  restOfIndiaStates: string[];
  deleting: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onPatch: (patch: Partial<Zone>) => void;
  onPickStates: () => void;
  onAddRate: () => void;
  onPatchRate: (id: string, patch: Partial<RateBand>) => void;
  onDeleteRate: (id: string) => void;
}) {
  const [showStates, setShowStates] = useState(false);
  const ladder = [...z.rates].sort((a, b) => a.minG - b.minG || a.position - b.position);

  // Holes and overlaps in the ladder are what make a cart come back unpriced.
  const gaps: string[] = [];
  for (let i = 0; i < ladder.length - 1; i++) {
    const a = ladder[i];
    const b = ladder[i + 1];
    if (b.minG > a.maxG + 1) gaps.push(`Nothing covers ${formatWeight(a.maxG + 1)} – ${formatWeight(b.minG - 1)}.`);
    if (b.minG <= a.maxG) gaps.push(`“${bandLabel(a)}” and “${bandLabel(b)}” overlap.`);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50 shadow-[0_1px_2px_rgba(10,9,8,0.03)]">
      <div className={cn("h-1", isFallback ? "bg-gradient-to-r from-ink-400 to-ink-200" : "bg-gradient-to-r from-gold-500 to-gold-300")} />
      <div className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">Zone name</label>
            <DebouncedText
              value={z.name}
              onCommit={(name) => onPatch({ name: name.trim() })}
              required
              requiredMessage="A zone needs a name."
              placeholder="e.g. Tamil Nadu"
              className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-[15px] font-semibold text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
            />
          </div>
          <div className="w-full sm:w-44">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">Transit time</label>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <DebouncedText
                value={z.eta}
                onCommit={(eta) => onPatch({ eta })}
                placeholder="e.g. 2–3 days"
                className="h-11 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
              />
            </div>
          </div>
          {deleting ? (
            <div className="flex h-11 items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 text-xs">
              <span className="font-semibold text-ink-800">Delete this zone and its rates?</span>
              <button onClick={onDelete} className="rounded-lg bg-danger px-2.5 py-1 font-semibold text-white">Delete</button>
              <button onClick={onCancelDelete} className="rounded-lg px-2 py-1 font-semibold text-ink-600 hover:bg-ink-900/5">Keep</button>
            </div>
          ) : (
            <button
              onClick={onAskDelete}
              aria-label={`Delete ${z.name}`}
              className="grid h-11 w-11 place-items-center rounded-xl border border-ink-200 bg-white text-ink-400 hover:border-danger/40 hover:bg-danger/5 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* States */}
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">
              {isFallback ? "Covers" : `States covered · ${z.states.length}`}
            </p>
            <button
              onClick={onPickStates}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gold-400 bg-gold-500/10 px-3 py-1.5 text-xs font-bold text-gold-700 hover:bg-gold-500/20"
            >
              <Pencil className="h-3.5 w-3.5" /> {isFallback ? "Pick states" : "Edit states"}
            </button>
          </div>
          {isFallback ? (
            <div className="rounded-xl border border-dashed border-ink-200 bg-white/60 px-3 py-2.5">
              <p className="flex items-center gap-2 text-xs text-ink-600">
                <Globe2 className="h-4 w-4 shrink-0 text-ink-400" />
                <span>
                  <b className="text-ink-900">Rest of India.</b> Every state not named in another zone is charged these
                  rates — {restOfIndiaStates.length} of {IN_STATES.length} today.
                </span>
                {restOfIndiaStates.length > 0 && (
                  <button onClick={() => setShowStates((o) => !o)} className="ml-auto shrink-0 font-semibold text-gold-700 hover:underline">
                    {showStates ? "Hide" : "Show"}
                  </button>
                )}
              </p>
              {showStates && restOfIndiaStates.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-ink-100 pt-2.5">
                  {restOfIndiaStates.map((st) => (
                    <span key={st} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-ink-600 ring-1 ring-ink-100">{st}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {z.states.map((st) => (
                <span key={st} className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 text-xs font-medium text-ink-800 ring-1 ring-ink-100">
                  {st}
                  <button
                    onClick={() => onPatch({ states: z.states.filter((x) => x !== st) })}
                    aria-label={`Remove ${st}`}
                    className="grid h-5 w-5 place-items-center rounded-full text-ink-400 hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Weight bands */}
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500">
              Courier rates by parcel weight (₹, incl. GST)
            </p>
            <button onClick={onAddRate} className="inline-flex items-center gap-1 text-xs font-bold text-gold-700 hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add a weight band
            </button>
          </div>

          {ladder.length === 0 ? (
            <p className="rounded-xl border border-dashed border-danger/40 bg-danger/5 px-3 py-2.5 text-xs text-danger">
              No rates here yet — an order to this zone cannot be priced. Add at least one band.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
              <div className="grid grid-cols-[1fr_1fr_1fr_2.5rem] gap-2 border-b border-ink-100 bg-ivory-100/60 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
                <span>From (g)</span>
                <span>To (g)</span>
                <span className="text-right">Price</span>
                <span />
              </div>
              {ladder.map((r) => {
                const problem = bandProblem(r);
                return (
                <div key={r.id} className="grid grid-cols-[1fr_1fr_1fr_2.5rem] items-center gap-2 border-b border-ink-50 px-3 py-2 last:border-b-0">
                  <DebouncedNumber
                    value={r.minG}
                    onCommit={(v) => onPatchRate(r.id, { minG: v ?? 0 })}
                    className="h-9 w-full rounded-lg border border-ink-200 bg-ivory-50 px-2.5 text-sm tabular-nums text-ink-900 focus:border-gold-500 focus:outline-none"
                  />
                  <DebouncedNumber
                    value={r.maxG}
                    onCommit={(v) => onPatchRate(r.id, { maxG: v ?? 0 })}
                    aria-invalid={!!problem}
                    className={cn(
                      "h-9 w-full rounded-lg border bg-ivory-50 px-2.5 text-sm tabular-nums text-ink-900 focus:outline-none",
                      problem ? "border-danger bg-danger/5 focus:border-danger" : "border-ink-200 focus:border-gold-500",
                    )}
                  />
                  <span className="relative block">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">₹</span>
                    <DebouncedMoney
                      value={r.price}
                      onCommit={(price) => onPatchRate(r.id, { price })}
                      className="h-9 w-full rounded-lg border border-ink-200 bg-ivory-50 pl-6 pr-2.5 text-right text-sm font-semibold tabular-nums text-ink-900 focus:border-gold-500 focus:outline-none"
                    />
                  </span>
                  <button
                    onClick={() => onDeleteRate(r.id)}
                    aria-label={`Delete the ${bandLabel(r)} band`}
                    className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  {problem && <p className="col-span-4 -mt-1 text-[11px] font-semibold text-danger">{problem}</p>}
                </div>
                );
              })}
            </div>
          )}

          {ladder.length > 0 && (
            <p className="mt-2 text-[11px] text-ink-500">
              Heaviest band: {bandLabel(ladder[ladder.length - 1])}. A parcel over that is charged this same rate,
              so there is no need for an open-ended band.
            </p>
          )}
          {gaps.map((g, i) => (
            <p key={i} className="mt-1 text-[11px] text-amber-700">{g}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────  State picker  ───────────────────────── */

function StatePicker({
  zone,
  ownerOf,
  onSave,
  onClose,
}: {
  zone: Zone;
  ownerOf: Map<string, string>;
  onSave: (states: string[]) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<string[]>(zone.states);
  const [q, setQ] = useState("");
  const [blocked, setBlocked] = useState<{ state: string; zone: string } | null>(null);
  const list = IN_STATES.filter((st) => st.toLowerCase().includes(q.trim().toLowerCase()));
  const flip = (st: string) => setSel((x) => (x.includes(st) ? x.filter((y) => y !== st) : [...x, st]));
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-ivory-50 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-ink-100 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-ink-900">States in {zone.name || "this zone"}</h3>
              <p className="text-xs text-ink-500">
                {sel.length === 0
                  ? "None ticked — this zone becomes Rest of India, the catch-all."
                  : `${sel.length} selected`}
                {" · "}
                a state can only be in one zone
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a state…"
              className="h-10 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none"
            />
          </div>
        </div>
        {blocked && (
          <p className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            <Lock className="mt-px h-3 w-3 shrink-0" />
            <span>
              <b>{blocked.state}</b> is already in <b>{blocked.zone}</b>. A state can only be in one zone — open
              that zone and remove it there first.
            </span>
          </p>
        )}
        <ul className="grid flex-1 gap-1 overflow-y-auto p-3 sm:grid-cols-2">
          {list.map((st) => {
            const on = sel.includes(st);
            // Taken by another zone: not offered at all, so a state can never be in two.
            const other = !zone.states.includes(st) ? ownerOf.get(st) : undefined;
            return (
              <li key={st}>
                <button
                  onClick={() => (other ? setBlocked({ state: st, zone: other }) : flip(st))}
                  aria-disabled={!!other}
                  title={other ? `Already in ${other}` : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm",
                    other
                      ? "cursor-not-allowed text-ink-400"
                      : on
                        ? "bg-gold-500/10 text-ink-900"
                        : "text-ink-700 hover:bg-ink-900/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded border",
                      other ? "border-ink-200 bg-ink-100" : on ? "border-gold-600 bg-gold-500 text-white" : "border-ink-300 bg-white",
                    )}
                  >
                    {other ? <Lock className="h-2.5 w-2.5 text-ink-400" /> : on ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{st}</span>
                    {other && <span className="block truncate text-[10px] text-ink-400">In {other}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-ink-100 p-4">
          <button onClick={() => setSel([])} className="text-xs font-semibold text-ink-500 hover:text-danger">Clear all</button>
          <button onClick={() => onSave(sel)} className="rounded-xl bg-ink-900 px-6 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800">
            Save states
          </button>
        </div>
      </div>
    </div>
  );
}
