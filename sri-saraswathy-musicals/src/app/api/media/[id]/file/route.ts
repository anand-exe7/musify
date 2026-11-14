import { NextResponse } from "next/server";
import { handle } from "@/lib/api/http";
import { getSiteMediaRow, readRange } from "@/lib/db/queries/siteMedia";
import { CHUNK_BYTES, mediaUrl } from "@/lib/media/limits";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Most one response carries — Vercel won't send a buffered body over 4.5 MB. A browser just asks for the next range. */
const MAX_PIECE = 2 * CHUNK_BYTES;

/**
 * The stored file. The URL carries `?v=<version>`, so a response never changes and is cached for a
 * year by the browser and the CDN: after the first view, the database isn't asked again. Supports
 * byte ranges (Safari and most players need them to play video, and to skip ahead without downloading it all).
 */
export function GET(request: Request, ctx: Ctx) {
  return handle("public", async () => {
    const { id } = await ctx.params;
    const v = Number(new URL(request.url).searchParams.get("v"));
    const row = await getSiteMediaRow(id);
    if (!row || !row.ready) return new NextResponse(null, { status: 404 });
    // An out-of-date link (the file was replaced): send the browser to the current one, briefly cached.
    if (v !== row.version) {
      return new NextResponse(null, { status: 307, headers: { Location: mediaUrl(id, row.version), "Cache-Control": "public, max-age=60" } });
    }

    const size = row.size;
    const headers: Record<string, string> = {
      "Content-Type": row.contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };

    const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (m && (m[1] || m[2])) {
      let start: number;
      let end: number;
      if (m[1] === "") { start = Math.max(0, size - Number(m[2])); end = size - 1; }
      else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1); }
      if (start >= size || start > end) {
        return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
      }
      end = Math.min(end, start + MAX_PIECE - 1);
      const body = await readRange(id, v, start, end);
      return new NextResponse(new Uint8Array(body), {
        status: 206,
        headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
      });
    }

    // Whole file: streamed one piece at a time so memory stays small and nothing hits the response cap.
    let next = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (next >= size) return controller.close();
        const end = Math.min(next + CHUNK_BYTES, size) - 1;
        controller.enqueue(new Uint8Array(await readRange(id, v, next, end)));
        next = end + 1;
      },
    });
    return new NextResponse(stream, { headers: { ...headers, "Content-Length": String(size) } });
  });
}
