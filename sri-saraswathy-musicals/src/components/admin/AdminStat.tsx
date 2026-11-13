"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TrendingUp, TrendingDown, X, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type Accent = "ink" | "gold" | "green" | "danger" | "info" | "violet";

const ACCENT: Record<Accent, { bar: string; valueTone: string; iconTone: string; soft: string }> = {
  ink:    { bar: "from-ink-900/90 to-ink-700", valueTone: "text-ink-900",  iconTone: "bg-ink-900/5 text-ink-700",    soft: "bg-ink-900/[0.04]" },
  gold:   { bar: "from-gold-500 to-gold-300",  valueTone: "text-gold-700", iconTone: "bg-gold-500/10 text-gold-700", soft: "bg-gold-500/[0.07]" },
  green:  { bar: "from-success to-success/60", valueTone: "text-success",  iconTone: "bg-success/10 text-success",   soft: "bg-success/[0.06]" },
  danger: { bar: "from-danger to-danger/60",   valueTone: "text-danger",   iconTone: "bg-danger/10 text-danger",     soft: "bg-danger/[0.06]" },
  info:   { bar: "from-info to-info/60",       valueTone: "text-info",     iconTone: "bg-info/10 text-info",         soft: "bg-info/[0.06]" },
  violet: { bar: "from-[#8B5CF6] to-[#C4B5FD]", valueTone: "text-[#6D28D9]", iconTone: "bg-[#8B5CF6]/10 text-[#6D28D9]", soft: "bg-[#8B5CF6]/[0.06]" },
};

/** One line in a tile's details pop-up. `tone` colours the value: plus (green), minus (red), total (bold). */
export interface StatDetail {
  label: string;
  value: string;
  tone?: "plus" | "minus" | "total" | "muted";
}

interface Props {
  label: string;
  value: string;
  hint?: string;
  accent?: Accent;
  icon?: React.ReactNode;
  change?: number;
  className?: string;
  /** Shown in the pop-up that opens when the tile is clicked — how the figure is made up. */
  details?: StatDetail[];
  /** A short explanation shown at the bottom of the pop-up. */
  note?: React.ReactNode;
}

/** Long amounts step down a size so they always fit the tile (the pop-up always shows them in full). */
function valueSize(v: string): string {
  if (v.length > 16) return "text-[20px] md:text-[22px]";
  if (v.length > 12) return "text-[23px] md:text-[26px]";
  return "text-[26px] md:text-[30px]";
}

/**
 * The one stat tile the admin pages use — a card with a soft gradient accent bar on top, a small label, a large
 * number and an optional hint or trend chip. Clicking it opens a pop-up with the full figure and, when given, the
 * lines it is made of — so an amount is never lost to a narrow screen.
 */
export function AdminStat({ label, value, hint, accent = "ink", icon, change, className, details, note }: Props) {
  const a = ACCENT[accent];
  const positive = (change ?? 0) >= 0;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Click for details"
        className={cn(
          "group relative w-full min-w-0 overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50 p-3.5 text-left sm:p-5",
          "shadow-[0_1px_2px_rgba(10,9,8,0.03)] transition-all hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-[0_8px_24px_-12px_rgba(10,9,8,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/40",
          className,
        )}
      >
        <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", a.bar)} />
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <p className="min-w-0 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-500 sm:tracking-[0.2em]">{label}</p>
          {icon ? (
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", a.iconTone)}>{icon}</span>
          ) : (
            <Maximize2 className="h-3.5 w-3.5 shrink-0 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
          )}
        </div>
        <p className={cn("mt-3 truncate font-bold leading-none tabular-nums tracking-tight", valueSize(value), a.valueTone)}>{value}</p>
        <div className="mt-2.5 flex min-w-0 items-center gap-2 text-xs">
          {change !== undefined && (
            <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
              {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(change)}%
            </span>
          )}
          {hint && <span className="line-clamp-2 text-ink-500">{hint}</span>}
        </div>
      </button>
      {open && <StatModal label={label} value={value} hint={hint} accent={accent} icon={icon} details={details} note={note} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The details pop-up of a stat tile. */
export function StatModal({ label, value, hint, accent = "ink", icon, details, note, onClose }: Omit<Props, "className" | "change"> & { onClose: () => void }) {
  const a = ACCENT[accent];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-950/45 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label={label} className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-ivory-50 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className={cn("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r", a.bar)} />
        <div className="flex items-start justify-between gap-3 px-6 pb-2 pt-6">
          <div className="flex items-center gap-2.5">
            {icon && <span className={cn("grid h-9 w-9 place-items-center rounded-full", a.iconTone)}>{icon}</span>}
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-500">{label}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 pb-6">
          <p className={cn("break-all text-4xl font-bold tabular-nums tracking-tight", a.valueTone)}>{value}</p>
          {hint && <p className="mt-2 text-sm text-ink-500">{hint}</p>}
          {details && details.length > 0 && (
            <dl className={cn("mt-5 divide-y divide-ink-100 rounded-xl border border-ink-100", a.soft)}>
              {details.map((d, i) => (
                <div key={i} className={cn("flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm", d.tone === "total" && "bg-white/70")}>
                  <dt className={cn("min-w-0 text-ink-600", d.tone === "total" && "font-bold text-ink-900")}>{d.label}</dt>
                  <dd className={cn("shrink-0 text-right font-semibold tabular-nums",
                    d.tone === "plus" ? "text-success" : d.tone === "minus" ? "text-danger" : d.tone === "muted" ? "text-ink-400" : d.tone === "total" ? "text-base font-bold text-ink-900" : "text-ink-900")}>
                    {d.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {note && <p className="mt-4 text-xs leading-relaxed text-ink-500">{note}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
