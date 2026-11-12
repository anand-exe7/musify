/**
 * Photos are stored as data URLs (tens of KB each). Screens that only display them are sent a URL to an image
 * route instead, so a product with eight photographed variants opens in milliseconds rather than shipping a
 * quarter of a megabyte of base64 inside the JSON.
 *
 * A form that was given those URLs sends them back untouched when the photo wasn't changed, so saving has to
 * read them as "keep what is stored" — that is what `isPhotoRef` marks, and what `keptPhoto` resolves.
 */
const REF =
  /^\/api\/(?:pos\/inventory\/[^/]+\/(?:photo|gallery\/\d+)|inventory\/variants\/[^/]+\/photo|catalog\/(?:variants\/[^/]+\/photo|[^/]+\/gallery\/\d+))(?:\?|$)/;

/** True when this value is one of our own image-route URLs, i.e. a photo that was shown but not changed. */
export const isPhotoRef = (v: unknown): v is string => typeof v === "string" && REF.test(v);

/** The gallery slot a reference points at (`…/gallery/2` → 2); `…/photo` is slot 0. */
export function photoRefIndex(ref: string): number {
  const m = /\/gallery\/(\d+)/.exec(ref);
  return m ? Number(m[1]) : 0;
}

/** URL for a product's gallery slot. */
export const galleryRef = (productId: string, i: number, key: string) =>
  `/api/pos/inventory/${encodeURIComponent(productId)}/gallery/${i}?v=${key.slice(0, 12)}`;

/** URL for one variant's photo. */
export const variantRef = (variantId: string, key: string) =>
  `/api/inventory/variants/${encodeURIComponent(variantId)}/photo?v=${key.slice(0, 12)}`;

/* The storefront's own, unauthenticated pair of the two above: the shop, a product page and the cart
 * show photos to visitors who are not signed in, so they point at `/api/catalog/…` instead. */

/** Public URL for a product's gallery slot. */
export const publicGalleryRef = (productId: string, i: number, key: string) =>
  `/api/catalog/${encodeURIComponent(productId)}/gallery/${i}?v=${key.slice(0, 12)}`;

/** Public URL for one variant's photo. */
export const publicVariantRef = (variantId: string, key: string) =>
  `/api/catalog/variants/${encodeURIComponent(variantId)}/photo?v=${key.slice(0, 12)}`;

/**
 * What to store for a photo field the editor sent back: an unchanged reference keeps `stored`, anything else
 * (a new data URL, a plain URL, or null) is taken as given.
 */
export const keptPhoto = (incoming: string | null | undefined, stored: string | null | undefined): string | null =>
  isPhotoRef(incoming) ? (stored ?? null) : (incoming || null);

/** Resolve a whole gallery the editor sent back against what is stored, dropping empties. */
export function keptGallery(
  incoming: readonly (string | null | undefined)[],
  stored: { photo: string | null; photos: string[] | null },
): string[] {
  const slots = stored.photos && stored.photos.length > 0 ? stored.photos : stored.photo ? [stored.photo] : [];
  const out: string[] = [];
  for (const v of incoming) {
    if (isPhotoRef(v)) {
      const hit = slots[photoRefIndex(v)];
      if (hit) out.push(hit);
    } else if (v) {
      out.push(v);
    }
  }
  return out;
}
