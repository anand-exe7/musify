"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, X } from "lucide-react";
import { useOrderAlerts } from "@/lib/store/orderAlerts";
import { formatINR } from "@/lib/utils";
import { branchLabel } from "@/lib/stock";

/** "New online order" pop-ups that appear when an order arrives while the admin is open. Click one to open the order. */
export function OrderToasts() {
  const router = useRouter();
  const toasts = useOrderAlerts((s) => s.toasts);
  const dismiss = useOrderAlerts((s) => s.dismiss);

  // each one clears itself after a while
  useEffect(() => {
    const timers = toasts.map((t) => window.setTimeout(() => dismiss(t.id), 12_000));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[min(92vw,22rem)] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-gold-500/40 bg-ivory-50 p-3.5 shadow-2xl">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-500/15 text-gold-700"><ShoppingBag className="h-4 w-4" /></span>
          <button
            className="min-w-0 flex-1 text-left"
            onClick={() => { dismiss(t.id); router.push(`/admin/orders/${encodeURIComponent(t.id)}`); }}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold-700">New online order</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-ink-900">{t.customerName || "Online customer"} · {formatINR(t.total)}</p>
            <p className="text-[11px] text-ink-500">{t.id} · {branchLabel(t.branch)}</p>
          </button>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-ink-900/5 hover:text-ink-800"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  );
}
