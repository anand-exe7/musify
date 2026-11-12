"use client";
import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Star, PenLine, X, Trash2, Check } from "lucide-react";
import { useLocalReviews, type LocalReview } from "@/lib/client/reviews";

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
  const { reviews, add, remove } = useLocalReviews();
  const [open, setOpen] = useState(false);

  return (
    <section className="relative overflow-hidden border-y border-ink-100 bg-ivory-100 py-16 md:py-24">
      <div className="container-page">
        <div className="mb-10 text-center">
          <p className="eyebrow centered">In the hands of</p>
          <h2 className="heading-serif mx-auto mt-4 max-w-3xl text-display-lg text-ink-900">
            Musicians who came for one instrument<br />and left a <em>letter.</em>
          </h2>
          <button
            onClick={() => setOpen(true)}
            className="btn-ghost mx-auto mt-7"
          >
            <PenLine className="h-3.5 w-3.5" />
            Write a review
          </button>
        </div>

        {/* Reviews written on this device. Kept in this browser only — never sent anywhere. */}
        {reviews.length > 0 && (
          <div className="mb-12">
            <p className="mb-4 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-700">
              Saved on this device
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence initial={false}>
                {reviews.map((r) => (
                  <motion.figure
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className="relative rounded-2xl border border-gold-300 bg-ivory-50 p-6"
                  >
                    <button
                      onClick={() => remove(r.id)}
                      aria-label="Delete this review"
                      className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-ink-300 transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <Stars n={r.rating} />
                    <blockquote className="mt-4 text-pretty text-[15px] leading-snug text-ink-800">
                      &ldquo;{r.quote}&rdquo;
                    </blockquote>
                    <figcaption className="mt-5 border-t border-ink-100 pt-4">
                      <p className="text-sm font-semibold text-ink-900">{r.name}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-ink-500">
                        {r.role || new Date(r.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </figcaption>
                  </motion.figure>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
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

      <ReviewDialog open={open} onClose={() => setOpen(false)} onSave={add} />

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

function Stars({ n, className = "" }: { n: number; className?: string }) {
  return (
    <div className={`flex items-center gap-1 text-gold-500 ${className}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < n ? "fill-current" : "fill-ink-200 text-ink-200"}`} strokeWidth={0} />
      ))}
    </div>
  );
}

function ReviewDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (r: Omit<LocalReview, "id" | "at">) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [rating, setRating] = useState(5);
  const [quote, setQuote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return setErr("Please add your name.");
    if (quote.trim().length < 10) return setErr("Tell us a little more — at least a sentence.");
    onSave({ name: name.trim(), role: role.trim(), rating, quote: quote.trim() });
    setName("");
    setRole("");
    setQuote("");
    setRating(5);
    setErr(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-ink-950/60 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="my-auto w-full max-w-lg rounded-3xl border border-ink-100 bg-ivory-50 p-6 shadow-2xl md:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="heading-serif text-2xl text-ink-900">Write a review</h3>
                <p className="mt-1 text-xs text-ink-500">Saved in this browser only — nothing is published.</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-900/5 hover:text-ink-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Your name</span>
                  <input value={name} onChange={(e) => { setName(e.target.value); setErr(null); }} className="field" placeholder="Full name" />
                </label>
                <label className="block">
                  <span className="field-label">You are (optional)</span>
                  <input value={role} onChange={(e) => setRole(e.target.value)} className="field" placeholder="e.g. Violinist · Chennai" />
                </label>
              </div>

              <div>
                <span className="field-label">Rating</span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star className={`h-6 w-6 ${n <= rating ? "fill-gold-500 text-gold-500" : "fill-ink-200 text-ink-200"}`} strokeWidth={0} />
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="field-label">Your review</span>
                <textarea
                  value={quote}
                  onChange={(e) => { setQuote(e.target.value); setErr(null); }}
                  rows={4}
                  className="field resize-none"
                  placeholder="What was the instrument, and how did the shop treat you?"
                />
              </label>

              {err && <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <button onClick={submit} className="btn-gold-solid flex-1">
                  <Check className="h-3.5 w-3.5" /> Save review
                </button>
                <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
      className={`shrink-0 rounded-2xl border p-6 shadow-sm md:p-7 ${
        muted ? "border-ink-100 bg-ivory-50" : "border-gold-200 bg-white"
      }`}
      style={{ width: "min(88vw, 420px)" }}
    >
      <Stars n={5} />
      <blockquote className="mt-4 text-pretty text-[17px] leading-snug text-ink-800">
        &ldquo;{v.quote}&rdquo;
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-t border-ink-100 pt-4">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-gold-300">
          <Image src={v.avatar} alt="" fill sizes="40px" className="object-cover" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">{v.name}</p>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.2em] text-ink-500">
            {v.role}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
