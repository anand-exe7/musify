/**
 * GST on a vendor purchase. A cost is stored WITHOUT tax. When the vendor's price is
 * typed WITH GST included, the tax is taken out of it first (`exclusiveCost`);
 * otherwise each line's tax is added on top: qty × unit cost × rate. Pure and
 * shared by the purchase form, the edit dialog and the tests (all amounts in paise).
 */
export interface PurchaseTaxLine {
  quantity: number;
  unitCost: number;
  /** GST rate (%) on the line; 0 / missing = none. */
  gst?: number;
}

export interface PurchaseTax {
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
}

/** Tax on one line, rounded to the paise. */
export function linePurchaseTax(l: PurchaseTaxLine): number {
  const rate = Number(l.gst) || 0;
  if (rate <= 0) return 0;
  return Math.round((l.quantity * l.unitCost * rate) / 100);
}

/** Total tax, split CGST+SGST (same state) or all IGST (inter-state). */
export function computePurchaseTax(lines: PurchaseTaxLine[], interState: boolean): PurchaseTax {
  const tax = lines.reduce((n, l) => n + linePurchaseTax(l), 0);
  if (interState) return { cgst: 0, sgst: 0, igst: tax, tax };
  const cgst = Math.round(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0, tax };
}

/** A price that includes GST → the cost before GST (rounded to the paise). */
export function exclusiveCost(withGst: number, gst?: number): number {
  const rate = Number(gst) || 0;
  return rate <= 0 ? withGst : Math.round((withGst * 100) / (100 + rate));
}

/** A cost before GST → the price with GST included. */
export function inclusiveCost(withoutGst: number, gst?: number): number {
  const rate = Number(gst) || 0;
  return rate <= 0 ? withoutGst : Math.round((withoutGst * (100 + rate)) / 100);
}

/**
 * Tax for lines whose `unitCost` is the price WITH GST. The tax is whatever sits
 * between what was typed and the cost before GST, so goods + tax comes back to
 * exactly the typed total (no stray paise).
 */
export function computeInclusiveTax(lines: PurchaseTaxLine[], interState: boolean): PurchaseTax {
  const tax = lines.reduce((n, l) => n + l.quantity * (l.unitCost - exclusiveCost(l.unitCost, l.gst)), 0);
  if (interState) return { cgst: 0, sgst: 0, igst: tax, tax };
  const cgst = Math.round(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0, tax };
}

/** Rounding the vendor's own bill may differ by (₹10, plus a paisa a unit for prices typed with GST). */
export function taxTolerance(lines: PurchaseTaxLine[]): number {
  return 1000 + lines.reduce((n, l) => n + l.quantity, 0);
}

/**
 * Is the GST typed on a purchase believable? `lines` carry costs BEFORE GST. A bill is either
 * CGST + SGST (equal halves) or IGST — never both — and the total must be what the lines' rates
 * give, give or take rounding. Returns the problem in plain words, or null when it is fine.
 * Shared by the purchase form, the edit dialog and the server.
 */
export function checkPurchaseTax(lines: PurchaseTaxLine[], t: { cgst: number; sgst: number; igst: number }): string | null {
  if (t.igst > 0 && (t.cgst > 0 || t.sgst > 0)) {
    return "A bill has either CGST + SGST (same state) or IGST (other state), not both. Clear one of them.";
  }
  if (t.igst === 0 && Math.abs(t.cgst - t.sgst) > 1) {
    return "CGST and SGST must be equal — the tax is split half and half.";
  }
  const entered = t.cgst + t.sgst + t.igst;
  const expected = lines.reduce((n, l) => n + linePurchaseTax(l), 0);
  if (Math.abs(entered - expected) > taxTolerance(lines)) {
    return `GST should come to about ${rupees(expected)} from the items' rates, but ${rupees(entered)} was entered. Fix the amount (rounding up to ₹10 is fine) or the item's GST %.`;
  }
  return null;
}

const rupees = (paise: number): string => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
