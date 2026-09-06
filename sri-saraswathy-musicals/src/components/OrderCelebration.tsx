"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Music2, Check } from "lucide-react";
import { useMemo } from "react";

const NOTES = ["♪", "♫", "♩", "♬", "𝅘𝅥𝅮"];

/**
 * Full-screen, music-themed order confirmation.
 * A visualiser wave, rising notes and a piano strip that plays a light-wave —
 * an elegant "your order is in" moment rather than a plain popup.
 */
export function OrderCelebration({ orderId }: { orderId: string }) {
  const bars = useMemo(() => Array.from({ length: 28 }, (_, i) => i), []);
  const notes = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        left: 4 + Math.random() * 92,
        char: NOTES[i % NOTES.length],
        delay: Math.random() * 2.4,
        dur: 3 + Math.random() * 2.5,
        size: 14 + Math.random() * 22,
      })),
    [],
  );
  const keys = useMemo(() => Array.from({ length: 22 }, (_, i) => i), []);
  // black-key pattern within an octave (after indices 0,1,3,4,5)
  const hasSharp = (i: number) => [0, 1, 3, 4, 5].includes(i % 7);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] overflow-hidden bg-ink-950"
      style={{
        background:
          "radial-gradient(80% 60% at 50% 38%, #211a12 0%, #12100c 55%, #080604 100%)",
      }}
    >
      {/* faint staff lines */}
      <svg aria-hidden viewBox="0 0 1400 200" className="pointer-events-none absolute inset-x-0 top-1/3 h-40 w-full text-gold-400/10" preserveAspectRatio="none">
        {[30, 60, 90, 120, 150].map((y) => (
          <line key={y} x1="0" y1={y} x2="1400" y2={y} stroke="currentColor" strokeWidth="1.5" />
        ))}
      </svg>

      {/* equaliser wave */}
      <div className="pointer-events-none absolute inset-x-0 bottom-40 flex items-end justify-center gap-1.5 px-6 opacity-40 md:gap-2.5">
        {bars.map((i) => (
          <motion.span
            key={i}
            className="w-2 rounded-full bg-gradient-to-t from-gold-600 to-gold-300 md:w-3"
            initial={{ height: 8 }}
            animate={{ height: [10, 30 + Math.random() * 90, 14, 60 + Math.random() * 70, 10] }}
            transition={{ duration: 1.4 + Math.random(), repeat: Infinity, ease: "easeInOut", delay: i * 0.04 }}
          />
        ))}
      </div>

      {/* rising notes */}
      {notes.map((n) => (
        <motion.span
          key={n.id}
          className="pointer-events-none absolute bottom-24 font-serif text-gold-300/80"
          style={{ left: `${n.left}%`, fontSize: n.size }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: -420, opacity: [0, 1, 1, 0], rotate: [0, 12, -8, 6] }}
          transition={{ duration: n.dur, delay: n.delay, repeat: Infinity, ease: "easeOut" }}
        >
          {n.char}
        </motion.span>
      ))}

      {/* center */}
      <div className="relative z-10 flex min-h-full flex-col items-center justify-center px-6 text-center">
        {/* seal */}
        <motion.div initial={{ scale: 0, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.1 }} className="relative">
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: "0 0 0 0 rgba(201,162,75,0.5)" }}
            animate={{ boxShadow: ["0 0 0 0 rgba(201,162,75,0.45)", "0 0 0 34px rgba(201,162,75,0)"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
          <div className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-gold-300 to-gold-500 text-ink-900 shadow-gold">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.45, type: "spring", stiffness: 300 }}>
              <Check className="h-11 w-11" strokeWidth={3} />
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 }} className="absolute -right-2 -top-2 grid h-9 w-9 place-items-center rounded-full bg-ink-900 text-gold-400 ring-2 ring-gold-400/40">
            <Music2 className="h-4 w-4" />
          </motion.div>
        </motion.div>

        <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="mt-8 text-[11px] font-semibold uppercase tracking-[0.4em] text-gold-400">
          Order Confirmed
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }} className="heading-serif mt-3 text-4xl text-ivory-50 md:text-6xl">
          The music is on its <em className="text-gold-400">way.</em>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="mx-auto mt-4 max-w-md text-sm text-ivory-100/70 md:text-base">
          {orderId} is confirmed. Our workshop will call you within 24 hours to schedule set-up and delivery.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.95 }} className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/profile" className="rounded-full bg-gold-400 px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.2em] text-ink-900 transition-colors hover:bg-gold-300">
            View orders
          </Link>
          <Link href="/shop" className="rounded-full border border-ivory-100/25 px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.2em] text-ivory-100 transition-colors hover:border-gold-400 hover:text-gold-400">
            Continue shopping
          </Link>
        </motion.div>
      </div>

      {/* piano strip playing a light-wave */}
      <div className="absolute inset-x-0 bottom-0 flex h-24 select-none">
        {keys.map((i) => (
          <div key={i} className="relative flex-1 border-r border-ink-800/60">
            <motion.div
              className="absolute inset-0 bg-gradient-to-t from-ivory-50 to-ivory-100"
              initial={{ opacity: 0.06 }}
              animate={{ opacity: [0.06, 0.06, 0.9, 0.06, 0.06] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: (i % 11) * 0.16 }}
            />
            {hasSharp(i) && (
              <motion.div
                className="absolute -right-[6px] top-0 z-10 h-14 w-3 rounded-b bg-ink-950"
                animate={{ backgroundColor: ["#0b0906", "#0b0906", "#C9A24B", "#0b0906", "#0b0906"] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: (i % 11) * 0.16 + 0.08 }}
              />
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
