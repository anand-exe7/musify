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
  hours: string;
}

export const BUSINESS = {
  name: "Sri Saraswathy Musicals",
  tagline: "Instruments, set up by hand · Since 1978",
  gstin: "33AABCS1978Q1ZP",
  // Primary WhatsApp line customers reach for inquiries & service. Mobile only.
  whatsapp: "919884012345",
  email: "care@srisaraswathy.in",
  website: "srisaraswathymusicals.in",
  branches: [
    {
      key: "Branch 1",
      city: "Chennai",
      area: "Mylapore",
      street: "14 Kutchery Road, Mylapore",
      zip: "Chennai 600004",
      phone: "+91 44 2464 1234",
      hours: "Mon — Sat · 10:00 to 20:00",
    },
    {
      key: "Branch 2",
      city: "Bengaluru",
      area: "Basavanagudi",
      street: "62 Gandhi Bazaar Main Road",
      zip: "Bengaluru 560004",
      phone: "+91 80 2661 5678",
      hours: "Tue — Sun · 10:30 to 20:30",
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
