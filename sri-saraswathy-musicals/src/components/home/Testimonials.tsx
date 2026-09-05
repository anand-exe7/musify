"use client";
import Image from "next/image";
import { Star } from "lucide-react";

const voices = [
  {
    quote:
      "I have been a concertmaster for twenty years. This is the first time a shop gave me an afternoon of quiet with the instrument before asking for a decision.",
    name: "Elena Rosza",
    role: "Concertmaster · Berlin Phil.",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
  {
    quote:
      "The piano arrived at 10 in the morning. By 4 in the afternoon a technician had tuned it to the humidity of my room. I did not ask for that.",
    name: "Víkingur Ólafsson",
    role: "Pianist · Iceland",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
  {
    quote:
      "My son's first serious veena. Krishnan sat him down for an hour and taught him to hold it. Not a sales pitch — a lesson. Customers for life.",
    name: "M. & Mme. Iyer",
    role: "Parents · Chennai",
    avatar:
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
  {
    quote:
      "Ordered a mridangam from Mylapore, delivered to Bangalore in three days, already tuned to the room I recorded in. Uncommon service.",
    name: "Anoushka Menon",
    role: "Percussionist · Bengaluru",
    avatar:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
  {
    quote:
      "They handed me four bows and told me to walk to the back of the shop and play. That is a shop that trusts its customers to know what they want.",
    name: "Daniel Hope",
    role: "Violinist · London",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
  {
    quote:
      "The tanpura they built for the ashram has been played every dawn for eleven years. Two annual tunings. Nothing else needed replacing.",
    name: "Swami R. Bhaskar",
    role: "Ashram · Rishikesh",
    avatar:
      "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80",
  },
];

// Duplicate the list for a seamless loop.
const marquee = [...voices, ...voices];

export function Testimonials() {
  return (
    <section className="relative overflow-hidden border-y border-ink-100 bg-ivory-100 py-20 md:py-28">
      <div className="container-page">
        <div className="mb-14 text-center">
          <p className="eyebrow centered">In the hands of</p>
          <h2 className="heading-serif mx-auto mt-4 max-w-3xl text-display-lg text-ink-900">
            Musicians who came for one instrument<br />and left a <em>letter.</em>
          </h2>
        </div>
      </div>

      {/* Marquee lane 1 — left */}
      <div className="group relative">
        <div className="marquee-track flex w-max gap-6 px-6" style={{ animationDuration: "60s" }}>
          {marquee.map((v, i) => (
            <TestimonialCard key={`m1-${i}`} v={v} />
          ))}
        </div>
      </div>

      {/* Marquee lane 2 — reverse */}
      <div className="group relative mt-6">
        <div
          className="marquee-track flex w-max gap-6 px-6"
          style={{ animationDuration: "75s", animationDirection: "reverse" }}
        >
          {marquee.map((v, i) => (
            <TestimonialCard key={`m2-${i}`} v={v} muted />
          ))}
        </div>
      </div>

      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-ivory-100 to-transparent md:w-32" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-ivory-100 to-transparent md:w-32" />

      <style jsx>{`
        .marquee-track {
          animation: marquee linear infinite;
        }
        .group:hover .marquee-track {
          animation-play-state: paused;
        }
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none; }
        }
      `}</style>
    </section>
  );
}

function TestimonialCard({
  v,
  muted,
}: {
  v: (typeof voices)[number];
  muted?: boolean;
}) {
  return (
    <figure
      className={`shrink-0 border p-6 shadow-sm md:p-7 ${
        muted ? "border-ink-100 bg-ivory-50" : "border-gold-200 bg-white"
      }`}
      style={{ width: "min(90vw, 420px)" }}
    >
      <div className="flex items-center gap-1 text-gold-500">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
        ))}
      </div>
      <blockquote className="mt-4 font-serif italic text-lg leading-snug text-ink-800">
        &ldquo;{v.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-t border-ink-100 pt-4">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-gold-300">
          <Image src={v.avatar} alt="" fill sizes="40px" className="object-cover" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm text-ink-900">{v.name}</p>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.2em] text-ink-500">
            {v.role}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
