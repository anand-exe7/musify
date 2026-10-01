/**
 * GST-inclusive maths — the single tax model for every channel. Retail prices
 * (web and POS alike) already contain GST, so tax is *extracted* from a gross
 * amount rather than added on top. All amounts are integer paise.
 *
 * Pure and dependency-free so server routes, the ledger, the POS screen and the
 * tests all run the same arithmetic.
 */

/**
 * Split a GST-inclusive line amount into its taxable value and the tax it
 * already contains. ₹1180 @ 18% → { taxable: 1000, tax: 180 }. A rate of
 * 0 / null (a non-GST line) yields all-taxable, zero tax.
 */
export function lineTax(amount: number, rate?: number | null): { taxable: number; tax: number } {
  const r = Number(rate) || 0;
  if (r <= 0) return { taxable: Math.round(amount), tax: 0 };
  const taxable = Math.round(amount / (1 + r / 100));
  return { taxable, tax: Math.round(amount) - taxable };
}

/**
 * Spread a bill-level discount across lines in proportion to their amounts
 * (largest-remainder, so the shares add up to exactly `discount` and no line
 * is discounted below zero). The discount is capped at the sum of the amounts.
 */
export function allocateDiscount(amounts: number[], discount: number): number[] {
  const total = amounts.reduce((n, a) => n + Math.max(0, a), 0);
  const d = Math.min(Math.max(0, Math.round(discount)), total);
  if (d === 0 || total === 0) return amounts.map(() => 0);

  const exact = amounts.map((a) => (Math.max(0, a) * d) / total);
  const shares = exact.map((x) => Math.floor(x));
  let left = d - shares.reduce((n, s) => n + s, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    if (shares[i] < Math.max(0, amounts[i])) {
      shares[i] += 1;
      left -= 1;
    }
  }
  return shares;
}

/** Split a tax amount into CGST+SGST (same-state) or a single IGST. */
export function splitTax(tax: number, intra: boolean): { cgst: number; sgst: number; igst: number } {
  if (!intra) return { cgst: 0, sgst: 0, igst: tax };
  const cgst = Math.round(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0 };
}

export interface TaxedLineInput {
  /** Gross, GST-inclusive line amount (unit price × qty), before any bill discount. */
  gross: number;
  /** GST rate (%) — 0 for an exempt line. */
  rate: number;
}

export interface TaxedLine {
  gross: number;
  discount: number;
  /** gross − discount: what the customer actually pays for this line. */
  net: number;
  taxable: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface TaxedTotals {
  gross: number;
  discount: number;
  net: number;
  taxable: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
}

/**
 * Apply a bill-level discount BEFORE tax, then extract tax line by line from
 * what is actually paid. `taxable + tax` of each line always equals its `net`.
 */
export function taxLines(
  lines: TaxedLineInput[],
  billDiscount: number,
  intra: boolean,
): { lines: TaxedLine[]; totals: TaxedTotals } {
  const shares = allocateDiscount(lines.map((l) => l.gross), billDiscount);
  const out = lines.map((l, i) => {
    const discount = shares[i];
    const net = Math.max(0, l.gross - discount);
    const { taxable, tax } = lineTax(net, l.rate);
    return { gross: l.gross, discount, net, taxable, tax, ...splitTax(tax, intra) };
  });
  const sum = (f: (l: TaxedLine) => number) => out.reduce((n, l) => n + f(l), 0);
  return {
    lines: out,
    totals: {
      gross: sum((l) => l.gross),
      discount: sum((l) => l.discount),
      net: sum((l) => l.net),
      taxable: sum((l) => l.taxable),
      tax: sum((l) => l.tax),
      cgst: sum((l) => l.cgst),
      sgst: sum((l) => l.sgst),
      igst: sum((l) => l.igst),
    },
  };
}
