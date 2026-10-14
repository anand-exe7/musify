/**
 * GST on a vendor purchase. Unlike sales, purchase costs are entered WITHOUT tax,
 * so each line's tax is added on top: qty × unit cost × rate. Pure and shared by
 * the purchase form, the edit dialog and the tests (all amounts in paise).
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
