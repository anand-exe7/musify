import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ─────────────────────────────  Money  ─────────────────────────────
 * App-wide invariant: every money value carried in code and stored in the DB
 * is an integer number of **paise** (₹1 = 100 paise). Only display helpers and
 * form inputs convert to/from rupees. This keeps all arithmetic exact and lets
 * GST be extracted once, at the end, without per-line rounding drift.
 */

/** Paise (integer) → rupees (float). e.g. 118000 → 1180. */
export function paise(p: number): number {
  return (Number(p) || 0) / 100;
}

/** Rupees (number or "1180.50" string) → integer paise. e.g. 1180.5 → 118050. */
export function toPaise(rupees: number | string): number {
  return Math.round((Number(rupees) || 0) * 100);
}

/** Paise → plain rupee string with 2 decimals, no symbol (for `<input>` values). e.g. 118050 → "1180.50". */
export function rupeeInput(p: number): string {
  return (Math.round(Number(p) || 0) / 100).toFixed(2);
}

/** Format an integer paise amount as ₹ with 2 decimals. e.g. 118000 → "₹1,180.00". */
export function formatINR(amountPaise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(amountPaise) || 0) / 100);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** Whole number → Indian-format words (lakh/crore), e.g. 5310 → "Five Thousand Three Hundred Ten". */
function numberToWords(num: number): string {
  const two = (n: number): string => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
  const three = (n: number): string => {
    const h = Math.floor(n / 100), r = n % 100;
    return (h ? ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? two(r) : "");
  };
  let n = Math.max(0, Math.round(num));
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  return [
    crore && three(crore) + " Crore",
    lakh && two(lakh) + " Lakh",
    thousand && two(thousand) + " Thousand",
    n && three(n),
  ].filter(Boolean).join(" ").trim();
}

/**
 * Integer paise → the full amount-in-words phrase for a tax invoice, e.g.
 * 118050 → "Rupees One Thousand One Hundred Eighty and Fifty Paise Only".
 */
export function amountInWords(amountPaise: number): string {
  const total = Math.max(0, Math.round(Number(amountPaise) || 0));
  const rupees = Math.floor(total / 100);
  const p = total % 100;
  const rupeeWords = `Rupees ${numberToWords(rupees)}`;
  return (p > 0 ? `${rupeeWords} and ${numberToWords(p)} Paise` : rupeeWords) + " Only";
}

/** GST split on a **paise** amount at a percentage rate. Rounds to whole paise. */
export function calculateGST(amountPaise: number, ratePct: number) {
  const gstAmount = Math.round((amountPaise * ratePct) / 100);
  const cgst = Math.round(gstAmount / 2);
  return {
    cgst,
    sgst: gstAmount - cgst,
    total: gstAmount,
    grand: amountPaise + gstAmount,
  };
}
