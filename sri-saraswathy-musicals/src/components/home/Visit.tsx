"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin, Phone, ArrowRight } from "lucide-react";

const branches = [
  {
    city: "Chennai",
    branch: "Mylapore",
    street: "14 Kutchery Road, Mylapore",
    zip: "Chennai 600004",
    hours: "Mon — Sat · 10:00 to 20:00",
    phone: "+91 44 2464 1234",
  },
  {
    city: "Bengaluru",
    branch: "Basavanagudi",
    street: "62 Gandhi Bazaar Main Road",
    zip: "Bengaluru 560004",
    hours: "Tue — Sun · 10:30 to 20:30",
    phone: "+91 80 2661 5678",
  },
];

export function Visit() {
  return (
    <section id="visit" className="py-24 md:py-32">
      <div className="container-narrow text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <p className="eyebrow centered">Fin</p>
          <h2 className="heading-serif mx-auto mt-6 max-w-2xl text-display-xl text-ink-900">
            Come <em>play</em> something.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base text-ink-500 md:text-lg">
            Both shops are open by walk-in or appointment. Bring an instrument you already own, or come meet ours. A pot of coffee is always on. There is no obligation to buy anything, only to listen.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/shop" className="btn-gold-solid">
              Browse instruments
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link href="#" className="btn-ghost">
              Book a fitting
            </Link>
          </div>
        </motion.div>

        <div className="mt-20 grid gap-8 border-t border-ink-100 pt-16 text-left md:grid-cols-2 md:gap-12">
          {branches.map((b) => (
            <div key={b.city} className="group">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-600">Branch</p>
              <div className="mt-3 flex items-baseline gap-3">
                <h3 className="heading-serif text-3xl text-ink-900">{b.city}</h3>
                <span className="font-serif italic text-gold-600">{b.branch}</span>
              </div>
              <div className="mt-5 space-y-3 text-sm text-ink-600">
                <p className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
                  <span>{b.street}<br />{b.zip}</span>
                </p>
                <p className="flex items-center gap-3">
                  <Phone className="h-4 w-4 shrink-0 text-gold-500" />
                  <span>{b.phone}</span>
                </p>
              </div>
              <p className="mt-4 border-t border-ink-100 pt-4 text-xs uppercase tracking-[0.2em] text-ink-500">
                {b.hours}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
