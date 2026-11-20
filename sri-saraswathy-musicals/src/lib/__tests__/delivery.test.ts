import { describe, it, expect } from "vitest";
import {
  bandFor,
  bandLabel,
  bandProblem,
  daysUntil,
  dispatchDeadline,
  fallbackZone,
  formatWeight,
  priceForWeight,
  priceMethod,
  zoneForState,
  type DeliveryMethod,
  type Zone,
} from "@/lib/delivery/types";

const band = (minG: number, maxG: number, price: number, position = 0) => ({
  id: `${minG}-${maxG}`,
  minG,
  maxG,
  price,
  position,
});

const tn: Zone = {
  id: "tn",
  name: "Tamil Nadu",
  states: ["Tamil Nadu"],
  eta: "1–2 days",
  rates: [band(0, 500, 6000, 0), band(501, 2000, 9000, 1), band(2001, 20000, 15000, 2)],
};
const rest: Zone = {
  id: "rest",
  name: "Rest of India",
  states: [],
  eta: "5–7 days",
  rates: [band(0, 1000, 9500, 0), band(1001, 20000, 18000, 1)],
};
/** A zone the admin started and never filled in — the trap that priced everything at ₹0. */
const halfMade: Zone = { id: "wip", name: "New zone", states: [], eta: "", rates: [] };

/**
 * The courier card in the photo on the shop wall, as a zone: ≤250 g ₹50, ≤500 g ₹60,
 * +₹30 for every further 500 g to 5 kg, then ₹50/kg over 5 kg and ₹40/kg over 10 kg.
 */
const card: Zone = {
  id: "chennai",
  name: "Chennai",
  states: ["Tamil Nadu"],
  eta: "1–2 days",
  rates: [band(0, 250, 5000, 0), band(251, 500, 6000, 1)],
  perAddl500: 3000,
  above5kgPerKg: 5000,
  above10kgPerKg: 4000,
};

const method = (over: Partial<DeliveryMethod> = {}): DeliveryMethod => ({
  id: "standard",
  name: "Standard",
  description: "",
  eta: "",
  pricing: "zone",
  flatPrice: 0,
  surcharge: 0,
  dispatchDays: 2,
  active: true,
  position: 0,
  ...over,
});

describe("zoneForState", () => {
  it("uses the zone that names the state", () => {
    expect(zoneForState([tn, rest], "Tamil Nadu")?.id).toBe("tn");
  });
  it("ignores case and surrounding space", () => {
    expect(zoneForState([tn, rest], "  tamil nadu ")?.id).toBe("tn");
  });
  it("sends every unlisted state to the catch-all", () => {
    expect(zoneForState([tn, rest], "Assam")?.id).toBe("rest");
    expect(zoneForState([tn, rest], "")?.id).toBe("rest");
  });
  it("falls back to the first zone when nothing is a catch-all", () => {
    expect(zoneForState([tn], "Assam")?.id).toBe("tn");
  });
});

describe("fallbackZone", () => {
  it("is the zone with no states", () => {
    expect(fallbackZone([tn, rest])?.id).toBe("rest");
  });
  it("prefers a catch-all that actually has rates, so a half-made zone can't zero out delivery", () => {
    expect(fallbackZone([halfMade, rest])?.id).toBe("rest");
    expect(zoneForState([tn, halfMade, rest], "Assam")?.id).toBe("rest");
  });
  it("still returns the empty one when it is the only catch-all, so the admin sees it", () => {
    expect(fallbackZone([tn, halfMade])?.id).toBe("wip");
  });
});

describe("bandFor", () => {
  it("picks the band the weight falls in, inclusive at both ends", () => {
    expect(bandFor(tn, 0)?.price).toBe(6000);
    expect(bandFor(tn, 500)?.price).toBe(6000);
    expect(bandFor(tn, 501)?.price).toBe(9000);
    expect(bandFor(tn, 2000)?.price).toBe(9000);
    expect(bandFor(tn, 2001)?.price).toBe(15000);
    expect(bandFor(tn, 20000)?.price).toBe(15000);
  });
  it("charges the heaviest band for anything over the top of the ladder", () => {
    const capped: Zone = { ...tn, rates: [band(0, 500, 6000, 0), band(501, 2000, 9000, 1)] };
    expect(bandFor(capped, 2001)?.price).toBe(9000);
    expect(bandFor(capped, 50_000)?.price).toBe(9000);
  });
  it("is undefined for a zone with no rates at all", () => {
    expect(bandFor(halfMade, 300)).toBeUndefined();
    expect(bandFor(undefined, 300)).toBeUndefined();
  });
  it("reads the ladder in weight order whatever order the rows arrive in", () => {
    const shuffled: Zone = { ...tn, rates: [band(2001, 20000, 15000, 2), band(0, 500, 6000, 0), band(501, 2000, 9000, 1)] };
    expect(bandFor(shuffled, 700)?.price).toBe(9000);
  });
});

describe("bandProblem", () => {
  it("accepts a bounded band", () => {
    expect(bandProblem({ minG: 0, maxG: 500 })).toBeNull();
  });
  it("refuses a band with no end — it would swallow every heavier parcel", () => {
    expect(bandProblem({ minG: 0, maxG: 0 })).toMatch(/ending weight/i);
    expect(bandProblem({ minG: 0, maxG: NaN })).toMatch(/ending weight/i);
  });
  it("refuses an end below the start", () => {
    expect(bandProblem({ minG: 1000, maxG: 500 })).toMatch(/at least/i);
  });
});

describe("priceMethod", () => {
  it("charges the zone's band", () => {
    expect(priceMethod(method(), tn, 300)).toEqual({ price: 6000, priced: true });
  });
  it("adds the surcharge on top of the band", () => {
    expect(priceMethod(method({ surcharge: 2500 }), tn, 300).price).toBe(8500);
  });
  it("a flat method ignores both zone and weight", () => {
    expect(priceMethod(method({ pricing: "flat", flatPrice: 50000 }), tn, 9999)).toEqual({ price: 50000, priced: true });
    expect(priceMethod(method({ pricing: "flat", flatPrice: 50000 }), undefined, 0).price).toBe(50000);
  });
  it("reports `priced: false` rather than quietly charging nothing when the zone has no band", () => {
    expect(priceMethod(method(), halfMade, 300)).toEqual({ price: 0, priced: false });
  });
});

describe("formatWeight / bandLabel", () => {
  it("reads grams below a kilo and kilos above", () => {
    expect(formatWeight(0)).toBe("0 g");
    expect(formatWeight(750)).toBe("750 g");
    expect(formatWeight(1000)).toBe("1 kg");
    expect(formatWeight(2500)).toBe("2.50 kg");
  });
  it("labels a band's range", () => {
    expect(bandLabel({ minG: 0, maxG: 500 })).toBe("0 g – 500 g");
    expect(bandLabel({ minG: 2001, maxG: 20000 })).toBe("2.00 kg – 20 kg");
  });
});

describe("dispatchDeadline", () => {
  it("counts working days, skipping Sundays", () => {
    // 2026-11-12 is a Thursday: +2 working days lands on Saturday the 14th.
    expect(dispatchDeadline(new Date("2026-11-12T10:00:00"), 2)).toBe("2026-11-14");
    // +3 would be Sunday, so it rolls to Monday the 16th.
    expect(dispatchDeadline(new Date("2026-11-12T10:00:00"), 3)).toBe("2026-11-16");
  });
  it("zero days is the same day", () => {
    expect(dispatchDeadline(new Date("2026-11-12T10:00:00"), 0)).toBe("2026-11-12");
  });
});

describe("daysUntil", () => {
  const now = new Date("2026-11-12T18:30:00");
  it("counts whole days, ignoring the time of day", () => {
    expect(daysUntil("2026-11-12", now)).toBe(0);
    expect(daysUntil("2026-11-13", now)).toBe(1);
  });
  it("goes negative once the deadline is past", () => {
    expect(daysUntil("2026-11-10", now)).toBe(-2);
  });
  it("is null when there is no deadline", () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil(undefined, now)).toBeNull();
    expect(daysUntil("not a date", now)).toBeNull();
  });
});

describe("priceForWeight — the courier rate card", () => {
  it("charges the band inside the ladder", () => {
    expect(priceForWeight(card, 1).price).toBe(5000);
    expect(priceForWeight(card, 250).price).toBe(5000);
    expect(priceForWeight(card, 251).price).toBe(6000);
    expect(priceForWeight(card, 500).price).toBe(6000);
  });

  it("ADDS a lot for every started 500 g past the heaviest band", () => {
    expect(priceForWeight(card, 501).price).toBe(6000 + 3000); // into the first extra lot
    expect(priceForWeight(card, 1000).price).toBe(6000 + 3000);
    expect(priceForWeight(card, 1001).price).toBe(6000 + 6000);
    expect(priceForWeight(card, 2000).price).toBe(6000 + 9000); // 3 lots
    expect(priceForWeight(card, 5000).price).toBe(6000 + 27000); // 9 lots, the top of the step
  });

  it("switches to the per-kg rate over 5 kg, and the cheaper one over 10 kg", () => {
    expect(priceForWeight(card, 5001).price).toBe(6 * 5000); // 6 started kg at ₹50
    expect(priceForWeight(card, 7000).price).toBe(7 * 5000);
    expect(priceForWeight(card, 10000).price).toBe(10 * 5000);
    expect(priceForWeight(card, 10001).price).toBe(11 * 4000); // 11 started kg at ₹40
    expect(priceForWeight(card, 12000).price).toBe(12 * 4000);
  });

  it("carries the over-5 kg rate past 10 kg when no second rate is set", () => {
    expect(priceForWeight({ ...card, above10kgPerKg: 0 }, 12000).price).toBe(12 * 5000);
  });

  it("keeps stepping past 5 kg when no per-kg rate is set", () => {
    const stepOnly = { ...card, above5kgPerKg: 0, above10kgPerKg: 0 };
    expect(priceForWeight(stepOnly, 6000).price).toBe(6000 + 11 * 3000);
  });

  it("leaves a zone with no add-ons exactly as it was — heaviest band, charged flat", () => {
    expect(priceForWeight(tn, 300).price).toBe(6000);
    expect(priceForWeight(tn, 50_000).price).toBe(15000);
    expect(priceForWeight(halfMade, 300)).toEqual({ price: 0, priced: false });
    expect(priceForWeight(undefined, 300).priced).toBe(false);
  });

  it("prices a heavy parcel from the per-kg rate even with no bands at all", () => {
    const perKgOnly: Zone = { id: "x", name: "x", states: [], eta: "", rates: [], above5kgPerKg: 5000 };
    expect(priceForWeight(perKgOnly, 8000)).toEqual({ price: 8 * 5000, priced: true });
    expect(priceForWeight(perKgOnly, 800).priced).toBe(false); // nothing covers the light end
  });

  it("reaches checkout through priceMethod, surcharge and all", () => {
    expect(priceMethod(method(), card, 2000).price).toBe(15000);
    expect(priceMethod(method({ surcharge: 2500 }), card, 2000).price).toBe(17500);
    expect(priceMethod(method({ pricing: "flat", flatPrice: 50000 }), card, 12000).price).toBe(50000);
  });
});
