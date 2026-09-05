"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin, Phone, ArrowRight, Clock, Navigation } from "lucide-react";
import { useState } from "react";

const branches = [
  {
    id: "chennai",
    city: "Chennai",
    branch: "Mylapore",
    street: "14 Kutchery Road, Mylapore",
    zip: "Chennai 600004",
    hours: "Mon — Sat · 10:00 to 20:00",
    phone: "+91 44 2464 1234",
    // Google Maps embed for Kutchery Road, Mylapore
    map: "https://www.google.com/maps?q=Kutchery+Road+Mylapore+Chennai&output=embed",
    directions: "https://www.google.com/maps/dir/?api=1&destination=Kutchery+Road+Mylapore+Chennai",
  },
  {
    id: "bengaluru",
    city: "Bengaluru",
    branch: "Basavanagudi",
    street: "62 Gandhi Bazaar Main Road",
    zip: "Bengaluru 560004",
    hours: "Tue — Sun · 10:30 to 20:30",
    phone: "+91 80 2661 5678",
    map: "https://www.google.com/maps?q=Gandhi+Bazaar+Basavanagudi+Bengaluru&output=embed",
    directions:
      "https://www.google.com/maps/dir/?api=1&destination=Gandhi+Bazaar+Basavanagudi+Bengaluru",
  },
];

export function Visit() {
  const [active, setActive] = useState<string>("chennai");
  const activeBranch = branches.find((b) => b.id === active)!;

  return (
    <section id="visit" className="py-24 md:py-32">
      <div className="container-page">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-2xl text-center"
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

        {/* Branch tabs + interactive map */}
        <div className="mt-16 grid gap-8 lg:grid-cols-[minmax(280px,380px)_1fr] lg:gap-12">
          {/* Branch selector */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-600">
              Select a branch
            </p>
            {branches.map((b) => {
              const isActive = b.id === active;
              return (
                <button
                  key={b.id}
                  onClick={() => setActive(b.id)}
                  className={`group block w-full border p-6 text-left transition-all ${
                    isActive
                      ? "border-gold-500 bg-ink-900 text-ivory-100 shadow-lg"
                      : "border-ink-100 bg-ivory-50 hover:border-gold-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className={`text-[10px] uppercase tracking-[0.24em] ${
                          isActive ? "text-gold-400" : "text-gold-600"
                        }`}
                      >
                        Branch
                      </p>
                      <div className="mt-2 flex items-baseline gap-2">
                        <h3
                          className={`heading-serif text-2xl ${
                            isActive ? "text-ivory-50" : "text-ink-900"
                          }`}
                        >
                          {b.city}
                        </h3>
                        <span
                          className={`font-serif italic text-sm ${
                            isActive ? "text-gold-400" : "text-gold-600"
                          }`}
                        >
                          {b.branch}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-all ${
                        isActive
                          ? "bg-gold-500 text-ink-900"
                          : "border border-ink-200 text-ink-500 group-hover:border-gold-400 group-hover:text-gold-600"
                      }`}
                    >
                      <MapPin className="h-4 w-4" />
                    </span>
                  </div>
                  <div
                    className={`mt-4 space-y-2 text-sm ${
                      isActive ? "text-ivory-100/80" : "text-ink-600"
                    }`}
                  >
                    <p className="flex items-start gap-2">
                      <MapPin
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          isActive ? "text-gold-400" : "text-gold-500"
                        }`}
                      />
                      <span>
                        {b.street}
                        <br />
                        {b.zip}
                      </span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Phone
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isActive ? "text-gold-400" : "text-gold-500"
                        }`}
                      />
                      <span>{b.phone}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Clock
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isActive ? "text-gold-400" : "text-gold-500"
                        }`}
                      />
                      <span>{b.hours}</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Live map */}
          <motion.div
            key={activeBranch.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden border border-ink-100 bg-ink-100"
            style={{ minHeight: "480px" }}
          >
            <iframe
              key={activeBranch.map}
              title={`Map of ${activeBranch.city}`}
              src={activeBranch.map}
              className="absolute inset-0 h-full w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              style={{ border: 0, filter: "grayscale(0.35) contrast(1.05)" }}
            />

            {/* Overlay chip with the address */}
            <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[280px] rounded-sm border border-gold-400 bg-ivory-50/95 p-4 shadow-lg backdrop-blur-sm">
              <p className="text-[9px] uppercase tracking-[0.22em] text-gold-600">You are here</p>
              <p className="heading-serif mt-1 text-lg text-ink-900">
                {activeBranch.city} · {activeBranch.branch}
              </p>
              <p className="mt-1 text-xs text-ink-600">{activeBranch.street}</p>
            </div>

            <a
              href={activeBranch.directions}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-2 rounded-full bg-gold-500 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-900 shadow-lg transition-all hover:bg-gold-400 hover:shadow-gold"
            >
              <Navigation className="h-3.5 w-3.5" />
              Get directions
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
