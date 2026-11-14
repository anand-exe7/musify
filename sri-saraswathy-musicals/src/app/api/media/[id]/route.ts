import { handle, readJson, ok, notFound, HttpError } from "@/lib/api/http";
import { deleteSiteMedia, dropPendingChunks, getSiteMediaRow } from "@/lib/db/queries/siteMedia";
import { checkUploadShape } from "@/lib/media/server";
import type { MediaKind } from "@/lib/media/limits";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Step 1 of replacing the file in a slot: declare the new file. Returns the version to send pieces under. */
export function POST(request: Request, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    const { contentType, size } = await readJson<{ contentType?: unknown; size?: unknown }>(request);
    const row = await getSiteMediaRow(id);
    if (!row || !row.ready) return notFound("That item no longer exists");
    checkUploadShape(row.kind as MediaKind, contentType, size);
    await dropPendingChunks(id, row.version);
    return ok({ id, version: row.version + 1 });
  });
}

export function DELETE(_request: Request, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    if (!(await deleteSiteMedia(id))) throw new HttpError(404, "That item no longer exists");
    return ok({ ok: true });
  });
}
