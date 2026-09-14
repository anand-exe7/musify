/**
 * Per-branch, rate-wise GST summary built from the unified invoice ledger, plus
 * small CSV helpers. Pure functions — the page stays presentation-only.
 *
 * Each invoice contributes its assessable value (`subtotal`) and the tax it
 * actually carried (`cgst + sgst + igst`) to the bucket for its GST slab. Retail
 * bills are single-slab, so bucketing by the invoice's representative rate
 * reproduces the filed figures; a mixed-rate invoice lands in its primary slab.
 */
import type { Invoice } from "@/types";

export interface RateBucket {
  rate: number; // 0, 5, 12, 18, 28…
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number; // cgst + sgst + igst
  invoiceValue: number; // grand total
  count: number;
}

export interface GstSummary {
  buckets: RateBucket[]; // sorted by rate ascending, only slabs with data
  totals: RateBucket; // rate is meaningless on the totals row
}

/** The GST slab an invoice was filed at — derived from its taxed lines, or from
 *  the tax/taxable ratio as a fallback; 0 for a non-GST (bill-of-supply) sale. */
export function invoiceRateOf(inv: Invoice): number {
  const tax = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
  if (tax <= 0) return 0;
  const lineRate = inv.items?.find((i) => i.gst > 0)?.gst ?? 0;
  if (lineRate) return lineRate;
  return inv.subtotal > 0 ? Math.round((tax / inv.subtotal) * 100) : 0;
}

function emptyBucket(rate: number): RateBucket {
  return { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, invoiceValue: 0, count: 0 };
}

/** Roll the given (already period/branch-filtered) invoices into rate buckets. */
export function rateWiseSummary(invoices: Invoice[]): GstSummary {
  const map = new Map<number, RateBucket>();
  const totals = emptyBucket(-1);

  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const rate = invoiceRateOf(inv);
    const b = map.get(rate) ?? emptyBucket(rate);
    const cgst = inv.cgst || 0;
    const sgst = inv.sgst || 0;
    const igst = inv.igst || 0;
    const tax = cgst + sgst + igst;
    b.taxable += inv.subtotal;
    b.cgst += cgst;
    b.sgst += sgst;
    b.igst += igst;
    b.tax += tax;
    b.invoiceValue += inv.total;
    b.count += 1;
    map.set(rate, b);

    totals.taxable += inv.subtotal;
    totals.cgst += cgst;
    totals.sgst += sgst;
    totals.igst += igst;
    totals.tax += tax;
    totals.invoiceValue += inv.total;
    totals.count += 1;
  }

  const buckets = [...map.values()].sort((a, b) => a.rate - b.rate);
  return { buckets, totals };
}

/* ─────────────────────────────  CSV  ───────────────────────────── */

export function csvEscape(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}
