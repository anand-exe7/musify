/**
 * GST return builders — turn the unified invoice ledger into the exact figures
 * printed on the government GSTR-1 and GSTR-3B forms. Kept as pure functions so
 * the print sheets stay presentation-only and the arithmetic is testable.
 *
 * Each invoice contributes one "Sale" row: `Value` is the invoice grand total
 * (`inv.total`), `Taxable Value` is the assessable amount (`inv.subtotal`), and
 * the tax columns are the CGST / SGST / IGST the ledger RECORDED on the invoice
 * — never recomputed here, so the return always agrees with the invoices.
 */
import type { Invoice } from "@/types";
import { invoiceRateOf } from "@/lib/gst/summary";

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

/** An invoice whose date can't be read. A statutory return must never be
 *  silently short-filed, so this stops the build instead of skipping it. */
export class InvalidInvoiceDateError extends Error {
  constructor(
    public readonly invoiceNumber: string,
    public readonly rawDate: string,
  ) {
    super(`Invoice ${invoiceNumber || "(no number)"} has an unreadable date (${JSON.stringify(rawDate)}). Fix it before filing — it would otherwise be left out of the return.`);
    this.name = "InvalidInvoiceDateError";
  }
}

function inPeriod(inv: Invoice, p: Period): boolean {
  const d = new Date(inv.date);
  if (Number.isNaN(d.getTime())) throw new InvalidInvoiceDateError(inv.number, inv.date);
  const o = ord(d.getFullYear(), d.getMonth());
  return o >= ord(p.fromYear, p.fromMonth) && o <= ord(p.toYear, p.toMonth);
}

/* ─────────────────────────────  Row helpers  ───────────────────────────── */

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
 * Build the GSTR-1 "Sale" section for the period. Each non-cancelled invoice
 * becomes one row. Tax is read straight from the invoice's recorded CGST / SGST
 * / IGST (so mixed-rate carts, exempt lines and discounts all come out as
 * invoiced), and the rate shown is the same one the GST Collections screen uses
 * (`invoiceRateOf`). Throws {@link InvalidInvoiceDateError} rather than
 * dropping an invoice whose date can't be read.
 */
export function buildGstr1(invoices: Invoice[], period: Period): Gstr1Data {
  const rows: Gstr1SaleRow[] = [];
  const totals: GstTotals = { ...ZERO_TOTALS };

  const scoped = invoices
    .filter((inv) => inv.status !== "cancelled" && inPeriod(inv, period))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  for (const inv of scoped) {
    const rate = invoiceRateOf(inv);
    const value = inv.total;
    const taxable = inv.subtotal;
    const row: Gstr1SaleRow = {
      gstin: "",
      invoiceNo: inv.number,
      invoiceDate: fmtDMY(inv.date),
      invoiceValue: value,
      rate,
      cessRate: 0,
      taxableValue: taxable,
      integratedTax: inv.igst ?? 0,
      centralTax: inv.cgst ?? 0,
      stateTax: inv.sgst ?? 0,
      cess: 0,
      placeOfSupply: "",
    };
    rows.push(row);

    totals.invoiceValue += row.invoiceValue;
    totals.taxableValue += row.taxableValue;
    totals.integratedTax += row.integratedTax;
    totals.centralTax += row.centralTax;
    totals.stateTax += row.stateTax;
    totals.cess += row.cess;
  }

  return { sales: rows, totals };
}

export const EMPTY_GSTR1: Gstr1Data = { sales: [], totals: { ...ZERO_TOTALS } };

/** {@link buildGstr1} for screens: a bad invoice date comes back as a message to
 *  show, not an exception that blanks the page. */
export function safeGstr1(
  invoices: Invoice[],
  period: Period,
): { data: Gstr1Data; error: null } | { data: Gstr1Data; error: string } {
  try {
    return { data: buildGstr1(invoices, period), error: null };
  } catch (err) {
    if (err instanceof InvalidInvoiceDateError) return { data: EMPTY_GSTR1, error: err.message };
    throw err;
  }
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
