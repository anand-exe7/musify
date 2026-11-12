/**
 * Delivery configuration — the shapes the admin edits and checkout prices from.
 *
 * Nothing about delivery is hard-coded any more. A zone is a list of states with a ladder of
 * courier weight bands the admin writes themselves; a method is a service the shop offers
 * (its name, its delivery time, whether it is priced from the zone ladder or flat). Checkout
 * shows exactly the methods in `delivery_methods` and nothing else.
 */

/**
 * One courier weight band: "0–500 g costs ₹60".
 *
 * Both ends are required — a band with no upper limit swallows every heavier parcel and hides
 * the rest of the ladder. A parcel heavier than the whole ladder is charged the heaviest band
 * (see {@link bandFor}), so there is no need for an open-ended one.
 */
export interface RateBand {
  id: string;
  /** Inclusive lower bound, grams. */
  minG: number;
  /** Inclusive upper bound, grams. */
  maxG: number;
  /** Paise, GST-inclusive. */
  price: number;
  position: number;
}

/** Why a band can't be saved, or null when it is fine. */
export function bandProblem(r: Pick<RateBand, "minG" | "maxG">): string | null {
  if (!Number.isFinite(r.minG) || r.minG < 0) return "Give the band a starting weight.";
  if (!Number.isFinite(r.maxG) || r.maxG <= 0) return "Give the band an ending weight.";
  if (r.maxG < r.minG) return "The ending weight must be at least the starting weight.";
  return null;
}

/** A destination zone: the states it covers and what the courier charges by weight. */
export interface Zone {
  id: string;
  name: string;
  /** Indian states this zone covers. Empty = the "Rest of India" fallback. */
  states: string[];
  /** Customer-facing transit time for this destination, e.g. "1–2 days". */
  eta: string;
  /** The weight ladder, lightest first. */
  rates: RateBand[];
}

export type MethodPricing = "zone" | "flat";

/** A delivery service the shop offers at checkout. */
export interface DeliveryMethod {
  id: string;
  name: string;
  description: string;
  /** Delivery time shown to the customer, e.g. "3 to 5 working days". */
  eta: string;
  /** `zone` = the destination's weight band + `surcharge`; `flat` = `flatPrice` whatever the weight. */
  pricing: MethodPricing;
  flatPrice: number;
  /** Added on top of the zone rate, in paise. */
  surcharge: number;
  /** Working days the shop has to hand the parcel over — what dispatch alerts count down to. */
  dispatchDays: number;
  active: boolean;
  position: number;
}

/** A method priced for one particular cart, as checkout shows it. */
export interface QuotedMethod {
  id: string;
  name: string;
  description: string;
  eta: string;
  /** Paise. */
  price: number;
  dispatchDays: number;
  /** False when the zone has no band covering this weight, so the price can't be trusted. */
  priced: boolean;
}

/** The zone a shipping state belongs to: the one that names it, else the fallback (no states). */
export function zoneForState(zones: Zone[], shipState: string): Zone | undefined {
  const s = shipState.trim().toLowerCase();
  if (s) {
    const hit = zones.find((z) => z.states.some((x) => x.trim().toLowerCase() === s));
    if (hit) return hit;
  }
  return fallbackZone(zones) ?? zones[0];
}

/**
 * The "Rest of India" zone — the one with no states named.
 *
 * More than one zone can end up stateless (an empty zone the admin added and never filled in).
 * A catch-all with no rates would price every unlisted state at zero, so one that actually has
 * rates wins; the admin screen warns when there is more than one either way.
 */
export function fallbackZone(zones: Zone[]): Zone | undefined {
  const stateless = zones.filter((z) => z.states.length === 0);
  return stateless.find((z) => z.rates.length > 0) ?? stateless[0];
}

/**
 * The band covering `weightG`. A parcel heavier than every band is charged the heaviest one —
 * the shop would rather under-charge the rare oversized order than refuse it.
 */
export function bandFor(zone: Zone | undefined, weightG: number): RateBand | undefined {
  const ladder = [...(zone?.rates ?? [])].sort((a, b) => a.minG - b.minG || a.position - b.position);
  if (ladder.length === 0) return undefined;
  const w = Math.max(0, Math.round(weightG));
  return ladder.find((r) => w >= r.minG && w <= r.maxG) ?? ladder[ladder.length - 1];
}

/** What `method` costs for a parcel of `weightG` going to `zone`. */
export function priceMethod(
  method: DeliveryMethod,
  zone: Zone | undefined,
  weightG: number,
): { price: number; priced: boolean } {
  if (method.pricing === "flat") return { price: Math.max(0, method.flatPrice), priced: true };
  const band = bandFor(zone, weightG);
  if (!band) return { price: Math.max(0, method.surcharge), priced: false };
  return { price: Math.max(0, band.price + method.surcharge), priced: true };
}

/** Grams as the admin and the customer read them: "750 g", "2.5 kg". */
export function formatWeight(g: number): string {
  const w = Math.max(0, Math.round(g));
  return w >= 1000 ? `${(w / 1000).toFixed(w % 1000 === 0 ? 0 : 2)} kg` : `${w} g`;
}

/** A band's range as a label: "0 g – 500 g". */
export function bandLabel(r: Pick<RateBand, "minG" | "maxG">): string {
  return `${formatWeight(r.minG)} – ${formatWeight(r.maxG)}`;
}

/** yyyy-mm-dd `days` working days (Mon–Sat) after `from`. */
export function dispatchDeadline(from: Date, days: number): string {
  const d = new Date(from.getTime());
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) left -= 1; // Sundays don't count
  }
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from today to `yyyy-mm-dd`; negative when it is already past. */
export function daysUntil(day: string | null | undefined, now = new Date()): number | null {
  if (!day) return null;
  const target = new Date(`${day}T00:00:00`);
  if (isNaN(+target)) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((+target - +today) / 86_400_000);
}
