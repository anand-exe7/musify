/**
 * GSTIN (GST Identification Number) format validation.
 *
 * A GSTIN is exactly 15 characters:
 *   • 2 digits   — state code
 *   • 10 chars   — the holder's PAN (5 letters, 4 digits, 1 letter)
 *   • 1 char     — entity/registration number (1-9 or A-Z)
 *   • 1 char     — fixed "Z"
 *   • 1 char     — checksum (digit or letter)
 *
 * This checks the structural format only (not the checksum digit), which is
 * what the forms need to reject obviously malformed entries.
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Normalise user input: trim and upper-case (GSTINs are stored upper-case). */
export function normalizeGstin(value: string | null | undefined): string {
  return (value ?? "").toString().trim().toUpperCase();
}

/** `true` when `value` is a structurally valid 15-character GSTIN. */
export function isValidGstin(value: string | null | undefined): boolean {
  return GSTIN_REGEX.test(normalizeGstin(value));
}
