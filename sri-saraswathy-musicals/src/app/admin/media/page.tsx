"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Film, Replace, Trash2, Loader2, UploadCloud, Check, X, Lock, Play } from "lucide-react";
import { LoadErrorBanner, LoadingPanel } from "@/components/admin/LoadState";
import { Toast } from "@/components/admin/Toast";
import { useAuth } from "@/lib/store/auth";
import { cn } from "@/lib/utils";
import { MEDIA_LIMITS, mb, type MediaKind, type SiteMedia } from "@/lib/media/limits";
import { checkFile, deleteMedia, listMedia, uploadMedia } from "@/lib/media/client";

/** One in-flight upload, shown as a tile with a progress bar until it lands. */
interface Pending { key: string; name: string; pct: number; kind: MediaKind; replaceId?: string }

export default function SiteMediaPage() {
  const hydrated = useAuth((s) => s.hydrated);
  const fullAdmin = useAuth((s) => s.adminAccess === "all");

  const [items, setItems] = useState<SiteMedia[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "bad" } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(() => {
    listMedia().then((m) => { setItems(m); setLoadError(null); }).catch((e: Error) => setLoadError(e.message));
  }, []);
  useEffect(() => { if (fullAdmin) load(); }, [fullAdmin, load]);

  const say = (message: string, tone: "ok" | "bad" = "ok") => setToast({ message, tone });

  const run = useCallback(async (kind: MediaKind, file: File, replaceId?: string) => {
    const key = `${file.name}-${Math.random().toString(36).slice(2)}`;
    setPending((p) => [...p, { key, name: file.name, pct: 0, kind, replaceId }]);
    try {
      const saved = await uploadMedia(kind, file, {
        replaceId,
        onProgress: (pct) => setPending((p) => p.map((x) => (x.key === key ? { ...x, pct } : x))),
      });
      setItems((cur) => {
        const rest = (cur ?? []).filter((m) => m.id !== saved.id);
        return [...rest, saved].sort((a, b) => a.kind.localeCompare(b.kind) || a.position - b.position);
      });
      say(replaceId ? "Replaced" : `${kind === "image" ? "Photo" : "Video"} added`);
    } catch (e) {
      say(e instanceof Error ? e.message : "Upload failed", "bad");
    } finally {
      setPending((p) => p.filter((x) => x.key !== key));
    }
  }, []);

  /** Add several files to a kind, refusing the ones that don't fit before anything is sent. */
  const addFiles = (kind: MediaKind, files: File[]) => {
    const lim = MEDIA_LIMITS[kind];
    const used = (items ?? []).filter((m) => m.kind === kind).length + pending.filter((p) => p.kind === kind && !p.replaceId).length;
    let room = lim.max - used;
    for (const f of files) {
      const bad = checkFile(kind, f);
      if (bad) { say(bad, "bad"); continue; }
      if (room <= 0) { say(`You can keep at most ${lim.max} ${kind}s — delete one first`, "bad"); break; }
      room--;
      void run(kind, f);
    }
  };

  const remove = async (m: SiteMedia) => {
    setConfirmId(null);
    const before = items;
    setItems((cur) => (cur ?? []).filter((x) => x.id !== m.id));
    try { await deleteMedia(m.id); say("Deleted"); }
    catch (e) { setItems(before); say(e instanceof Error ? e.message : "Couldn't delete", "bad"); }
  };

  if (hydrated && !fullAdmin) {
    return (
      <div className="p-5 md:p-8">
        <div className="grid place-items-center rounded-2xl border border-ink-100 bg-ivory-50 py-24 text-center">
          <Lock className="h-8 w-8 text-ink-300" />
          <p className="mt-3 text-sm font-semibold text-ink-700">Only the admin can manage site media</p>
        </div>
      </div>
    );
  }
  if (!hydrated || (items === null && !loadError)) return <div className="p-5 md:p-8"><LoadingPanel label="Loading media…" /></div>;

  const all = items ?? [];
  const images = all.filter((m) => m.kind === "image");
  const videos = all.filter((m) => m.kind === "video");
  const totalBytes = all.reduce((n, m) => n + m.size, 0);

  return (
    <div className="p-5 md:p-8">
     <div className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Site Media</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">
          Photos and videos shown on the home page, just above the customer reviews. Photos come first, then videos.
          Using {mb(totalBytes)} of database space.
        </p>
      </header>

      <LoadErrorBanner message={loadError} onRetry={load} />

      <Section
        icon={ImagePlus}
        title="Photos"
        hint={`JPG, PNG or WebP · up to ${mb(MEDIA_LIMITS.image.maxBytes)} each · shrunk automatically · the first 4 show, the rest sit behind “View more”`}
        count={images.length}
        max={MEDIA_LIMITS.image.max}
        kind="image"
        accept={MEDIA_LIMITS.image.types.join(",")}
        onFiles={(f) => addFiles("image", f)}
        busy={pending.some((p) => p.kind === "image" && !p.replaceId)}
      >
        {images.map((m, i) => (
          <Tile key={m.id} m={m} index={i} pending={pending.find((p) => p.replaceId === m.id)} confirming={confirmId === m.id}
            onAskDelete={() => setConfirmId(m.id)} onCancel={() => setConfirmId(null)} onDelete={() => remove(m)}
            onReplace={(f) => { const bad = checkFile("image", f); if (bad) say(bad, "bad"); else void run("image", f, m.id); }} />
        ))}
        {pending.filter((p) => p.kind === "image" && !p.replaceId).map((p) => <UploadingTile key={p.key} p={p} />)}
      </Section>

      <Section
        icon={Film}
        title="Videos"
        hint={`Portrait 9:16 works best · MP4, WebM or MOV · up to ${mb(MEDIA_LIMITS.video.maxBytes)} each · play on a silent loop · tip: 720p keeps files small`}
        count={videos.length}
        max={MEDIA_LIMITS.video.max}
        kind="video"
        accept={MEDIA_LIMITS.video.types.join(",")}
        onFiles={(f) => addFiles("video", f)}
        busy={pending.some((p) => p.kind === "video" && !p.replaceId)}
      >
        {videos.map((m, i) => (
          <Tile key={m.id} m={m} index={i} pending={pending.find((p) => p.replaceId === m.id)} confirming={confirmId === m.id}
            onAskDelete={() => setConfirmId(m.id)} onCancel={() => setConfirmId(null)} onDelete={() => remove(m)}
            onReplace={(f) => { const bad = checkFile("video", f); if (bad) say(bad, "bad"); else void run("video", f, m.id); }} />
        ))}
        {pending.filter((p) => p.kind === "video" && !p.replaceId).map((p) => <UploadingTile key={p.key} p={p} />)}
      </Section>

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
     </div>
    </div>
  );
}

function Section({
  icon: Icon, title, hint, count, max, kind, accept, onFiles, busy, children,
}: {
  icon: typeof ImagePlus; title: string; hint: string; count: number; max: number; kind: MediaKind;
  accept: string; onFiles: (f: File[]) => void; busy: boolean; children: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const full = count >= max;
  return (
    <section className="mb-6 rounded-2xl border border-ink-100 bg-ivory-50 p-5 shadow-[0_1px_2px_rgba(10,9,8,0.03)] sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
            <Icon className="h-[18px] w-[18px] text-gold-600" /> {title}
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums", full ? "bg-gold-500 text-ink-900" : "bg-ink-900/[0.06] text-ink-600")}>
              {count} / {max}
            </span>
          </h2>
          <p className="mt-1 text-xs text-ink-500">{hint}</p>
        </div>
        <button
          onClick={() => input.current?.click()}
          disabled={full || busy}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-ink-900 px-4 text-[13px] font-semibold text-ivory-50 transition-colors hover:bg-gold-600 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {full ? "Limit reached" : kind === "image" ? "Add photos" : "Add videos"}
        </button>
        <input
          ref={input} type="file" accept={accept} multiple hidden
          onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
        />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); if (!full) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!full) onFiles(Array.from(e.dataTransfer.files)); }}
        className={cn("grid grid-cols-2 gap-4 rounded-xl p-1 transition-colors sm:grid-cols-3 lg:grid-cols-4", drag && "bg-gold-400/10 ring-2 ring-dashed ring-gold-500")}
      >
        {children}
        {count === 0 && !busy && (
          <button
            onClick={() => input.current?.click()}
            className="col-span-full grid place-items-center rounded-xl border-2 border-dashed border-ink-200 py-12 text-center text-ink-400 transition-colors hover:border-gold-500 hover:text-gold-600"
          >
            <UploadCloud className="h-8 w-8" />
            <span className="mt-2 text-sm font-medium">Click or drop {kind === "image" ? "photos" : "videos"} here</span>
          </button>
        )}
      </div>
    </section>
  );
}

function Tile({
  m, index, pending, confirming, onAskDelete, onCancel, onDelete, onReplace,
}: {
  m: SiteMedia; index: number; pending?: Pending; confirming: boolean;
  onAskDelete: () => void; onCancel: () => void; onDelete: () => void; onReplace: (f: File) => void;
}) {
  const pick = useRef<HTMLInputElement>(null);
  const accept = MEDIA_LIMITS[m.kind].types.join(",");
  return (
    <div className={cn("group relative overflow-hidden rounded-xl border border-ink-100 bg-ink-900/5", m.kind === "video" ? "aspect-[9/16]" : "aspect-[4/3]")}>
      {m.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <>
          {/* Preview only: no autoplay in the admin, so browsing this page doesn't download every video. */}
          <video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-900/60 text-ivory-50"><Play className="h-4 w-4 fill-current" /></span>
          </span>
        </>
      )}
      <span className="absolute left-2 top-2 rounded-full bg-ink-900/70 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-ivory-50">
        {index + 1} · {mb(m.size)}
      </span>

      {pending ? (
        <div className="absolute inset-0 grid place-items-center bg-ink-900/70 px-4 text-center text-ivory-50">
          <div className="w-full">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-gold-400 transition-all" style={{ width: `${pending.pct}%` }} /></div>
            <p className="mt-1.5 text-[11px] tabular-nums">Replacing… {Math.round(pending.pct)}%</p>
          </div>
        </div>
      ) : confirming ? (
        <div className="absolute inset-0 grid place-items-center bg-ink-900/85 p-3 text-center text-ivory-50">
          <div>
            <p className="text-xs font-semibold">Delete this {m.kind}?</p>
            <div className="mt-2 flex justify-center gap-2">
              <button onClick={onDelete} className="inline-flex items-center gap-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white"><Check className="h-3.5 w-3.5" /> Delete</button>
              <button onClick={onCancel} className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold"><X className="h-3.5 w-3.5" /> Keep</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-ink-900/80 to-transparent p-2 pt-8 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button onClick={() => pick.current?.click()} aria-label="Replace" title="Replace"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/90 px-2.5 text-xs font-semibold text-ink-900 hover:bg-white">
            <Replace className="h-3.5 w-3.5" /> Replace
          </button>
          <button onClick={onAskDelete} aria-label="Delete" title="Delete"
            className="grid h-8 w-8 place-items-center rounded-lg bg-white/90 text-danger hover:bg-white">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <input ref={pick} type="file" accept={accept} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplace(f); e.target.value = ""; }} />
        </div>
      )}
    </div>
  );
}

function UploadingTile({ p }: { p: Pending }) {
  return (
    <div className={cn("relative grid place-items-center overflow-hidden rounded-xl border border-dashed border-gold-500 bg-gold-400/10 px-4 text-center", p.kind === "video" ? "aspect-[9/16]" : "aspect-[4/3]")}>
      <div className="w-full">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-gold-600" />
        <p className="mt-2 truncate text-[11px] font-medium text-ink-700">{p.name}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-900/10"><div className="h-full bg-gold-500 transition-all" style={{ width: `${p.pct}%` }} /></div>
        <p className="mt-1 text-[11px] tabular-nums text-ink-500">{Math.round(p.pct)}%</p>
      </div>
    </div>
  );
}
