/**
 * GST return builders — turn the unified invoice ledger into the exact figures
 * printed on the government GSTR-1 and GSTR-3B forms. Kept as pure functions so
 * the print sheets stay presentation-only and the arithmetic is testable.
 *
 * Each invoice contributes one "Sale" row: `Value` is the invoice grand total
 * (`inv.total`), while `Taxable Value` is the assessable amount (`inv.subtotal`)
 * and the tax is that taxable value at the invoice's rate. The two can differ
 * (e.g. when the total carries delivery or an exempt line), exactly as the
 * statutory form allows.
 */
import type { Invoice } from "@/types";

/* ─────────────────────────────  State codes  ───────────────────────────── */

/** GST state/UT codes — used to print "33-Tamil Nadu" on the return header. */
export const STATE_CODES: Record<string, string> = {
  "Jammu & Kashmir": "01", "Himachal Pradesh": "02", "Punjab": "03", "Chandigarh": "04",
  "Uttarakhand": "05", "Haryana": "06", "Delhi": "07", "Rajasthan": "08", "Uttar Pradesh": "09",
  "Bihar": "10", "Sikkim": "11", "Arunachal Pradesh": "12", "Nagaland": "13", "Manipur": "14",
  "Mizoram": "15", "Tripura": "16", "Meghalaya": "17", "Assam": "18", "West Bengal": "19",
  "Jharkhand": "20", "Odisha": "21", "Chhattisgarh": "22", "Madhya Pradesh": "23", "Gujarat": "24",
  "Maharashtra": "27", "Andhra Pradesh": "37", "Karnataka": "29", "Goa": "30", "Kerala": "32",
  "Tamil Nadu": "33", "Telangana": "36", "Puducherry": "34", "Ladakh": "38",
  "Andaman & Nicobar": "35",
};

/** e.g. "Tamil Nadu" → "33-Tamil Nadu"; unknown states print without a code. */
export function stateWithCode(state: string): string {
  const code = STATE_CODES[state];
  return code ? `${code}-${state}` : state;
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ─────────────────────────────  Formatting  ───────────────────────────── */

/** Fixed 2-decimal string, e.g. 161.0169 → "161.02". Never grouped. */
export function fmt2(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

/** ISO date → "dd-mm-yyyy" as printed on the return. */
export function fmtDMY(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/* ─────────────────────────────  Period  ───────────────────────────── */

export interface Period {
  fromYear: number;
  fromMonth: number; // 0-based (0 = January)
  toYear: number;
  toMonth: number;   // 0-based
}

/** Month-of-year ordinal used to test a date against an inclusive range. */
function ord(year: number, month: number): number {
  return year * 12 + month;
}

function inPeriod(iso: string, p: Period): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const o = ord(d.getFullYear(), d.getMonth());
  return o >= ord(p.fromYear, p.fromMonth) && o <= ord(p.toYear, p.toMonth);
}

/* ─────────────────────────────  Row helpers  ───────────────────────────── */

/**
 * Representative GST rate for an invoice — the first taxed line's rate, falling
 * back to the configured standard slab. Retail bills carry a single slab, so
 * this reproduces the filed rate exactly.
 */
function invoiceRate(inv: Invoice, standardRate: number): number {
  const r = inv.items?.find((i) => i.gst > 0)?.gst;
  return r || standardRate || 18;
}

export interface Gstr1SaleRow {
  gstin: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceValue: number;
  rate: number;
  cessRate: number;
  taxableValue: number;
  integratedTax: number;
  centralTax: number;
  stateTax: number;
  cess: number;
  placeOfSupply: string;
}

export interface GstTotals {
  invoiceValue: number;
  taxableValue: number;
  integratedTax: number;
  centralTax: number;
  stateTax: number;
  cess: number;
}

export interface Gstr1Data {
  sales: Gstr1SaleRow[];
  totals: GstTotals;
}

const ZERO_TOTALS: GstTotals = {
  invoiceValue: 0, taxableValue: 0, integratedTax: 0, centralTax: 0, stateTax: 0, cess: 0,
};

/**
 * Build the GSTR-1 "Sale" section for the period. Each completed/paid invoice
 * becomes one row; the tax is split into IGST (inter-state, where the ledger
 * recorded an IGST amount) or CGST+SGST (intra-state) and every figure is
 * rounded to paise so the printed rows sum to the printed totals.
 */
export function buildGstr1(
  invoices: Invoice[],
  period: Period,
  cfg: { standardRate: number; homeState: string },
): Gstr1Data {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const rows: Gstr1SaleRow[] = [];
  const totals: GstTotals = { ...ZERO_TOTALS };

  const scoped = invoices
    .filter((inv) => inv.status !== "cancelled" && inPeriod(inv.date, period))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  for (const inv of scoped) {
    const rate = invoiceRate(inv, cfg.standardRate);
    const value = round2(inv.total);
    const taxable = round2(inv.subtotal);
    // Tax on the assessable value at the invoice's slab. Inter-state supplies
    // (the ledger recorded an IGST amount) go to IGST; everything else splits
    // into equal CGST + SGST halves, matching the invoice.
    const inter = (inv.igst ?? 0) > 0;
    const half = round2((taxable * rate) / 200);
    const full = round2((taxable * rate) / 100);

    const row: Gstr1SaleRow = {
      gstin: "",
      invoiceNo: inv.number,
      invoiceDate: fmtDMY(inv.date),
      invoiceValue: value,
      rate,
      cessRate: 0,
      taxableValue: taxable,
      integratedTax: inter ? full : 0,
      centralTax: inter ? 0 : half,
      stateTax: inter ? 0 : half,
      cess: 0,
      placeOfSupply: "",
    };
    rows.push(row);

    totals.invoiceValue = round2(totals.invoiceValue + row.invoiceValue);
    totals.taxableValue = round2(totals.taxableValue + row.taxableValue);
    totals.integratedTax = round2(totals.integratedTax + row.integratedTax);
    totals.centralTax = round2(totals.centralTax + row.centralTax);
    totals.stateTax = round2(totals.stateTax + row.stateTax);
    totals.cess = round2(totals.cess + row.cess);
  }

  return { sales: rows, totals };
}

/* ─────────────────────────────  GSTR-3B  ───────────────────────────── */

export interface Gstr3bData {
  /** Row 1(a) — outward taxable supplies (other than zero/nil/exempt). */
  outward: GstTotals;
}

/** GSTR-3B section 1(a) is the aggregate of the GSTR-1 sales for the period. */
export function buildGstr3b(gstr1: Gstr1Data): Gstr3bData {
  return { outward: gstr1.totals };
}
