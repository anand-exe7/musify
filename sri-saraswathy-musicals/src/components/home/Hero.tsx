"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Instagram, Facebook, Youtube, Phone, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function Hero() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    v.play().catch(() => {});
  }, [muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.readyState >= 2) setLoaded(true);
    const on = () => setLoaded(true);
    v.addEventListener("loadeddata", on);
    v.addEventListener("canplay", on);
    return () => {
      v.removeEventListener("loadeddata", on);
      v.removeEventListener("canplay", on);
    };
  }, []);

  return (
    <section className="relative -mt-16 h-screen min-h-[680px] w-full overflow-hidden bg-ink-950 text-ivory-100">
      {/* Video background */}
      <video
        ref={videoRef}
        src="/hero-video.mp4"
        autoPlay
        loop
        muted={muted}
        playsInline
        onLoadedData={() => setLoaded(true)}
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${loaded ? "opacity-70" : "opacity-0"}`}
      />

      {/* Vignette gradients */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/50 to-ink-950/70" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-ink-950/60" />

      {/* Grain overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>\")",
        }}
      />

      {/* Mute/unmute */}
      <button
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute video" : "Mute video"}
        className="absolute right-4 top-24 z-20 grid h-10 w-10 place-items-center rounded-full border border-ivory-100/25 bg-ink-950/40 text-ivory-100/80 backdrop-blur-sm transition-all hover:border-gold-400 hover:text-gold-400 md:right-10 md:top-28"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      {/* CONTENT LAYER */}
      <div className="relative z-10 flex h-full flex-col">
        <div className="h-20 shrink-0" />

        <div className="container-page relative flex flex-1 items-center pb-24 md:pb-32">
          <div className="grid w-full grid-cols-1 gap-8 md:grid-cols-12 md:gap-10">
            {/* LEFT COLUMN — the story */}
            <div className="relative flex flex-col justify-center md:col-span-8">
              <motion.p
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7 }}
                className="text-[10px] font-semibold uppercase tracking-[0.32em] text-gold-400"
              >
                Est. 1978 · Chennai & Bengaluru
              </motion.p>

              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="heading-serif mt-5 font-light leading-[0.9] text-ivory-50"
                style={{ fontSize: "clamp(2.75rem, 7.5vw, 8rem)", letterSpacing: "-0.03em" }}
              >
                <span className="block">
                  Saras<span className="font-serif italic text-gold-400">w</span>athy
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3 }}
                className="mt-6 max-w-md text-base leading-relaxed text-ivory-100/75 md:text-lg"
              >
                A house of professional instruments — set up in our atelier,
                delivered by the luthier who set them up.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.5 }}
                className="mt-8 flex flex-wrap items-center gap-3"
              >
                <Link
                  href="/shop"
                  className="group inline-flex items-center gap-3 rounded-full bg-ivory-50 px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.22em] text-ink-900 transition-all hover:bg-gold-400 hover:shadow-gold"
                >
                  Start your journey
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="#play"
                  className="group inline-flex items-center gap-3 rounded-full border border-ivory-100/30 px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.22em] text-ivory-100 transition-all hover:border-gold-400 hover:text-gold-400"
                >
                  Play something
                </Link>
              </motion.div>

              {/* Metric strip */}
              <motion.dl
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.7 }}
                className="mt-10 hidden max-w-md grid-cols-3 gap-8 border-t border-ivory-100/15 pt-5 md:grid"
              >
                {[
                  { n: "47", l: "years on the bench" },
                  { n: "300+", l: "concert placements" },
                  { n: "1yr", l: "trial period" },
                ].map((m) => (
                  <div key={m.l}>
                    <dt className="font-display text-2xl text-ivory-50">{m.n}</dt>
                    <dd className="mt-1 text-[10px] uppercase tracking-[0.2em] text-ivory-100/50">{m.l}</dd>
                  </div>
                ))}
              </motion.dl>
            </div>

            {/* RIGHT COLUMN — small caption block */}
            <div className="relative hidden flex-col justify-center text-right md:col-span-4 md:flex">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.4 }}
              >
                <p className="heading-serif text-2xl font-light text-ivory-50 lg:text-3xl">
                  Curated<br />
                  <span className="font-serif italic text-gold-400">by hand.</span>
                </p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.24em] text-ivory-100/50">
                  Live from the atelier ↓
                </p>
              </motion.div>
            </div>
          </div>

          {/* Bottom bar — phone + socials */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.8 }}
            className="absolute bottom-8 left-4 flex items-center gap-6 md:left-10 md:bottom-10"
          >
            <a href="tel:+914424641234" className="flex items-center gap-2 text-xs text-ivory-100/70 hover:text-gold-400">
              <Phone className="h-3 w-3" />
              +91 44 2464 1234
            </a>
            <div className="flex gap-1">
              {[Facebook, Instagram, Youtube].map((I, i) => (
                <a key={i} aria-label="social" className="grid h-8 w-8 place-items-center rounded-full border border-ivory-100/20 text-ivory-100/80 transition-all hover:border-gold-400 hover:bg-gold-400/10 hover:text-gold-400">
                  <I className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1 }}
        className="pointer-events-none absolute bottom-6 left-1/2 z-20 hidden -translate-x-1/2 flex-col items-center gap-1 text-[10px] uppercase tracking-[0.32em] text-ivory-100/40 md:flex"
      >
        <span>Scroll</span>
        <span className="h-8 w-px bg-gradient-to-b from-ivory-100/60 to-transparent" />
      </motion.div>
    </section>
  );
}
