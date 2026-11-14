import { handle, readJson, created, ok, HttpError } from "@/lib/api/http";
import { countSiteMedia, listSiteMedia, startSiteMedia, sweepStaleUploads } from "@/lib/db/queries/siteMedia";
import { MEDIA_LIMITS, isMediaKind, mb } from "@/lib/media/limits";
import { genMediaId } from "@/lib/media/ids";
import { checkUploadShape } from "@/lib/media/server";

export const dynamic = "force-dynamic";

/**
 * The landing page's gallery. Public, tiny JSON (links only — the files are fetched separately and
 * cached by the browser for good), and cached at the edge for a minute so a busy day of visitors
 * costs the database one read, not thousands.
 */
export function GET() {
  return handle("public", async () => {
    return ok(await listSiteMedia(), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } });
  });
}

/** Step 1 of an upload: declare the file. Refuses early if it can't fit; otherwise opens a slot to send pieces to. */
export function POST(request: Request) {
  return handle("admin", async () => {
    const { kind, contentType, size } = await readJson<{ kind?: unknown; contentType?: unknown; size?: unknown }>(request);
    if (!isMediaKind(kind)) throw new HttpError(400, "Bad request");
    checkUploadShape(kind, contentType, size);
    await sweepStaleUploads();
    if ((await countSiteMedia(kind)) >= MEDIA_LIMITS[kind].max) {
      throw new HttpError(400, `You can keep at most ${MEDIA_LIMITS[kind].max} ${kind}s (${mb(MEDIA_LIMITS[kind].maxBytes)} each)`);
    }
    const id = genMediaId();
    await startSiteMedia({ id, kind, contentType: contentType as string, size: size as number });
    return created({ id, version: 1 });
  });
}
