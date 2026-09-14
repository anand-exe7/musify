/**
 * Central business profile — used by service invoices, WhatsApp messages and
 * the customer inquiry form. Update the numbers/GSTIN here in one place.
 */

export interface BranchInfo {
  key: "Branch 1" | "Branch 2";
  city: string;
  area: string;
  street: string;
  zip: string;
  phone: string;
  // 12-digit dialable WhatsApp number (91 + 10 digits), used for wa.me links.
  whatsapp: string;
  // Google Maps share link for the branch.
  maps: string;
  hours: string;
}

export const BUSINESS = {
  name: "Sri Saraswathy Musicals",
  tagline: "Instruments, set up by hand · Since 1978",
  // Registered Tamil Nadu GSTIN (covers both Chennai branches).
  gstin: "33BDVPP9993A1ZV",
  owner: "R Punitha",
  // Primary WhatsApp line customers reach for inquiries & service (Vadapalani branch).
  whatsapp: "919940638409",
  email: "sshw1964@yahoo.co.in",
  website: "srisaraswathymusicals.in",
  branches: [
    {
      key: "Branch 1",
      city: "Chennai",
      area: "Vadapalani",
      street: "70/1, 100 Feet Road",
      zip: "Chennai 600026",
      phone: "+91 99406 38409",
      whatsapp: "919940638409",
      maps: "https://maps.app.goo.gl/Z9e67TaCuMShY7iJA",
      hours: "Mon — Sat · 10:00 to 20:00",
    },
    {
      key: "Branch 2",
      city: "Chennai",
      area: "Porur",
      street: "12, Trunk Road, Jaya Nagar",
      zip: "Chennai 600116",
      phone: "+91 72001 78753",
      whatsapp: "917200178753",
      maps: "https://maps.app.goo.gl/uhTzDhPpkhXfBYxW9",
      hours: "Mon — Sat · 10:00 to 20:00",
    },
  ] as BranchInfo[],
} as const;

export function branchInfo(key: "Branch 1" | "Branch 2"): BranchInfo {
  return BUSINESS.branches.find((b) => b.key === key) ?? BUSINESS.branches[0];
}

/**
 * Build a wa.me deep-link. Indian 10-digit numbers get a 91 prefix; anything
 * already carrying a country code is used as-is. Text is fully URL-encoded so
 * newlines survive as %0A.
 */
export function waLink(phone: string, text: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

/**
 * Absolute, customer-facing link to a repair ticket's service invoice
 * (`/invoice/service/<ticketId>`) — the public page anyone with the link can
 * open without signing in. Prefers the live browser origin; falls back to the
 * configured app URL when built on the server.
 */
export function serviceInvoiceUrl(ticketId: string): string {
  const base =
    (typeof window !== "undefined" && window.location.origin) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "";
  return `${base}/invoice/service/${ticketId}`;
}
