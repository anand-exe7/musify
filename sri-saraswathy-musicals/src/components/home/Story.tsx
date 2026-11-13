"use client";
import { motion } from "framer-motion";
import { Quote } from "lucide-react";

const stats = [
  { n: "61", u: "years", label: "On the bench", note: "Since we opened in Mambalam, 1965." },
  { n: "4", u: "hours", label: "Per set-up", note: "Every new instrument passes through our workshop." },
];

export function Story() {
  return (
    <section className="paper-texture py-16 md:py-24">
      <div className="container-page">
        <p className="eyebrow">On the atelier</p>

        {/* The line IS a quote, so it is set as one: a card, a quote mark, and the luthier's name
            underneath — not a heading that happens to sound like someone speaking. */}
        <motion.figure
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="relative mt-6 overflow-hidden rounded-3xl border border-ink-100 bg-ivory-50 p-7 shadow-[0_24px_60px_-40px_rgba(10,9,8,0.45)] md:p-12"
        >
          <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-gold-400" />
          <Quote aria-hidden className="h-8 w-8 text-gold-400/70 md:h-10 md:w-10" fill="currentColor" strokeWidth={0} />
          <blockquote className="heading-serif mt-5 max-w-4xl text-balance text-2xl leading-[1.2] text-ink-900 sm:text-3xl md:text-[2.6rem]">
            Every instrument is <em>set up</em> in our workshop before it leaves.
          </blockquote>
          <figcaption className="mt-7 flex items-center gap-4 border-t border-ink-100 pt-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-900 text-sm font-bold text-gold-300">
              RK
            </span>
            <span>
              <span className="block text-base font-semibold text-ink-900">R. Krishnan Naidu</span>
              <span className="mt-0.5 block text-[11px] uppercase tracking-[0.2em] text-ink-400">
                Head luthier · Est. 1965
              </span>
            </span>
          </figcaption>
        </motion.figure>

        {/* Atelier note */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-12 grid gap-8 md:grid-cols-2 md:gap-14"
        >
          <p className="text-pretty text-base leading-relaxed text-ink-700 md:text-[17px]">
            <span className="float-left mr-3 mt-1 font-display text-[3.4rem] font-bold leading-[0.78] text-gold-500">A</span>
            n instrument you order from us is set up — not shipped. When a veena arrives from Tanjore or a piano
            crates in from Hamburg, our luthiers spend, on average, four hours with it. Bridges are fit. Sound
            posts are placed. Pegs are re-cut when the humidity has moved them. String heights are shaved down a
            fraction of a millimetre at a time.
          </p>
          <div className="space-y-5">
            <p className="text-pretty text-base leading-relaxed text-ink-700 md:text-[17px]">
              None of this appears on an invoice. It is the difference between a good instrument and a good
              instrument that plays. We do not know how to sell one without doing the other.
            </p>
            <p className="text-pretty text-base leading-relaxed text-ink-700 md:text-[17px]">
              You may also bring an instrument you already own into the shop for the same service. We call it
              set-up because it is what the instrument has been waiting for.
            </p>
          </div>
        </motion.div>

        {/* Stats — each a card, so the number, its unit and the line under it read as one thing. */}
        <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 md:mt-16 md:gap-4">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6"
            >
              <p className="flex items-baseline gap-1.5">
                <span className="tabular font-display text-4xl font-bold leading-none text-ink-900 md:text-5xl">
                  {s.n}
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-600">{s.u}</span>
              </p>
              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-900">{s.label}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{s.note}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
