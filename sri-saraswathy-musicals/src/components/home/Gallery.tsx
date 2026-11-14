"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Play, Volume2, VolumeX, X } from "lucide-react";
import { IMAGES_SHOWN_FIRST, type SiteMedia } from "@/lib/media/limits";

/** The shop's photos and videos, set just above the reviews. Renders nothing until there is something to show. */
export function Gallery() {
  const [items, setItems] = useState<SiteMedia[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<SiteMedia | null>(null);

  useEffect(() => {
    let live = true;
    // Edge-cached for a minute by the API, so a visit costs the database nothing.
    fetch("/api/media")
      .then((r) => (r.ok ? r.json() : []))
      .then((m: SiteMedia[]) => { if (live && Array.isArray(m)) setItems(m); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const images = items.filter((m) => m.kind === "image");
  const videos = items.filter((m) => m.kind === "video");
  if (images.length === 0 && videos.length === 0) return null;

  const first = images.slice(0, IMAGES_SHOWN_FIRST);
  const more = images.slice(IMAGES_SHOWN_FIRST);

  return (
    <section className="relative border-t border-ink-100 bg-ivory-50 py-16 md:py-24">
      <div className="container-page">
        <div className="mb-10 text-center">
          <p className="eyebrow centered">Inside the shop</p>
          <h2 className="heading-serif mx-auto mt-4 max-w-3xl text-display-lg text-ink-900">
            A look at the <em>instruments</em> and the people.
          </h2>
        </div>

        {images.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {first.map((m) => <PhotoTile key={m.id} m={m} onOpen={() => setOpen(m)} />)}
            </div>

            <AnimatePresence initial={false}>
              {expanded && more.length > 0 && (
                <motion.div
                  key="more"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-3 pt-3 sm:gap-4 sm:pt-4 lg:grid-cols-4">
                    {more.map((m) => <PhotoTile key={m.id} m={m} onOpen={() => setOpen(m)} />)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {more.length > 0 && (
              <div className="mt-7 text-center">
                <button onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="btn-ghost">
                  {expanded ? <>Close <ChevronUp className="h-3.5 w-3.5" /></> : <>View {more.length} more <ChevronDown className="h-3.5 w-3.5" /></>}
                </button>
              </div>
            )}
          </>
        )}

        {videos.length > 0 && (
          <div className={images.length > 0 ? "mt-14 md:mt-20" : ""}>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {videos.map((m) => <VideoTile key={m.id} m={m} onOpen={() => setOpen(m)} />)}
            </div>
          </div>
        )}
      </div>

      <Lightbox item={open} images={images} onChange={setOpen} />
    </section>
  );
}

function PhotoTile({ m, onOpen }: { m: SiteMedia; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-label="Open photo"
      className="group relative aspect-[4/5] overflow-hidden rounded-2xl border border-ink-100 bg-ink-900/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={m.url} alt="Sri Saraswathy Musicals" loading="lazy" decoding="async"
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
    </button>
  );
}

/**
 * A silent, looping preview. The file isn't requested until the tile scrolls into view, and it pauses
 * when it scrolls away — so visitors who never reach the videos download none of them.
 */
function VideoTile({ m, onOpen }: { m: SiteMedia; onOpen: () => void }) {
  const box = useRef<HTMLButtonElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setNear(true);
        const v = video.current;
        if (v) { if (e.isIntersecting) void v.play().catch(() => {}); else v.pause(); }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <button
      ref={box}
      onClick={onOpen}
      aria-label="Play video"
      className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-ink-100 bg-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
    >
      {near && (
        <video
          ref={video}
          src={m.url}
          autoPlay muted loop playsInline preload="metadata"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
        />
      )}
      <span className="pointer-events-none absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-ink-900/60 text-ivory-50 backdrop-blur-sm transition-colors group-hover:bg-gold-500 group-hover:text-ink-900">
        <Play className="h-3.5 w-3.5 fill-current" />
      </span>
    </button>
  );
}

/** Full-screen viewer: photos step with arrows / keys; a video loops forever with a mute toggle. */
function Lightbox({ item, images, onChange }: { item: SiteMedia | null; images: SiteMedia[]; onChange: (m: SiteMedia | null) => void }) {
  const idx = item?.kind === "image" ? images.findIndex((m) => m.id === item.id) : -1;
  const step = (d: number) => {
    if (idx < 0 || images.length < 2) return;
    onChange(images[(idx + d + images.length) % images.length]);
  };

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onChange(null);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }); // re-bound each render so `step` always sees the current image

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {item && (
        <motion.div
          key="lb"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-ink-950/90 p-4 backdrop-blur-sm"
          onClick={() => onChange(null)}
          role="dialog" aria-modal="true"
        >
          <button onClick={() => onChange(null)} aria-label="Close"
            className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>

          <div className="relative flex max-h-full max-w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {item.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt="" className="max-h-[88dvh] max-w-[92vw] rounded-xl object-contain" />
            ) : (
              <LoopingVideo key={item.id} url={item.url} />
            )}
          </div>

          {item.kind === "image" && images.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); step(-1); }} aria-label="Previous photo"
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-6">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); step(1); }} aria-label="Next photo"
                className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Loops for as long as it is open; starts silent, with a button to unmute / mute. */
function LoopingVideo({ url }: { url: string }) {
  const [muted, setMuted] = useState(true);
  return (
    <>
      <video src={url} autoPlay loop playsInline muted={muted} className="max-h-[88dvh] max-w-[92vw] rounded-xl bg-black object-contain" />
      <button
        onClick={() => setMuted((v) => !v)}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute bottom-4 right-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink-900/70 px-4 text-xs font-semibold uppercase tracking-[0.15em] text-white backdrop-blur-sm transition-colors hover:bg-gold-500 hover:text-ink-900"
      >
        {muted ? <><VolumeX className="h-4 w-4" /> Unmute</> : <><Volume2 className="h-4 w-4" /> Mute</>}
      </button>
    </>
  );
}
