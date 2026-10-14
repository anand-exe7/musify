/**
 * Browser-side image compression for uploads. Photos are resized and re-encoded
 * as WebP (typically 20–80 KB) before they ever leave the device, so a 3 MB
 * phone photo never reaches the database. Falls back to JPEG on the rare
 * browser whose canvas can't encode WebP.
 */

export interface CompressOptions {
  /** Longest side in px; larger images are scaled down, smaller are kept. */
  maxSide?: number;
  /** Target ceiling for the encoded image, in bytes. */
  maxBytes?: number;
}

export class ImageError extends Error {}

const DEFAULTS: Required<CompressOptions> = { maxSide: 1200, maxBytes: 80 * 1024 };
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new ImageError("Could not read the compressed image"));
    r.readAsDataURL(blob);
  });
}

/** Compress `file` to a WebP data URI no larger than `maxBytes` where possible. */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<string> {
  const { maxSide, maxBytes } = { ...DEFAULTS, ...opts };
  if (!file.type.startsWith("image/")) throw new ImageError("Please choose an image file.");
  if (file.size > MAX_INPUT_BYTES) throw new ImageError("That image is too large (over 25 MB).");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("That image couldn't be read. Try a JPG, PNG or WebP.");
  }

  // Step the size down too if lowering quality alone can't reach the target.
  let side = maxSide;
  let best: Blob | null = null;
  try {
    for (let pass = 0; pass < 4; pass++) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new ImageError("Image processing isn't available in this browser.");
      // Flatten transparency onto white — product photos, and it keeps JPEG fallback sane.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const q of [0.82, 0.72, 0.62, 0.5]) {
        const blob = (await encode(canvas, "image/webp", q)) ?? (await encode(canvas, "image/jpeg", q));
        if (!blob) throw new ImageError("Could not compress the image.");
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= maxBytes) return toDataUrl(blob);
      }
      side = Math.round(side * 0.8);
    }
  } finally {
    bitmap.close();
  }
  if (!best) throw new ImageError("Could not compress the image.");
  return toDataUrl(best);
}
