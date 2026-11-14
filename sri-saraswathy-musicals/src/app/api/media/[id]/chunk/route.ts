import { handle, ok, notFound, HttpError } from "@/lib/api/http";
import { getSiteMediaRow, putChunk } from "@/lib/db/queries/siteMedia";
import { CHUNK_BYTES, MEDIA_LIMITS, type MediaKind } from "@/lib/media/limits";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Step 2: one 2 MB piece of the file, as the raw request body. `?v=` is the version, `?i=` the piece number. */
export function PUT(request: Request, ctx: Ctx) {
  return handle("admin", async () => {
    const { id } = await ctx.params;
    const q = new URL(request.url).searchParams;
    const v = Number(q.get("v"));
    const i = Number(q.get("i"));
    const row = await getSiteMediaRow(id);
    if (!row) return notFound("That upload no longer exists");
    const target = row.ready ? row.version + 1 : row.version;
    const maxPieces = Math.ceil(MEDIA_LIMITS[row.kind as MediaKind].maxBytes / CHUNK_BYTES);
    if (v !== target || !Number.isInteger(i) || i < 0 || i >= maxPieces) throw new HttpError(400, "Bad upload piece");
    const body = Buffer.from(await request.arrayBuffer());
    if (body.length === 0 || body.length > CHUNK_BYTES) throw new HttpError(400, "Bad upload piece size");
    await putChunk(id, v, i, body);
    return ok({ ok: true });
  });
}
