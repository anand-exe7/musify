"use client";
import { cn } from "@/lib/utils";

/**
 * A labelled segmented control for report filters (Period, Channel, Branch, Tax…). Options sit in one soft tray and
 * the chosen one lifts out as a white chip — calmer than a row of round pills, and it scrolls sideways on a phone
 * instead of wrapping.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label?: string;
  value: T;
  options: readonly (readonly [T, React.ReactNode])[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {label && <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">{label}</span>}
      <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex gap-0.5 rounded-xl bg-ink-900/[0.05] p-1">
          {options.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange(k)}
              aria-pressed={value === k}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                value === k ? "bg-white text-ink-900 shadow-[0_1px_3px_rgba(10,9,8,0.12)]" : "text-ink-500 hover:text-ink-900",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
