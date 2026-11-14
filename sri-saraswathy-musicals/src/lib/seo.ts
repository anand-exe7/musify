/**
 * Single source of truth for everything SEO needs to know about the site:
 * the canonical origin, default copy, and the JSON-LD (schema.org) builders.
 * Business facts (name, phone, branches, hours) come from `BUSINESS` so a
 * change there flows into the markup automatically.
 */
import { BUSINESS } from "@/lib/data/business";
import type { Product } from "@/types";

/** Canonical origin — no trailing slash. Override per-environment with NEXT_PUBLIC_SITE_URL. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.srisaraswathymusicals.in").replace(/\/+$/, "");

export const SITE_NAME = BUSINESS.name;
export const SITE_TITLE = "Sri Saraswathy Musicals — Musical Instruments Store in Chennai";
export const SITE_DESCRIPTION =
  "Buy violins, veenas, sitars, guitars, keyboards, tablas and more from Sri Saraswathy Musicals, Chennai — Indian classical and Western instruments, hand set-up by luthiers since 1965. Visit our Vadapalani, Porur and Ashok Nagar showrooms.";
export const SITE_KEYWORDS = [
  "musical instruments Chennai",
  "music shop Chennai",
  "buy violin online",
  "veena",
  "sitar",
  "tabla",
  "guitar",
  "keyboard",
  "Indian classical instruments",
  "Sri Saraswathy Musicals",
  "Vadapalani",
  "Porur",
  "Ashok Nagar",
];

/** Absolute URL for a site path (or pass-through for an already-absolute URL). */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** "Chennai 600026" → "600026". */
const postalCode = (zip: string) => zip.match(/\d{6}/)?.[0] ?? zip;
/** "+91 9087 22 22 56" → "+919087222256". */
const e164 = (phone: string) => `+${phone.replace(/\D/g, "")}`;

/** Organization + one MusicStore (LocalBusiness) per branch, linked into a single @graph. */
export function organizationJsonLd() {
  const orgId = `${SITE_URL}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: SITE_NAME,
        url: SITE_URL,
        logo: absoluteUrl("/Logo.png"),
        foundingDate: "1965",
        email: BUSINESS.email,
        slogan: "Instruments, set up by hand",
      },
      ...BUSINESS.branches.map((b) => ({
        "@type": "MusicStore",
        "@id": `${SITE_URL}/#branch-${b.key.toLowerCase().replace(/\s+/g, "-")}`,
        name: `${SITE_NAME} — ${b.area}`,
        url: SITE_URL,
        image: absoluteUrl("/Logo.png"),
        parentOrganization: { "@id": orgId },
        telephone: e164(b.phone),
        hasMap: b.maps,
        address: {
          "@type": "PostalAddress",
          streetAddress: b.street,
          addressLocality: b.city,
          addressRegion: "Tamil Nadu",
          postalCode: postalCode(b.zip),
          addressCountry: "IN",
        },
        openingHoursSpecification: [
          {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
            opens: "10:00",
            closes: "20:00",
          },
        ],
      })),
    ],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    inLanguage: "en-IN",
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/shop?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

/** The product's main photo as an absolute URL (our own photo routes are site-relative). */
export function productImage(p: Product): string | undefined {
  const src = p.photos?.[0] ?? p.photo;
  return src ? absoluteUrl(src) : undefined;
}

/** Plain-text description for meta tags: tagline + description, collapsed and trimmed to ~160 chars. */
export function productDescription(p: Product): string {
  const raw = [p.tagline, p.description].filter(Boolean).join(" — ").replace(/\s+/g, " ").trim();
  const base = raw || `${p.name} from ${SITE_NAME}, Chennai.`;
  return base.length > 160 ? `${base.slice(0, 157).trimEnd()}…` : base;
}

/** schema.org Product with an Offer (prices are stored in paise). */
export function productJsonLd(p: Product) {
  const image = [p.photos?.length ? p.photos : p.photo ? [p.photo] : []].flat().map(absoluteUrl);
  const url = absoluteUrl(`/product/${p.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    ...(image.length ? { image } : {}),
    description: productDescription(p),
    sku: p.id,
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    category: p.category,
    url,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "INR",
      price: (p.price / 100).toFixed(2),
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${SITE_URL}/#organization` },
    },
    // Only emit a rating when there are real reviews behind it (Google rejects empty ones).
    ...(p.reviews > 0 && p.rating > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews } }
      : {}),
  };
}
