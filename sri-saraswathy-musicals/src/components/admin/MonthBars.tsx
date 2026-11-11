"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface MonthBarSeries {
  key: string;
  label: string;
  /** Any CSS colour. */
  color: string;
}

/**
 * Twelve monthly bars for one year. Bars sit in a fixed-height track (so their heights always resolve), may be
 * stacked by series, and hovering — or tapping on a phone — a month shows its figures in a box kept inside the chart
 * (it opens rightwards on the first half of the year, leftwards on the second).
 */
export function MonthBars({
  totals,
  parts,
  series,
  year,
  format,
  height = 176,
  color = "#0A0908",
  activeColor = "#C9A24B",
  unit,
}: {
  /** Twelve totals, Jan → Dec. */
  totals: number[];
  /** Per month, the value of each series (stacked bars). */
  parts?: Record<string, number>[];
  series?: MonthBarSeries[];
  year: number;
  format: (n: number) => string;
  height?: number;
  color?: string;
  activeColor?: string;
  /** Extra line in the tooltip, e.g. "bills". */
  unit?: (month: number) => string | undefined;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...totals, 1);
  const now = new Date();
  const thisMonth = now.getFullYear() === year ? now.getMonth() : -1;

  return (
    <div className="relative select-none" onMouseLeave={() => setHover(null)}>
      {/* Faint guide lines at 50% and 100% */}
      <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height }}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-ink-100" />
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-ink-100" />
        <span className="absolute right-0 top-0 -translate-y-full pb-0.5 text-[9px] tabular-nums text-ink-300">{format(max)}</span>
      </div>
      <div className="relative flex items-end gap-1 sm:gap-1.5" style={{ height }}>
        {totals.map((v, i) => {
          const h = v > 0 ? Math.max(3, (v / max) * 100) : 0;
          const active = hover === i;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(active ? null : i)}
              aria-label={`${MONTHS[i]} ${year}: ${format(v)}`}
              className="group relative flex h-full flex-1 items-end focus:outline-none"
            >
              <span className={cn("absolute inset-0 rounded-md transition-colors", active ? "bg-gold-500/10" : "group-hover:bg-ink-900/[0.03]")} />
              {v > 0 ? (
                <span className="relative flex w-full flex-col-reverse overflow-hidden rounded-t-md transition-[height] duration-500" style={{ height: `${h}%` }}>
                  {series && parts?.[i]
                    ? series.map((s) =>
                        (parts[i][s.key] ?? 0) > 0 ? <span key={s.key} className="block w-full" style={{ height: `${((parts[i][s.key] ?? 0) / v) * 100}%`, background: s.color, opacity: hover === null || active ? 1 : 0.55 }} /> : null,
                      )
                    : <span className="block h-full w-full" style={{ background: active ? activeColor : color }} />}
                </span>
              ) : (
                <span className="relative block h-[3px] w-full rounded-full bg-ink-100" />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1 sm:gap-1.5">
        {MONTHS.map((m, i) => (
          <span key={m} className={cn("flex-1 text-center text-[9px] uppercase tracking-wide sm:text-[10px]", hover === i ? "font-bold text-ink-900" : i === thisMonth ? "font-semibold text-gold-700" : "text-ink-400")}>{m}</span>
        ))}
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-48 rounded-xl border border-ink-100 bg-white p-3 text-xs shadow-xl"
          style={hover < 6 ? { left: `calc(${((hover + 1) / 12) * 100}% + 4px)` } : { right: `calc(${((12 - hover) / 12) * 100}% + 4px)` }}
        >
          <p className="font-bold text-ink-900">{MONTHS[hover]} {year}</p>
          <p className="mt-1 text-base font-bold tabular-nums text-ink-900">{format(totals[hover])}</p>
          {unit?.(hover) && <p className="text-ink-500">{unit(hover)}</p>}
          {series && parts?.[hover] && (
            <div className="mt-1.5 space-y-0.5 border-t border-ink-100 pt-1.5">
              {series.map((s) => (
                <p key={s.key} className="flex items-center justify-between gap-2 text-ink-600">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
                  <span className="tabular-nums">{format(parts[hover][s.key] ?? 0)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
