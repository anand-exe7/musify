import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteMedia, siteMediaChunks } from "@/lib/db/schema";
import { mediaUrl, CHUNK_BYTES, type MediaKind, type SiteMedia } from "@/lib/media/limits";

type Row = typeof siteMedia.$inferSelect;

const toItem = (r: Row): SiteMedia => ({
  id: r.id,
  kind: r.kind as MediaKind,
  url: mediaUrl(r.id, r.version),
  size: r.size,
  contentType: r.contentType,
  position: r.position,
});

/** Photos first, then videos; each in the admin's order. Only finished uploads. */
export async function listSiteMedia(): Promise<SiteMedia[]> {
  const rs = await db
    .select()
    .from(siteMedia)
    .where(eq(siteMedia.ready, true))
    .orderBy(asc(siteMedia.kind), asc(siteMedia.position), asc(siteMedia.createdAt));
  return rs.map(toItem);
}

export async function getSiteMediaRow(id: string): Promise<Row | undefined> {
  const [r] = await db.select().from(siteMedia).where(eq(siteMedia.id, id)).limit(1);
  return r;
}

export { toItem as siteMediaItem };

export async function countSiteMedia(kind: MediaKind): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(siteMedia)
    .where(and(eq(siteMedia.kind, kind), eq(siteMedia.ready, true)));
  return r?.n ?? 0;
}

/** Uploads that never finished (tab closed mid-way) are swept away so they don't sit in the database. */
export async function sweepStaleUploads(): Promise<void> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await db.delete(siteMedia).where(and(eq(siteMedia.ready, false), lt(siteMedia.createdAt, cutoff)));
}

/** Start a new item: a not-yet-ready row the chunks will be attached to. */
export async function startSiteMedia(m: { id: string; kind: MediaKind; contentType: string; size: number }): Promise<void> {
  const [last] = await db
    .select({ p: sql<number>`coalesce(max(${siteMedia.position}), -1)::int` })
    .from(siteMedia)
    .where(eq(siteMedia.kind, m.kind));
  await db.insert(siteMedia).values({ ...m, position: (last?.p ?? -1) + 1, version: 1, ready: false, createdAt: new Date().toISOString() });
}

/** Clear any half-sent replacement of this item before a fresh attempt. */
export async function dropPendingChunks(id: string, currentVersion: number): Promise<void> {
  await db.delete(siteMediaChunks).where(and(eq(siteMediaChunks.mediaId, id), gt(siteMediaChunks.version, currentVersion)));
}

export async function putChunk(id: string, version: number, idx: number, bytes: Buffer): Promise<void> {
  await db.execute(sql`
    INSERT INTO site_media_chunks (media_id, version, idx, data)
    VALUES (${id}, ${version}, ${idx}, decode(${bytes.toString("base64")}, 'base64'))
    ON CONFLICT (media_id, version, idx) DO UPDATE SET data = EXCLUDED.data`);
}

/** How many chunks and bytes have arrived for a version. */
export async function chunkTotals(id: string, version: number): Promise<{ count: number; bytes: number; maxIdx: number; short: number }> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS count, coalesce(sum(octet_length(data)), 0)::int AS bytes, coalesce(max(idx), -1)::int AS "maxIdx",
      count(*) FILTER (WHERE octet_length(data) <> ${CHUNK_BYTES} AND idx < (SELECT max(idx) FROM site_media_chunks WHERE media_id = ${id} AND version = ${version}))::int AS short
    FROM site_media_chunks WHERE media_id = ${id} AND version = ${version}`);
  return (r.rows?.[0] ?? (r as unknown as Record<string, unknown>[])[0]) as { count: number; bytes: number; maxIdx: number; short: number };
}

/** Make a finished upload live: flip it on, bump the version, and drop the old version's chunks. */
export async function finishSiteMedia(id: string, version: number, f: { size: number; contentType: string }): Promise<SiteMedia | undefined> {
  const [r] = await db.update(siteMedia).set({ ...f, version, ready: true }).where(eq(siteMedia.id, id)).returning();
  if (!r) return undefined;
  await db.delete(siteMediaChunks).where(and(eq(siteMediaChunks.mediaId, id), lt(siteMediaChunks.version, version)));
  return toItem(r);
}

export async function deleteSiteMedia(id: string): Promise<boolean> {
  const r = await db.delete(siteMedia).where(eq(siteMedia.id, id)).returning({ id: siteMedia.id });
  return r.length > 0;
}

/** Bytes [start, end] (inclusive) of a stored file, reading only the chunks that overlap the range. */
export async function readRange(id: string, version: number, start: number, end: number): Promise<Buffer> {
  const first = Math.floor(start / CHUNK_BYTES);
  const last = Math.floor(end / CHUNK_BYTES);
  const r = await db.execute(sql`
    SELECT idx, encode(data, 'base64') AS b64 FROM site_media_chunks
    WHERE media_id = ${id} AND version = ${version} AND idx BETWEEN ${first} AND ${last}
    ORDER BY idx`);
  const list = (r.rows ?? (r as unknown as Record<string, unknown>[])) as { idx: number; b64: string }[];
  const whole = Buffer.concat(list.map((c) => Buffer.from(c.b64, "base64")));
  const offset = start - first * CHUNK_BYTES;
  return whole.subarray(offset, offset + (end - start + 1));
}
