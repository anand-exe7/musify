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
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className={cn(
        "border border-ink-100 bg-ivory-50 p-5 md:p-6",
        accent === "gold" && "border-l-2 border-l-gold-500",
        accent === "maroon" && "border-l-2 border-l-maroon-500",
        accent === "ink" && "border-l-2 border-l-ink-900",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-500">{label}</p>
      <p className="tabular mt-3 font-display text-3xl text-ink-900 md:text-4xl">{value}</p>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {change !== undefined && (
          <span className={cn("flex items-center gap-1 font-semibold", positive ? "text-success" : "text-danger")}>
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(change)}%
          </span>
        )}
        {hint && <span className="text-ink-400">{hint}</span>}
      </div>
    </motion.div>
  );
}
