/**
 * Shared document-number format used across the app's record types:
 * `PREFIX-YEAR-XXXXX` (5 random base36 characters), e.g. `INV-2026-7QK3M`.
 *
 * INV — sales invoices (`invoices`)
 * INQ — customer inquiries (`inquiries`)
 * REP — repair tickets (`repair_tickets`)
 * SER — service invoices (`repair_tickets.invoiceNo`)
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export type DocPrefix = "INV" | "INQ" | "REP" | "SER" | "ORD";

function randomSuffix(len = 5): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function genDocId(prefix: DocPrefix, year: number = new Date().getFullYear()): string {
  return `${prefix}-${year}-${randomSuffix()}`;
}
