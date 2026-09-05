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
        {/* Full-width heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8 }}
          className="border-b border-ink-100 pb-10"
        >
          <p className="eyebrow">On the atelier</p>
          <h2 className="heading-serif mt-4 max-w-4xl text-display-lg text-ink-900">
            Every instrument is <em>set up</em> in our workshop before it leaves.
          </h2>
          <div className="mt-6">
            <p className="font-serif italic text-lg text-ink-900">R. Krishnan Naidu</p>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ink-500">Head luthier · Est. 1978</p>
          </div>
        </motion.div>

        {/* Video + text row */}
        <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Video */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-ink-950 shadow-2xl lg:aspect-[4/5]">
              <video
                src="/hero-video.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/60 via-transparent to-transparent" />
              <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-center justify-between text-ivory-100">
                <span className="text-[10px] uppercase tracking-[0.24em] text-ivory-100/70">
                  Filmed at the atelier
                </span>
                <span className="font-serif italic text-sm text-gold-400">Op. 47</span>
              </div>
            </div>
            {/* Small gold caption strip */}
            <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-ink-500">
              <span className="h-px w-8 bg-gold-500" />
              Bench · Mylapore, 1978
            </div>
          </motion.div>

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="space-y-6 lg:pt-2"
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
