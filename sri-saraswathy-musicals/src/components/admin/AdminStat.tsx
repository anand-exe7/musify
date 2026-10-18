"use client";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "ink" | "gold" | "green" | "danger" | "info";

const ACCENT: Record<Accent, { bar: string; valueTone: string; iconTone: string; glow: string }> = {
  ink:    { bar: "from-ink-900/90 to-ink-700", valueTone: "text-ink-900",  iconTone: "bg-ink-900/5 text-ink-700",     glow: "" },
  gold:   { bar: "from-gold-500 to-gold-300",  valueTone: "text-gold-700", iconTone: "bg-gold-500/10 text-gold-700",  glow: "" },
  green:  { bar: "from-success to-success/60", valueTone: "text-success",  iconTone: "bg-success/10 text-success",    glow: "" },
  danger: { bar: "from-danger to-danger/60",   valueTone: "text-danger",   iconTone: "bg-danger/10 text-danger",      glow: "" },
  info:   { bar: "from-info to-info/60",       valueTone: "text-info",     iconTone: "bg-info/10 text-info",          glow: "" },
};

interface Props {
  label: string;
  value: string;
  hint?: string;
  accent?: Accent;
  icon?: React.ReactNode;
  change?: number;
  className?: string;
}

/**
 * The one stat tile the admin pages use — a card with a soft gradient accent
 * bar on top, a tiny eyebrow label, a large tabular number, and an optional
 * hint or trend chip. Icon sits in a rounded tinted badge, top-right.
 */
export function AdminStat({ label, value, hint, accent = "ink", icon, change, className }: Props) {
  const a = ACCENT[accent];
  const positive = (change ?? 0) >= 0;
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50 p-5",
        "shadow-[0_1px_2px_rgba(10,9,8,0.03)] transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(10,9,8,0.14)]",
        className,
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", a.bar)} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-500">{label}</p>
        {icon && (
          <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", a.iconTone)}>
            {icon}
          </span>
        )}
      </div>
      <p className={cn("mt-3 text-[26px] font-bold leading-none tabular-nums tracking-tight md:text-[30px]", a.valueTone)}>
        {value}
      </p>
      <div className="mt-2.5 flex items-center gap-2 text-xs">
        {change !== undefined && (
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
          )}>
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(change)}%
          </span>
        )}
        {hint && <span className="text-ink-500">{hint}</span>}
      </div>
    </div>
  );
}
