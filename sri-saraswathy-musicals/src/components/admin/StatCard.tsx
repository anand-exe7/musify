"use client";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  change?: number; // %
  hint?: string;
  accent?: "gold" | "ink" | "maroon";
  index?: number;
}

export function StatCard({ label, value, change, hint, accent = "ink", index = 0 }: Props) {
  const positive = (change ?? 0) >= 0;
  const accentClasses: Record<NonNullable<Props["accent"]>, string> = {
    gold: "before:bg-gold-500",
    maroon: "before:bg-maroon-500",
    ink: "before:bg-ink-900",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6",
        "shadow-[0_1px_2px_rgba(10,9,8,0.03)] transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(10,9,8,0.14)]",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-1",
        accentClasses[accent],
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">{label}</p>
      <p className="mt-3 text-[28px] font-bold tabular-nums tracking-tight text-ink-900 md:text-[32px]">{value}</p>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {change !== undefined && (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
            positive ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
          )}>
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(change)}%
          </span>
        )}
        {hint && <span className="text-ink-400">{hint}</span>}
      </div>
    </motion.div>
  );
}
