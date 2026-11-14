"use client";
import { CHUNK_BYTES, MEDIA_LIMITS, mb, type MediaKind, type SiteMedia } from "./limits";

/** Check a file against the kind's type and size limits; returns a message if it must be refused. */
export function checkFile(kind: MediaKind, file: File): string | null {
  const lim = MEDIA_LIMITS[kind];
  const types: readonly string[] = lim.types;
  if (!types.includes(file.type)) {
    return kind === "image" ? `${file.name}: use a JPG, PNG or WebP photo` : `${file.name}: use an MP4, WebM or MOV video`;
  }
  if (file.size > lim.maxBytes) return `${file.name} is ${mb(file.size)} — a ${kind} can be at most ${mb(lim.maxBytes)}`;
  return null;
}

/**
 * Photos are shrunk before upload (longest side 1800px, WebP): a phone photo of 4 MB becomes a few
 * hundred KB, which is what keeps storage and visitors' downloads small. Falls back to the original
 * if the browser can't re-encode it or the result isn't smaller.
 */
async function shrinkImage(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.82));
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}

const jsonHeaders = { "Content-Type": "application/json" };

/**
 * Upload one file with a progress callback, then make it live: add a new item, or — with
 * `replaceId` — swap the file inside an existing slot. The file goes up in 2 MB pieces (each request
 * stays under Vercel's body cap), and a failed piece is retried before giving up.
 */
export async function uploadMedia(
  kind: MediaKind,
  file: File,
  opts: { replaceId?: string; onProgress?: (pct: number) => void } = {},
): Promise<SiteMedia> {
  const bad = checkFile(kind, file);
  if (bad) throw new Error(bad);
  const body = kind === "image" ? await shrinkImage(file) : file;
  const declare = { contentType: body.type, size: body.size };

  const { id, version } = await json<{ id: string; version: number }>(
    await fetch(opts.replaceId ? `/api/media/${opts.replaceId}` : "/api/media", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(opts.replaceId ? declare : { kind, ...declare }),
    }),
  );

  try {
    const pieces = Math.ceil(body.size / CHUNK_BYTES);
    for (let i = 0; i < pieces; i++) {
      const piece = body.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
      for (let attempt = 1; ; attempt++) {
        try {
          await json(await fetch(`/api/media/${id}/chunk?v=${version}&i=${i}`, { method: "PUT", body: piece }));
          break;
        } catch (e) {
          if (attempt >= 3) throw e;
          await new Promise((r) => setTimeout(r, 600 * attempt));
        }
      }
      opts.onProgress?.(((i + 1) / pieces) * 100);
    }
    return await json<SiteMedia>(
      await fetch(`/api/media/${id}/complete`, { method: "POST", headers: jsonHeaders, body: JSON.stringify({ version, ...declare }) }),
    );
  } catch (e) {
    // A half-sent *new* item is removed at once; a half-sent replacement leaves the old file untouched.
    if (!opts.replaceId) await fetch(`/api/media/${id}`, { method: "DELETE" }).catch(() => {});
    throw e;
  }
}

export async function listMedia(): Promise<SiteMedia[]> {
  return json<SiteMedia[]>(await fetch("/api/media", { cache: "no-store" }));
}

export async function deleteMedia(id: string): Promise<void> {
  await json(await fetch(`/api/media/${id}`, { method: "DELETE" }));
}
