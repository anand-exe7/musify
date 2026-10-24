/**
 * Customers are recognised by their mobile number, however it was typed ("98765 43210", "+91-98765-43210",
 * "09876543210"). Both the server (to file a customer) and the billing screen (to look one up) use this one rule.
 */

/** The 10-digit Indian mobile number inside `raw`, or null when there isn't a valid one. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const last10 = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(last10) ? last10 : null;
}

/** "9876543210" → "98765 43210" (anything else is returned as it came). */
export function formatPhone(phone: string): string {
  return /^\d{10}$/.test(phone) ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}
