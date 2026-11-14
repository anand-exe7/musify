import { handle, readJson, ok, notFound, HttpError } from "@/lib/api/http";
import { chunkTotals, countSiteMedia, deleteSiteMedia, finishSiteMedia, getSiteMediaRow } from "@/lib/db/queries/siteMedia";
import { CHUNK_BYTES, MEDIA_LIMITS, type MediaKind } from "@/lib/media/limits";
import { checkUploadShape } from "@/lib/media/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Step 3: all pieces sent. Checks they add up to exactly the declared file, then makes it live. */
export function POST(request: Request, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    const { version, size, contentType } = await readJson<{ version?: unknown; size?: unknown; contentType?: unknown }>(request);
    const row = await getSiteMediaRow(id);
    if (!row) return notFound("That upload no longer exists");
    const kind = row.kind as MediaKind;
    const target = row.ready ? row.version + 1 : row.version;
    if (version !== target) throw new HttpError(400, "Bad upload version");
    checkUploadShape(kind, contentType, size);

    const need = Math.ceil((size as number) / CHUNK_BYTES);
    const t = await chunkTotals(id, target);
    // Every piece but the last must be a full 2 MB (the file is served by offset), and the total must match.
    if (t.count !== need || t.maxIdx !== need - 1 || t.bytes !== size || t.short !== 0) {
      throw new HttpError(400, "The upload didn't arrive in full — please try again");
    }
    if (!row.ready && (await countSiteMedia(kind)) >= MEDIA_LIMITS[kind].max) {
      await deleteSiteMedia(id);
      throw new HttpError(400, `You can keep at most ${MEDIA_LIMITS[kind].max} ${kind}s`);
    }
    const item = await finishSiteMedia(id, target, { size: size as number, contentType: contentType as string });
    return ok(item);
  });
}
