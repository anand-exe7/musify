"use client";
import { motion } from "framer-motion";

const voices = [
  {
    quote:
      "I have been a concertmaster for twenty years. I have bought many violins. This is the first time a shop gave me an afternoon of quiet with the instrument before asking for a decision.",
    name: "Elena Rosza",
    role: "Concertmaster · Berlin Phil.",
    featured: true,
  },
  {
    quote:
      "The piano arrived at 10 in the morning. By 4 in the afternoon a technician had tuned it to the humidity of my room. I did not ask for that.",
    name: "Víkingur Ólafsson",
    role: "Pianist · Iceland",
  },
  {
    quote:
      "My son's first serious veena. Krishnan sat him down for an hour and taught him to hold it. Not a sales pitch — a lesson. Customers for life.",
    name: "M. & Mme. Iyer",
    role: "Parents · Chennai",
  },
];

export function Testimonials() {
  return (
    <section className="border-y border-ink-100 py-20 md:py-28">
      <div className="container-page">
        <div className="mb-14 text-center">
          <p className="eyebrow centered">In the hands of</p>
          <h2 className="heading-serif mx-auto mt-4 max-w-3xl text-display-lg text-ink-900">
            Musicians who came for one instrument<br />and left a <em>letter.</em>
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {voices.map((v, i) => (
            <motion.div
              key={v.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className={`flex flex-col justify-between border p-6 md:p-8 ${
                v.featured ? "border-gold-400 bg-gold-50/50 md:col-span-1" : "border-ink-100 bg-ivory-50"
              }`}
            >
              <div>
                <span className="font-display text-5xl leading-[0.4] text-gold-500">"</span>
                <p className={`mt-2 font-serif italic ${v.featured ? "text-xl" : "text-lg"} text-ink-800`}>
                  {v.quote}
                </p>
              </div>
              <div className="mt-6 border-t border-ink-100 pt-4">
                <p className="font-display text-base text-ink-900">{v.name}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-ink-400">{v.role}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
