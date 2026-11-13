"use client";
import Link from "next/link";
import Image from "next/image";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useRef } from "react";

export function Hero() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const prefersReduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });

  // Scroll parallax
  const imgY = useTransform(scrollYProgress, [0, 1], [0, prefersReduced ? 0 : 90]);
  const wordScrollY = useTransform(scrollYProgress, [0, 1], [0, prefersReduced ? 0 : -50]);

  // ── Mouse-reactive parallax (wiggle) ──────────────────────
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 130, damping: 15, mass: 0.5 };
  const sx = useSpring(px, spring);
  const sy = useSpring(py, spring);

  const handleMouse = (e: React.MouseEvent<HTMLElement>) => {
    if (prefersReduced) return;
    const r = sectionRef.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const resetMouse = () => {
    px.set(0);
    py.set(0);
  };

  // Layer offsets — different depths react by different amounts
  const R = [-0.5, 0.5];
  const drumX = useTransform(sx, R, [-26, 26]);
  const drumMY = useTransform(sy, R, [-14, 14]);
  const drumRot = useTransform(sx, R, [-2, 2]);

  const wordX = useTransform(sx, R, [24, -24]);
  const wordMY = useTransform(sy, R, [14, -14]);


  const clefX = useTransform(sx, R, [-48, 48]);
  const clefY = useTransform(sy, R, [-30, 30]);
  const noteTopX = useTransform(sx, R, [44, -44]);
  const noteTopY = useTransform(sy, R, [30, -30]);
  const noteLeftX = useTransform(sx, R, [30, -30]);
  const noteLeftY = useTransform(sy, R, [24, -24]);
  const waveX = useTransform(sx, R, [-40, 40]);
  const waveY = useTransform(sy, R, [26, -26]);
  const spark1X = useTransform(sx, R, [-22, 22]);
  const spark1Y = useTransform(sy, R, [-18, 18]);
  const spark2X = useTransform(sx, R, [26, -26]);
  const spark2Y = useTransform(sy, R, [20, -20]);

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouse}
      onMouseLeave={resetMouse}
      className="relative -mt-20 w-full overflow-hidden bg-ivory-100 text-ink-900"
    >
      {/* Warm wash — richer cream with a soft gold glow behind the figure */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 82%, rgba(201,162,75,0.12) 0%, rgba(201,162,75,0) 60%), radial-gradient(130% 100% at 50% 0%, #FDFBF3 0%, #F3EDDD 52%, #E8E1CE 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(10,9,8,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(10,9,8,0.045) 1px, transparent 1px)",
          backgroundSize: "54px 54px",
          maskImage:
            "radial-gradient(120% 100% at 50% 30%, black 55%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(120% 100% at 50% 30%, black 55%, transparent 100%)",
        }}
      />

      {/* ── Hand-drawn music doodles (react to the mouse) ─────── */}
      <motion.svg
        aria-hidden
        viewBox="0 0 60 150"
        style={{ x: clefX, y: clefY }}
        className="pointer-events-none absolute left-[4%] top-[26%] hidden w-8 text-gold-500/40 md:block lg:w-10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <path d="M31 12 C 17 24 17 46 31 60 C 47 76 47 108 31 116 C 20 122 11 114 11 103 C 11 93 20 88 27 93" />
        <path d="M31 60 L31 128 C 31 141 22 143 15 136" />
        <circle cx="31" cy="132" r="3.4" fill="currentColor" stroke="none" />
      </motion.svg>

      <motion.svg
        aria-hidden
        viewBox="0 0 90 64"
        style={{ x: noteTopX, y: noteTopY }}
        className="pointer-events-none absolute right-[30%] top-[12%] hidden w-14 text-ink-400/50 md:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        <path d="M18 14 L18 46 M64 8 L64 40" />
        <path d="M18 14 L64 8" />
        <ellipse cx="12" cy="48" rx="8" ry="6" fill="currentColor" stroke="none" transform="rotate(-18 12 48)" />
        <ellipse cx="58" cy="42" rx="8" ry="6" fill="currentColor" stroke="none" transform="rotate(-18 58 42)" />
      </motion.svg>

      <motion.svg
        aria-hidden
        viewBox="0 0 50 70"
        style={{ x: noteLeftX, y: noteLeftY }}
        className="pointer-events-none absolute left-[16%] top-[54%] hidden w-8 text-gold-500/40 lg:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        <path d="M30 8 L30 50" />
        <path d="M30 8 C 40 8 46 16 44 26" />
        <ellipse cx="22" cy="52" rx="9" ry="6.5" fill="currentColor" stroke="none" transform="rotate(-20 22 52)" />
      </motion.svg>

      <motion.svg
        aria-hidden
        viewBox="0 0 140 60"
        style={{ x: waveX, y: waveY }}
        className="pointer-events-none absolute right-[6%] bottom-[22%] hidden w-24 text-gold-500/45 md:block lg:w-32"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <path d="M4 30 q 12 -24 24 0 q 12 24 24 0 q 12 -24 24 0 q 12 24 24 0 q 12 -24 24 0" />
      </motion.svg>

      <motion.svg aria-hidden viewBox="0 0 24 24" style={{ x: spark1X, y: spark1Y }} className="pointer-events-none absolute right-[20%] top-[30%] hidden w-4 text-ink-300 md:block" fill="currentColor">
        <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
      </motion.svg>
      <motion.svg aria-hidden viewBox="0 0 24 24" style={{ x: spark2X, y: spark2Y }} className="pointer-events-none absolute left-[40%] bottom-[30%] hidden w-3 text-gold-400/70 lg:block" fill="currentColor">
        <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
      </motion.svg>

      {/* Faint staff lines behind the figure */}
      <svg
        aria-hidden
        viewBox="0 0 1400 60"
        className="pointer-events-none absolute inset-x-0 bottom-[34%] hidden h-10 w-full text-ink-300/25 md:block"
        preserveAspectRatio="none"
      >
        {[8, 20, 32, 44, 56].map((y) => (
          <line key={y} x1="0" y1={y} x2="1400" y2={y} stroke="currentColor" strokeWidth="1" />
        ))}
      </svg>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="container-page relative z-10 min-h-[100svh] pb-12 pt-24 lg:pb-0 lg:pt-0">
        {/* Heading row — the strapline sits in the same flow as the heading, so it can never
          slide past the right edge of the page the way an absolutely positioned note did. */}
        <div className="relative z-20 flex items-start justify-between gap-10 lg:pt-28">
          <div className="max-w-sm lg:max-w-xl">
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="font-sans font-black uppercase text-ink-900"
              style={{
                fontSize: "clamp(1.6rem, 3.4vw, 3.25rem)",
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              Grand tone,
              <br />
              fine craft <span className="text-gold-500">—</span>
              <br />
              made for
              <br />
              every stage
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="mt-5 max-w-sm text-[10px] font-semibold uppercase leading-relaxed tracking-[0.16em] text-ink-400 md:text-[11px]"
            >
              Handpicked instruments — Carnatic to Western.
              <br className="hidden sm:block" /> Set up by luthiers, built to last.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="mt-7"
            >
              <Link
                href="/shop"
                className="group inline-flex items-center gap-3 rounded-full bg-ink-900 px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-ivory-50 transition-all hover:bg-gold-500 hover:text-ink-900 hover:shadow-gold"
              >
                Explore collection
                <span className="grid h-6 w-6 place-items-center rounded-full bg-ivory-50/15 transition-transform group-hover:translate-x-0.5 group-hover:bg-ink-900/15">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="hidden shrink-0 text-right lg:block"
          >
            <p className="max-w-[14rem] text-[10px] font-semibold uppercase leading-relaxed tracking-[0.16em] text-ink-400">
              Where old-world craft
              <br /> meets the modern stage.
            </p>
            <span className="ml-auto mt-3 block h-px w-14 bg-ink-300" />
          </motion.div>
        </div>

        {/* Composition: glass wordmark + drummer cutout */}
        <div className="pointer-events-none relative z-10 mt-6 flex justify-center lg:absolute lg:inset-x-0 lg:bottom-0 lg:mt-0">
          {/* Wordmark — mouse layer wraps scroll layer */}
          <motion.div
            style={{ x: wordX, y: wordMY }}
            className="absolute inset-x-0 bottom-[13%] select-none text-center will-change-transform"
          >
            <motion.span
              aria-hidden
              className="inline-block whitespace-nowrap font-sans font-black uppercase leading-none"
              style={{
                y: wordScrollY,
                fontSize: "clamp(2rem, 10.5vw, 9.5rem)",
                letterSpacing: "-0.05em",
                color: "transparent",
                backgroundImage:
                  "linear-gradient(180deg, rgba(64,49,34,0.72) 0%, rgba(104,86,62,0.56) 55%, rgba(120,102,78,0.40) 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextStroke: "1px rgba(64,49,34,0.22)",
                filter: "drop-shadow(0 1px 0 rgba(255,255,255,0.5))",
              }}
            >
              Saraswathy
            </motion.span>
          </motion.div>

          {/* Drummer — nudged right on desktop; mouse layer wraps scroll layer */}
          <div className="relative z-10 flex w-[150%] max-w-[620px] shrink-0 justify-center lg:w-[62%] lg:max-w-[1000px] lg:translate-x-[7%]">
            <motion.div
              style={{ x: drumX, y: drumMY, rotate: drumRot }}
              className="relative flex w-full justify-center will-change-transform"
            >
              <motion.div style={{ y: imgY }} className="w-full">
                <Image
                  src="/cutout_image_image.png"
                  alt="Musician at a professional drum kit"
                  width={1366}
                  height={768}
                  quality={90}
                  priority
                  sizes="(max-width: 1024px) 90vw, 62vw"
                  className="h-auto w-full object-contain drop-shadow-[0_36px_48px_rgba(10,9,8,0.2)]"
                />
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Scroll cue — desktop only */}
        <div className="pointer-events-none absolute bottom-16 right-1 z-40 hidden items-center gap-3 lg:flex lg:flex-col">
          <span
            className="text-[9px] uppercase tracking-[0.3em] text-ink-400"
            style={{ writingMode: "vertical-rl" }}
          >
            Scroll
          </span>
          <span className="relative block h-10 w-px overflow-hidden bg-ink-200">
            <motion.span
              initial={{ y: -40 }}
              animate={{ y: 50 }}
              transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.4 }}
              className="absolute inset-x-0 block h-6 bg-gradient-to-b from-transparent via-gold-500 to-transparent"
            />
          </span>
        </div>
      </div>

      {/* Soft handoff into the next section — gentle blur only at the very bottom */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-30 hidden h-20 lg:block">
        {[
          { blur: 1, from: 0, to: 55 },
          { blur: 4, from: 45, to: 100 },
        ].map((l, i) => (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              backdropFilter: `blur(${l.blur}px)`,
              WebkitBackdropFilter: `blur(${l.blur}px)`,
              maskImage: `linear-gradient(to bottom, transparent ${l.from}%, #000 ${l.to}%)`,
              WebkitMaskImage: `linear-gradient(to bottom, transparent ${l.from}%, #000 ${l.to}%)`,
            }}
          />
        ))}
      </div>
      {/* Colour fade so the figure melts into the page ground (no hard seam).
          A tall, multi-stop gradient eases the warm hero cream all the way into
          the page ivory instead of dropping to it in a short, visible band. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-64 md:h-80"
        style={{
          background:
            "linear-gradient(to bottom, rgba(250,246,236,0) 0%, rgba(249,245,235,0.28) 28%, rgba(249,245,236,0.6) 52%, rgba(250,246,236,0.86) 74%, #FAF6EC 100%)",
        }}
      />
    </section>
  );
}
