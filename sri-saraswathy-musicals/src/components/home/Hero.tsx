"use client";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Play, ArrowRight, Instagram, Facebook, Youtube, Phone } from "lucide-react";
import { useState } from "react";

// Rotating background photos — royalty-free Unsplash (musician imagery)
const scenes = [
  {
    src: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1800&q=80",
    caption: "The Cello · Op. 118",
  },
  {
    src: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?ixlib=rb-4.0.3&auto=format&fit=crop&w=1800&q=80",
    caption: "The Saxophone · Op. 119",
  },
  {
    src: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1800&q=80",
    caption: "The Drums · Op. 120",
  },
];

export function Hero() {
  const [scene] = useState(0);
  const current = scenes[scene];

  return (
    <section className="relative -mt-16 h-screen min-h-[720px] w-full overflow-hidden bg-ink-950 text-ivory-100">
      {/* Background photograph */}
      <Image
        src={current.src}
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none absolute inset-0 object-cover object-center opacity-70"
      />

      {/* SVG silhouette fallback (renders behind photo — shows if photo fails) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-end">
        <svg viewBox="0 0 400 800" className="h-full w-auto opacity-30" preserveAspectRatio="xMidYMax meet">
          <defs>
            <linearGradient id="silh" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1F1108" />
              <stop offset="100%" stopColor="#0A0908" />
            </linearGradient>
          </defs>
          <path d="M200 200 c -40 0 -70 40 -60 90 l 10 60 c -30 20 -40 60 -30 100 l 20 250 c 5 40 -5 90 -20 100 l -80 0 l 0 -400 c 0 -100 60 -200 160 -200 z"
                fill="url(#silh)" />
          <ellipse cx="200" cy="160" rx="40" ry="48" fill="url(#silh)" />
        </svg>
      </div>

      {/* Vignette gradients — mood the photo */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/40 to-ink-950/70" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-ink-950/60" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/50 via-transparent to-transparent" />

      {/* Ornamental music-note flourish */}
      <motion.svg
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.6 }}
        viewBox="0 0 100 100" className="absolute right-[38%] top-[18%] hidden h-16 w-16 text-gold-400/80 md:block"
        aria-hidden
      >
        <path d="M55 20 C 48 20 44 26 46 34 L 48 60" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <ellipse cx="44" cy="62" rx="8" ry="6" fill="currentColor" transform="rotate(-25 44 62)" />
      </motion.svg>

      {/* CONTENT LAYER */}
      <div className="relative z-10 flex h-full flex-col">
        {/* Top pad for fixed header */}
        <div className="h-20 shrink-0" />

        {/* Body */}
        <div className="container-page relative flex-1">
          <div className="grid h-full grid-cols-1 gap-10 pb-24 md:grid-cols-12 md:pb-32">
            {/* LEFT COLUMN */}
            <div className="relative flex flex-col justify-center md:col-span-7 md:pt-4">
              <motion.p
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7 }}
                className="text-[10px] font-semibold uppercase tracking-[0.32em] text-gold-400"
              >
                Est. 1978 · Chennai & Bengaluru
              </motion.p>

              {/* Giant bleeding wordmark */}
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="heading-serif mt-5 font-light leading-[0.88] text-ivory-50"
                style={{ fontSize: "clamp(3.5rem, 10vw, 10rem)", letterSpacing: "-0.035em" }}
              >
                <span className="block font-serif italic text-[0.32em] font-normal not-italic tracking-[0.32em] text-gold-400" style={{ letterSpacing: "0.32em" }}>SRI</span>
                <span className="block">SARAS<span className="font-serif italic text-gold-400">w</span>ATHY</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3 }}
                className="mt-8 max-w-md text-base leading-relaxed text-ivory-100/70 md:text-lg"
              >
                A house of professional instruments — Carnatic, Hindustani, and Western.
                Set up in our atelier, delivered by the luthier who set them up.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.5 }}
                className="mt-10"
              >
                <Link
                  href="/shop"
                  className="group inline-flex items-center gap-3 rounded-full bg-ivory-50 px-8 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-ink-900 transition-all hover:bg-gold-400 hover:shadow-gold"
                >
                  Start your journey
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </motion.div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="relative flex flex-col items-end justify-between text-right md:col-span-5 md:pt-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.4 }}
                className="hidden items-end gap-6 md:flex"
              >
                <div>
                  <p className="heading-serif text-3xl font-light text-ivory-50 md:text-4xl">
                    Curated<br />
                    <span className="font-serif italic text-gold-400">by hand.</span>
                  </p>
                  <p className="mt-4 text-[10px] uppercase tracking-[0.24em] text-ivory-100/50">
                    Watch our atelier ↓
                  </p>
                </div>
                <button
                  aria-label="Play tour"
                  className="grid h-16 w-16 place-items-center rounded-full border border-ivory-100/40 text-ivory-100 backdrop-blur-sm transition-all hover:scale-110 hover:border-gold-400 hover:bg-gold-400/10 hover:text-gold-400"
                >
                  <Play className="h-5 w-5 fill-current" strokeWidth={1} />
                </button>
              </motion.div>

              {/* Scene caption pinned bottom-right (above the giant wordmark) */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.7 }}
                className="hidden text-right md:block"
              >
                <p className="text-[10px] uppercase tracking-[0.24em] text-ivory-100/50">Now playing</p>
                <p className="font-serif italic text-lg text-ivory-100">{current.caption}</p>
              </motion.div>
            </div>
          </div>

          {/* Giant italic "Musicals" bleeding off the right */}
          <motion.p
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.6, ease: "easeOut" }}
            className="pointer-events-none absolute right-0 leading-none text-ivory-50/95"
            style={{
              bottom: "-2vw",
              fontFamily: "var(--font-serif), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: "clamp(5rem, 15vw, 16rem)",
              letterSpacing: "-0.02em",
            }}
          >
            Musicals
          </motion.p>

          {/* Bottom bar — phone + socials (left) */}
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
        className="pointer-events-none absolute bottom-4 left-1/2 z-20 hidden -translate-x-1/2 flex-col items-center gap-1 text-[10px] uppercase tracking-[0.32em] text-ivory-100/40 md:flex"
      >
        <span>Scroll</span>
        <span className="h-8 w-px bg-gradient-to-b from-ivory-100/60 to-transparent" />
      </motion.div>
    </section>
  );
}
