"use client";
import Image from "next/image";
import { motion } from "framer-motion";
import { Music, Music2, Music4 } from "lucide-react";

/**
 * Full-screen musical loading visual — a spinning "record", floating notes
 * drifting up a faint staff, an equalizer keeping time, and the wordmark.
 * Used by both the route-level loading.tsx and the intro <Splash/>.
 */

// Notes that drift upward across the screen.
const floaters = [
  { Icon: Music,  left: "10%", size: 20, delay: 0.0, dur: 4.2, tone: "text-gold-500/70" },
  { Icon: Music2, left: "24%", size: 28, delay: 1.1, dur: 5.0, tone: "text-ink-400/60" },
  { Icon: Music4, left: "38%", size: 18, delay: 2.0, dur: 4.6, tone: "text-gold-600/60" },
  { Icon: Music2, left: "62%", size: 24, delay: 0.6, dur: 5.4, tone: "text-ink-400/50" },
  { Icon: Music,  left: "76%", size: 30, delay: 1.7, dur: 4.4, tone: "text-gold-500/70" },
  { Icon: Music4, left: "88%", size: 20, delay: 2.6, dur: 5.2, tone: "text-gold-600/55" },
  { Icon: Music2, left: "50%", size: 16, delay: 3.1, dur: 4.0, tone: "text-ink-300/60" },
];

const bars = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export function MusicLoader() {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-hidden bg-[#FAF6EC]">
      {/* warm gold glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 42%, rgba(201,162,75,0.14) 0%, rgba(201,162,75,0) 62%)",
        }}
      />

      {/* faint drifting staff lines */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 space-y-3 opacity-40"
        animate={{ x: [0, -54] }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-px w-[130%] bg-ink-300/50" />
        ))}
      </motion.div>

      {/* floating notes */}
      {floaters.map(({ Icon, left, size, delay, dur, tone }, i) => (
        <motion.div
          key={i}
          aria-hidden
          className={`pointer-events-none absolute bottom-[30%] ${tone}`}
          style={{ left }}
          initial={{ y: 40, opacity: 0, rotate: -12 }}
          animate={{ y: [-10, -260], opacity: [0, 1, 1, 0], rotate: [-12, 10, -6] }}
          transition={{ duration: dur, repeat: Infinity, ease: "easeOut", delay }}
        >
          <Icon style={{ width: size, height: size }} strokeWidth={1.6} />
        </motion.div>
      ))}

      {/* Center stack */}
      <div className="relative flex flex-col items-center gap-7 px-6">
        {/* Spinning record with the mark on the label */}
        <div className="relative h-32 w-32">
          {/* glow ring pulse */}
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: "0 0 0 0 rgba(201,162,75,0.5)" }}
            animate={{ boxShadow: [
              "0 0 0 0 rgba(201,162,75,0.45)",
              "0 0 0 14px rgba(201,162,75,0)",
            ] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          />
          <motion.svg
            viewBox="0 0 200 200"
            className="h-32 w-32 drop-shadow-[0_12px_28px_rgba(10,9,8,0.28)]"
            animate={{ rotate: 360 }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "linear" }}
          >
            <defs>
              <radialGradient id="disc" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#2a2622" />
                <stop offset="70%" stopColor="#14110f" />
                <stop offset="100%" stopColor="#0a0908" />
              </radialGradient>
            </defs>
            {/* disc */}
            <circle cx="100" cy="100" r="96" fill="url(#disc)" />
            {/* grooves */}
            {[86, 78, 70, 62, 54, 46].map((r) => (
              <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="rgba(201,162,75,0.10)" strokeWidth="1" />
            ))}
            {/* glint sweep */}
            <path d="M100 8 A92 92 0 0 1 192 100" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" strokeLinecap="round" />
            {/* gold label */}
            <circle cx="100" cy="100" r="38" fill="#C9A24B" />
            <circle cx="100" cy="100" r="38" fill="none" stroke="rgba(10,9,8,0.15)" strokeWidth="1" />
            {/* spindle hole */}
            <circle cx="100" cy="100" r="5" fill="#0a0908" />
          </motion.svg>
          {/* Mark sits still in the middle of the spinning label */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative h-9 w-9">
              <Image src="/LOGO2.png" alt="Sri Saraswathy Musicals" fill sizes="36px" priority className="object-contain mix-blend-multiply" />
            </div>
          </div>
        </div>

        {/* Equalizer */}
        <div className="flex h-8 items-end gap-[5px]" aria-hidden>
          {bars.map((i) => (
            <motion.span
              key={i}
              className="w-[3px] rounded-full bg-gold-500"
              style={{ height: "25%" }}
              animate={{ height: ["25%", "100%", "45%", "80%", "30%"] }}
              transition={{ duration: 1.05, repeat: Infinity, ease: "easeInOut", delay: i * 0.09 }}
            />
          ))}
        </div>

        {/* Wordmark + tuning line + progress */}
        <div className="flex flex-col items-center text-center">
          <p className="heading-serif text-xl text-ink-900">Sri Saraswathy Musicals</p>
          <motion.p
            className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.34em] text-ink-400"
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            Tuning the strings
          </motion.p>

          {/* indeterminate gold progress */}
          <div className="relative mt-5 h-[3px] w-44 overflow-hidden rounded-full bg-ink-200/60">
            <motion.span
              className="absolute inset-y-0 left-0 w-1/2 rounded-full"
              style={{ background: "linear-gradient(90deg, transparent, #C9A24B, transparent)" }}
              animate={{ x: ["-120%", "240%"] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>
      </div>

      <span className="sr-only" role="status">Loading Sri Saraswathy Musicals</span>
    </div>
  );
}
