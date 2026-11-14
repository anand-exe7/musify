/**
 * Limits for the landing-page gallery. Shared by the admin uploader (to refuse early) and the API
 * (to refuse for real) so the two can never disagree.
 */
export const MEDIA_KINDS = ["image", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_LIMITS = {
  image: {
    max: 12,
    maxBytes: 5 * 1024 * 1024,
    types: ["image/jpeg", "image/png", "image/webp"],
  },
  video: {
    max: 4,
    maxBytes: 15 * 1024 * 1024,
    types: ["video/mp4", "video/webm", "video/quicktime"],
  },
} as const;

/** Each upload request carries one piece this big — comfortably under Vercel's 4.5 MB body cap. */
export const CHUNK_BYTES = 2 * 1024 * 1024;

/** Images shown on the landing page before "View more". */
export const IMAGES_SHOWN_FIRST = 4;

export interface SiteMedia {
  id: string;
  kind: MediaKind;
  /** Where the file is served from; carries the version so it can be cached for good. */
  url: string;
  size: number;
  contentType: string;
  position: number;
}

export function mb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function isMediaKind(v: unknown): v is MediaKind {
  return v === "image" || v === "video";
}

export const mediaUrl = (id: string, version: number) => `/api/media/${id}/file?v=${version}`;
