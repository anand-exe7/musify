/**
 * Quotation maths and wording — pure, so the server (which is the source of
 * truth) and the editor preview run the same arithmetic. Prices are
 * GST-inclusive, like every other channel, so tax is extracted from the gross.
 */
import { taxLines } from "@/lib/gst/inclusive";
import type { QuotationLine } from "@/types";

export const QUOTE_VALID_DAYS = 30;

/** The standard terms printed on every quotation. */
export const QUOTE_TERMS = [
  `This quotation is valid for ${QUOTE_VALID_DAYS} days from the date of issue.`,
  "Prices may change after the validity period.",
  "An advance payment is required to start the work or process the order.",
  "Subject to ‘Chennai’ jurisdiction only.",
] as const;

/** ISO date `days` after `from`. */
export function addDays(from: string, days: number): string {
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return from;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export type QuoteTotals = { subtotal: number; cgst: number; sgst: number; igst: number; total: number };

/** Each line's `amount` plus the totals after the quotation-level discount. */
export function computeQuote(
  items: Pick<QuotationLine, "qty" | "rate" | "gst" | "discount">[],
  discount = 0,
): { amounts: number[]; totals: QuoteTotals } {
  const amounts = items.map((l) => Math.max(0, Math.round((l.qty || 0) * (l.rate || 0)) - Math.max(0, l.discount || 0)));
  const { totals } = taxLines(
    items.map((l, i) => ({ gross: amounts[i], rate: l.gst || 0 })),
    discount,
    true,
  );
  return { amounts, totals: { subtotal: totals.taxable, cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst, total: totals.net } };
}
