"use client";
import { motion } from "framer-motion";

const stats = [
  { n: "47", u: "years", label: "On the bench", note: "Since we opened in Mylapore, 1978." },
  { n: "4", u: "hours", label: "Per set-up", note: "Every new instrument passes through our workshop." },
  { n: "312", u: "", label: "Concert placements", note: "Into orchestras, halls, private hands." },
  { n: "1", u: "year", label: "Trial period", note: "Return any instrument within twelve months." },
];

export function Story() {
  return (
    <section className="py-20 md:py-28 paper-texture">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[5fr_6fr] lg:gap-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8 }}
          >
            <p className="eyebrow">On the atelier</p>
            <h2 className="heading-serif mt-4 text-display-lg text-ink-900">
              Every instrument is <em>set up</em> in our workshop before it leaves.
            </h2>
            <div className="mt-10 flex items-center gap-4 border-t border-ink-100 pt-6">
              <svg viewBox="0 0 200 60" className="h-10 w-32 text-gold-600">
                <path d="M8 40 C 20 10, 40 50, 60 20 S 100 40, 120 22 S 160 8, 194 38"
                      fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M60 44 l 10 6 l 8 -3" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
              <div>
                <p className="font-serif italic text-lg text-ink-900">R. Krishnan Naidu</p>
                <p className="text-xs uppercase tracking-[0.2em] text-ink-500">Head luthier · Est. 1978</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="space-y-6"
          >
            <p className="text-base leading-relaxed text-ink-700 md:text-lg">
              <span className="float-left mr-3 font-display text-6xl leading-[0.8] text-gold-500">A</span>n instrument you order from us is set up — not shipped. When a veena arrives from Tanjore or a piano crates in from Hamburg, our luthiers spend, on average, four hours with it. Bridges are fit. Sound posts are placed. Pegs are re-cut when the humidity has moved them. String heights are shaved down a fraction of a millimeter at a time.
            </p>
            <p className="text-base leading-relaxed text-ink-700 md:text-lg">
              None of this appears on an invoice. It is the difference between a good instrument and a good instrument that plays. We do not know how to sell one without doing the other.
            </p>
            <p className="text-base leading-relaxed text-ink-700 md:text-lg">
              You may also bring an instrument you already own into the shop for the same service. We call it set-up because it is what the instrument has been waiting for.
            </p>
          </motion.div>
        </div>

        {/* Stats strip */}
        <div className="mt-16 grid grid-cols-2 gap-x-4 gap-y-10 border-t border-ink-100 pt-12 md:grid-cols-4 md:gap-x-8">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
            >
              <div className="flex items-baseline gap-1">
                <span className="tabular font-display text-4xl font-light text-ink-900 md:text-5xl">
                  {s.n}
                </span>
                {s.u && <span className="font-serif italic text-sm text-gold-600 md:text-base">{s.u}</span>}
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">{s.label}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{s.note}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
