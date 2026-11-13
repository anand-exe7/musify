/**
 * Central business profile — used by service invoices, WhatsApp messages and
 * the customer inquiry form. Update the numbers/GSTIN here in one place.
 */

import { waUrl } from "@/lib/whatsapp";

export interface BranchInfo {
  /** Stable id stored in every `branch` column, e.g. "Branch 3". */
  key: string;
  city: string;
  area: string;
  street: string;
  zip: string;
  phone: string;
  // 12-digit dialable WhatsApp number (91 + 10 digits), used for WhatsApp links.
  whatsapp: string;
  // Google Maps share link for the branch.
  maps: string;
  /** Exact text the embedded map is searched by. Set it when searching by shop name + street lands on the
   *  wrong spot; falls back to "<shop name>, <street>, <area>, <zip>". */
  mapQuery?: string;
  hours: string;
}

export const BUSINESS = {
  name: "Sri Saraswathy Musicals",
  tagline: "Instruments, set up by hand · Since 1965",
  // Registered Tamil Nadu GSTIN (covers every Chennai branch).
  gstin: "33BDVPP9993A1ZV",
  owner: "R Punitha",
  // The single WhatsApp line every customer chat is directed to, whichever branch they pick.
  whatsapp: "919840088111",
  email: "sshw1964@yahoo.co.in",
  website: "srisaraswathymusicals.in",
  /**
   * THE list of branches. Adding a branch = add one entry here (key "Branch N"),
   * then run a migration that widens the `*_branch_check` constraints (they are
   * built from this list) — everything else (stock buckets, switchers, forms,
   * storefront) derives from it.
   */
  branches: [
    {
      key: "Branch 1",
      city: "Chennai",
      area: "Vadapalani",
      street: "70/1, 100 Feet Road",
      zip: "Chennai 600026",
      phone: "+91 9087 22 22 56",
      whatsapp: "919840088111",
      maps: "https://maps.app.goo.gl/Z9e67TaCuMShY7iJA",
      hours: "Mon — Sat · 10:00 to 20:00",
    },
    {
      key: "Branch 2",
      city: "Chennai",
      area: "Porur",
      street: "12, Trunk Road, Jaya Nagar",
      zip: "Chennai 600116",
      phone: "+91 9087 22 22 57",
      whatsapp: "919840088111",
      maps: "https://maps.app.goo.gl/uhTzDhPpkhXfBYxW9",
      hours: "Mon — Sat · 10:00 to 20:00",
    },
    {
      key: "Branch 3",
      city: "Chennai",
      area: "Ashok Nagar",
      street: "68A, 100 Feet Road, Zaffarkhanpet",
      zip: "Chennai 600083",
      // The shop's own Google Maps place, so the pin lands on the door rather than on the road.
      mapQuery: "13.0365631,80.2121385",
      phone: "+91 9087 22 22 58",
      whatsapp: "919840088111",
      maps: "https://maps.app.goo.gl/FjmQfoo7EMBEDbod7",
      hours: "Mon — Sat · 10:00 to 20:00",
    },
  ] as BranchInfo[],
} as const;

/** "+91 99406 38409" / "9940638409" / "099406 38409" → "919940638409". Empty when it isn't a usable number. */
export function toWhatsAppNumber(phone: string): string {
  let d = (phone || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return "";
}

export function branchInfo(key: string): BranchInfo {
  return BUSINESS.branches.find((b) => b.key === key) ?? BUSINESS.branches[0];
}

/**
 * WhatsApp link for `text` to `phone` — `https://api.whatsapp.com/send/?phone=…&text=…` (not `wa.me`, whose
 * redirect breaks emojis). Indian 10-digit numbers get a 91 prefix. See `@/lib/whatsapp`.
 */
export function waLink(phone: string, text: string): string {
  return waUrl(phone, text);
}

/**
 * Absolute, customer-facing link to a repair ticket's tax invoice
 * (`/invoice/<ticketId>`) — the public page anyone with the link can open
 * without signing in. The URL uses the ticket's opaque random id so links
 * aren't enumerable; the sequential GST invoice number is shown inside.
 * Prefers the live browser origin; falls back to the configured app URL when
 * built on the server.
 */
export function serviceInvoiceUrl(ticketId: string): string {
  const base =
    (typeof window !== "undefined" && window.location.origin) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "";
  return `${base}/invoice/${ticketId}`;
}
