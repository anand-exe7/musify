"use client";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Music, Sparkles, Piano, Drum } from "lucide-react";

// Three octaves starting at C3 — bigger, more expressive keyboard.
const KEYS: { note: string; freq: number; sharp?: string; sharpFreq?: number }[] = [
  { note: "C3", freq: 130.81, sharp: "C#3", sharpFreq: 138.59 },
  { note: "D3", freq: 146.83, sharp: "D#3", sharpFreq: 155.56 },
  { note: "E3", freq: 164.81 },
  { note: "F3", freq: 174.61, sharp: "F#3", sharpFreq: 185.0 },
  { note: "G3", freq: 196.0, sharp: "G#3", sharpFreq: 207.65 },
  { note: "A3", freq: 220.0, sharp: "A#3", sharpFreq: 233.08 },
  { note: "B3", freq: 246.94 },
  { note: "C4", freq: 261.63, sharp: "C#4", sharpFreq: 277.18 },
  { note: "D4", freq: 293.66, sharp: "D#4", sharpFreq: 311.13 },
  { note: "E4", freq: 329.63 },
  { note: "F4", freq: 349.23, sharp: "F#4", sharpFreq: 369.99 },
  { note: "G4", freq: 392.0, sharp: "G#4", sharpFreq: 415.3 },
  { note: "A4", freq: 440.0, sharp: "A#4", sharpFreq: 466.16 },
  { note: "B4", freq: 493.88 },
  { note: "C5", freq: 523.25, sharp: "C#5", sharpFreq: 554.37 },
  { note: "D5", freq: 587.33, sharp: "D#5", sharpFreq: 622.25 },
  { note: "E5", freq: 659.25 },
  { note: "F5", freq: 698.46, sharp: "F#5", sharpFreq: 739.99 },
  { note: "G5", freq: 783.99, sharp: "G#5", sharpFreq: 830.61 },
  { note: "A5", freq: 880.0, sharp: "A#5", sharpFreq: 932.33 },
  { note: "B5", freq: 987.77 },
  { note: "C6", freq: 1046.5 },
];

// Keyboard shortcuts — center row plays middle octave
const KEY_MAP: Record<string, string> = {
  a: "C4", w: "C#4", s: "D4", e: "D#4", d: "E4", f: "F4",
  t: "F#4", g: "G4", y: "G#4", h: "A4", u: "A#4", j: "B4",
  k: "C5", o: "C#5", l: "D5", p: "D#5", ";": "E5",
};

// Drum pad — synthesized percussion using WebAudio noise + oscillators
type DrumId = "kick" | "snare" | "hihat" | "openhat" | "tom" | "clap" | "tabla-hi" | "tabla-lo";
const DRUMS: { id: DrumId; label: string; key: string; accent?: boolean }[] = [
  { id: "kick", label: "Kick", key: "z" },
  { id: "snare", label: "Snare", key: "x" },
  { id: "hihat", label: "Hi-Hat", key: "c" },
  { id: "openhat", label: "Open", key: "v" },
  { id: "tom", label: "Tom", key: "b" },
  { id: "clap", label: "Clap", key: "n" },
  { id: "tabla-hi", label: "Tabla · Na", key: "m", accent: true },
  { id: "tabla-lo", label: "Tabla · Dha", key: ",", accent: true },
];

export function PlayableSection() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [activeDrums, setActiveDrums] = useState<Set<string>>(new Set());
  const [ripples, setRipples] = useState<{ id: number; note: string }[]>([]);
  const rippleId = useRef(0);

  const ensureCtx = () => {
    if (!audioCtxRef.current) {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      audioCtxRef.current = new Ctor();
    }
    return audioCtxRef.current!;
  };

  const play = useCallback((note: string, freq: number) => {
    const ctx = ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "triangle";
    osc2.type = "sine";
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 2;

    filter.type = "lowpass";
    filter.frequency.value = 3200;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(filter);
    filter.connect(ctx.destination);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 1.5);
    osc2.stop(now + 1.5);

    setActive((prev) => {
      const s = new Set(prev);
      s.add(note);
      return s;
    });
    window.setTimeout(() => {
      setActive((prev) => {
        const s = new Set(prev);
        s.delete(note);
        return s;
      });
    }, 220);

    const id = rippleId.current++;
    setRipples((r) => [...r, { id, note }]);
    window.setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 900);
  }, []);

  const playDrum = useCallback((id: DrumId) => {
    const ctx = ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;

    const makeNoise = (duration: number) => {
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      return src;
    };

    if (id === "kick") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(0.001, now + 0.5);
      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.5);
    } else if (id === "snare") {
      const noise = makeNoise(0.2);
      const nGain = ctx.createGain();
      const nFilt = ctx.createBiquadFilter();
      nFilt.type = "highpass"; nFilt.frequency.value = 1000;
      nGain.gain.setValueAtTime(0.6, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      noise.connect(nFilt).connect(nGain).connect(ctx.destination);
      noise.start(now); noise.stop(now + 0.2);
      const osc = ctx.createOscillator();
      const oGain = ctx.createGain();
      osc.frequency.value = 180;
      oGain.gain.setValueAtTime(0.5, now);
      oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(oGain).connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.1);
    } else if (id === "hihat" || id === "openhat") {
      const dur = id === "hihat" ? 0.05 : 0.3;
      const noise = makeNoise(dur);
      const gain = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = "highpass"; filt.frequency.value = 7000;
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      noise.connect(filt).connect(gain).connect(ctx.destination);
      noise.start(now); noise.stop(now + dur);
    } else if (id === "tom") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.3);
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.3);
    } else if (id === "clap") {
      [0, 0.01, 0.02, 0.03].forEach((t) => {
        const noise = makeNoise(0.05);
        const gain = ctx.createGain();
        const filt = ctx.createBiquadFilter();
        filt.type = "bandpass"; filt.frequency.value = 1500;
        gain.gain.setValueAtTime(0.4, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.08);
        noise.connect(filt).connect(gain).connect(ctx.destination);
        noise.start(now + t); noise.stop(now + t + 0.08);
      });
    } else if (id === "tabla-hi") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.2);
      const noise = makeNoise(0.04);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.15, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      noise.connect(nGain).connect(ctx.destination);
      noise.start(now); noise.stop(now + 0.04);
    } else if (id === "tabla-lo") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.4);
      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.4);
    }

    setActiveDrums((prev) => {
      const s = new Set(prev);
      s.add(id);
      return s;
    });
    window.setTimeout(() => {
      setActiveDrums((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }, 180);
  }, []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();

      const drum = DRUMS.find((d) => d.key === k);
      if (drum) { playDrum(drum.id); return; }

      const noteName = KEY_MAP[k];
      if (!noteName) return;
      for (const key of KEYS) {
        if (key.note === noteName) return play(key.note, key.freq);
        if (key.sharp === noteName && key.sharpFreq) return play(key.sharp!, key.sharpFreq);
      }
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [play, playDrum]);

  return (
    <section id="play" className="relative overflow-hidden bg-ivory-50 py-20 md:py-28">
      {/* Ambient staff-line texture */}
      <svg
        aria-hidden
        viewBox="0 0 1400 200"
        className="pointer-events-none absolute inset-x-0 top-10 h-40 w-full text-gold-500/15"
      >
        {[40, 70, 100, 130, 160].map((y) => (
          <line key={y} x1="0" y1={y} x2="1400" y2={y} stroke="currentColor" strokeWidth="1" />
        ))}
      </svg>

      <div className="container-page relative">
        <div className="mb-10 grid gap-6 md:grid-cols-2 md:items-end">
          <div>
            <p className="eyebrow">Try before you buy</p>
            <h2 className="heading-serif mt-4 text-display-lg text-ink-900">
              Play something,<br />
              <em>right here.</em>
            </h2>
          </div>
          <p className="max-w-md text-base text-ink-500 md:text-lg md:justify-self-end md:text-right">
            Three octaves of keyboard and a house rhythm section — tap, touch, or use your keyboard row (<kbd className="mx-0.5 rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">A</kbd>–<kbd className="mx-0.5 rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">;</kbd> for keys, <kbd className="mx-0.5 rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">Z</kbd>–<kbd className="mx-0.5 rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px]">,</kbd> for drums).
          </p>
        </div>

        {/* Piano frame */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="relative rounded-md border border-ink-800 bg-gradient-to-b from-ink-900 to-ink-950 p-4 shadow-2xl md:p-6"
        >
          {/* Nameplate */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-gold-400" />
              <span className="font-serif italic text-sm text-gold-400">Sri Saraswathy</span>
              <span className="hidden text-[10px] uppercase tracking-[0.2em] text-ivory-100/50 sm:inline">
                · Studio Grand
              </span>
            </div>
            <div className="hidden items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-ivory-100/40 md:flex">
              <Piano className="h-3 w-3" />
              3 octaves · C3–C6 · A440
            </div>
          </div>

          {/* Keys */}
          <div className="relative flex select-none overflow-x-auto rounded-sm bg-ink-950 pb-2 pt-3">
            {KEYS.map((k) => {
              const isActive = active.has(k.note);
              return (
                <div key={k.note} className="relative">
                  <button
                    onMouseDown={() => play(k.note, k.freq)}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      play(k.note, k.freq);
                    }}
                    className={`relative h-40 w-8 shrink-0 border-r border-ink-800 md:h-56 md:w-11 ${
                      isActive
                        ? "bg-gradient-to-b from-gold-200 to-gold-400"
                        : "bg-gradient-to-b from-ivory-50 to-ivory-100 hover:from-ivory-100 hover:to-gold-100"
                    } transition-colors active:from-gold-300 active:to-gold-500`}
                    aria-label={`Play ${k.note}`}
                  >
                    <span className="absolute inset-x-0 bottom-2 text-center text-[9px] font-medium uppercase tracking-widest text-ink-500">
                      {k.note.replace(/\d/, "")}
                    </span>
                  </button>

                  {k.sharp && k.sharpFreq && (
                    <button
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        play(k.sharp!, k.sharpFreq!);
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        play(k.sharp!, k.sharpFreq!);
                      }}
                      className={`absolute top-0 -right-2.5 z-10 h-24 w-5 rounded-b-sm shadow-md md:h-32 md:w-6 ${
                        active.has(k.sharp)
                          ? "bg-gradient-to-b from-gold-500 to-gold-700"
                          : "bg-gradient-to-b from-ink-800 to-ink-950 hover:from-ink-700"
                      }`}
                      aria-label={`Play ${k.sharp}`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Note ripples */}
          <div className="pointer-events-none absolute inset-x-0 -top-6 h-10 overflow-hidden">
            {ripples.map((r) => (
              <span
                key={r.id}
                className="absolute -top-2 font-serif italic text-gold-500"
                style={{
                  left: `${Math.random() * 90 + 5}%`,
                  animation: "float-up 900ms ease-out forwards",
                }}
              >
                ♪ {r.note}
              </span>
            ))}
          </div>

          {/* Bottom lip / trim */}
          <div className="mt-2 h-1 rounded-b-md bg-gradient-to-b from-gold-500/60 to-gold-700/40" />
        </motion.div>

        {/* Drum pad */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="relative mt-6 rounded-md border border-ink-800 bg-gradient-to-b from-ink-900 to-ink-950 p-4 shadow-2xl md:p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-gold-400" />
              <span className="font-serif italic text-sm text-gold-400">Rhythm Section</span>
              <span className="hidden text-[10px] uppercase tracking-[0.2em] text-ivory-100/50 sm:inline">
                · Kit + Tabla
              </span>
            </div>
            <div className="hidden items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-ivory-100/40 md:flex">
              <Drum className="h-3 w-3" />
              Eight pads
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 md:grid-cols-8">
            {DRUMS.map((d) => {
              const isActive = activeDrums.has(d.id);
              return (
                <button
                  key={d.id}
                  onMouseDown={() => playDrum(d.id)}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    playDrum(d.id);
                  }}
                  className={`group relative aspect-square rounded-lg border transition-all ${
                    isActive
                      ? "scale-95 border-gold-400 bg-gradient-to-br from-gold-300 to-gold-500 shadow-gold"
                      : d.accent
                      ? "border-gold-500/40 bg-gradient-to-br from-ink-800 to-ink-900 hover:border-gold-400 hover:from-ink-700"
                      : "border-ink-700 bg-gradient-to-br from-ink-800 to-ink-900 hover:border-gold-400/60 hover:from-ink-700"
                  }`}
                  aria-label={`Play ${d.label}`}
                >
                  <span className={`absolute inset-x-0 top-3 text-center text-[10px] font-semibold uppercase tracking-[0.18em] ${
                    isActive ? "text-ink-900" : d.accent ? "text-gold-400" : "text-ivory-100/80"
                  }`}>
                    {d.label}
                  </span>
                  <span className={`absolute inset-x-0 bottom-3 text-center font-mono text-[10px] ${
                    isActive ? "text-ink-900/70" : "text-ivory-100/40"
                  }`}>
                    {d.key.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-2 h-1 rounded-b-md bg-gradient-to-b from-gold-500/60 to-gold-700/40" />
        </motion.div>

        {/* CTA row */}
        <div className="mt-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <p className="max-w-lg text-sm text-ink-500">
            <Sparkles className="mr-1.5 inline h-4 w-4 text-gold-500" />
            Real pianos in the shop include Steinway Model D, Yamaha C5X, Kawai GX-2. Come play the actual instrument in Chennai or Bengaluru.
          </p>
          <div className="flex gap-3">
            <a href="/shop?category=keyboard" className="btn-gold-solid">
              Shop keyboards
            </a>
            <a href="/shop?category=percussion" className="inline-flex items-center gap-2 rounded-full border border-ink-900 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink-900 transition-all hover:border-gold-500 hover:bg-gold-50 hover:text-gold-700">
              Shop percussion
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes float-up {
          0% { transform: translateY(0); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateY(-40px); opacity: 0; }
        }
      `}</style>
    </section>
  );
}
