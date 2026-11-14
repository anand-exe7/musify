import { HttpError } from "@/lib/api/errors";
import { MEDIA_LIMITS, mb, type MediaKind } from "./limits";

/** Refuse a declared file that breaks the kind's type or size rule. */
export function checkUploadShape(kind: MediaKind, contentType: unknown, size: unknown): void {
  const lim = MEDIA_LIMITS[kind];
  const types: readonly string[] = lim.types;
  if (typeof contentType !== "string" || !types.includes(contentType)) throw new HttpError(400, `That file type isn't allowed for a ${kind}`);
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) throw new HttpError(400, "Bad file size");
  if (size > lim.maxBytes) throw new HttpError(400, `A ${kind} can be at most ${mb(lim.maxBytes)}`);
}
